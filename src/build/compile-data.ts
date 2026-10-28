// pnpm compile:data: content (+ seed when BK_SEED=1) → public/data/index.json and one tile per
// live era (/data/tiles/<era>.json), with gzip budgets. Also runs from an Astro integration at
// build start and dev-server start. The contract is src/lib/core/datafiles.ts.
//
// - Validates first and fails on any error.
// - seed/ is overlaid only when BK_SEED=1, so it never reaches production.
// - Only canon "shared" items are compiled (the MVP).
// - Output is deterministic apart from buildId: records are sorted by id, layout is stable.
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { AstroIntegration } from 'astro';
import {
  DATA_VERSION,
  INDEX_FILE,
  tileFile,
  type IndexEra,
  type IndexFile,
  type IndexStream,
  type TileAxis,
  type TileFile,
  type Unassigned,
  type UnplacedCounts,
} from '../lib/core/datafiles';
import {
  COLLECTIONS,
  type Anchor,
  type CollectionName,
  type Era,
  type Event,
  type Person,
  type Reign,
  type Source,
  type Stream,
} from '../lib/core/schema';
import { layoutStreams, type AxisLayout, type Unplaced } from '../lib/layout/streams';
import { buildTimescaleConfig, x, type Axis, type TimescaleConfig } from '../lib/layout/timescale';
import { checkProductionGuard } from './copy-scripture';
import { formatText, validateContent } from './validate-content';
import { readBookFiles, resolveScriptureEnv } from './verify-scripture';

type Env = Record<string, string | undefined>;

export interface Logger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

/** Gzipped size limits in bytes (architecture §5). */
export interface Budgets {
  index: number;
  tile: number;
}
export const BUDGETS: Budgets = { index: 30 * 1024, tile: 100 * 1024 };
/** Share of a budget at which the summary warns. */
export const WARN_AT = 0.8;

export interface CompileOptions {
  contentDir: string;
  seedDir?: string;
  outDir: string;
  env: Env;
  logger?: Logger;
  budgets?: Budgets;
  /** Defaults to BK_BUILD_ID, CF_PAGES_COMMIT_SHA, the git SHA, then a timestamp. */
  buildId?: string;
  /** Defaults to the verified books copy-scripture publishes. */
  scriptureBooks?: string[];
  lockFile?: string;
  /** Validation reads the scripture books for refs; tests point it at the fixtures. */
  scriptureDir?: string;
}

export interface FileReport {
  file: string;
  bytes: number;
  gzip: number;
  budget: number;
  level: 'ok' | 'warn' | 'fail';
}

export interface CompileResult {
  index: IndexFile;
  tiles: Record<string, TileFile>;
  report: FileReport[];
}

const AXES: Axis[] = ['scholarly', 'traditional'];

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

interface Data {
  streams: Stream[];
  eras: Era[];
  people: Person[];
  reigns: Reign[];
  events: Event[];
  anchors: Anchor[];
  sources: Source[];
}

async function readCollection<T>(root: string, c: CollectionName): Promise<T[]> {
  let names: string[];
  try {
    names = (await readdir(join(root, c))).filter((n) => n.endsWith('.json')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: T[] = [];
  for (const n of names) {
    const raw: unknown = JSON.parse(await readFile(join(root, c, n), 'utf8'));
    out.push(COLLECTIONS[c].parse(raw) as T);
  }
  return out;
}

/** content/, then seed/ entries whose id content doesn't have (as validate --with-seed). */
async function loadData(contentDir: string, seedDir: string | undefined): Promise<Data> {
  const load = async <T extends { id: string }>(c: CollectionName): Promise<T[]> => {
    const content = await readCollection<T>(contentDir, c);
    if (seedDir) {
      const ids = new Set(content.map((e) => e.id));
      content.push(...(await readCollection<T>(seedDir, c)).filter((e) => !ids.has(e.id)));
    }
    return content.sort(byId);
  };
  return {
    streams: await load<Stream>('streams'),
    eras: await load<Era>('eras'),
    people: await load<Person>('people'),
    reigns: await load<Reign>('reigns'),
    events: await load<Event>('events'),
    anchors: await load<Anchor>('anchors'),
    sources: await load<Source>('sources'),
  };
}

/** The MVP shows only shared items; anything pointing at a dropped stream goes too. */
function sharedOnly(d: Data): Data {
  const shared = <T extends { canon: string }>(xs: T[]) => xs.filter((e) => e.canon === 'shared');
  const streams = shared(d.streams);
  const ids = new Set(streams.map((s) => s.id));
  const people = shared(d.people).filter((p) => ids.has(p.stream_id));
  const personIds = new Set(people.map((p) => p.id));
  return {
    streams: streams.filter((s) => !s.parent_stream_id || ids.has(s.parent_stream_id)),
    eras: shared(d.eras),
    people,
    reigns: shared(d.reigns).filter((r) => ids.has(r.stream_id) && personIds.has(r.person_id)),
    events: shared(d.events).filter((e) => !e.stream_id || ids.has(e.stream_id)),
    anchors: shared(d.anchors),
    sources: shared(d.sources),
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10 || 0;
type Span = { x0: number; x1: number };

function eraSpan(era: Era, axis: Axis, cfg: TimescaleConfig): Span | null {
  const s = era.start?.[axis];
  const e = era.end?.[axis];
  if (s === undefined || e === undefined) return null;
  return { x0: r1(x(s, axis, cfg)), x1: r1(x(e + 1, axis, cfg)) };
}

/** Every source_id and anchor_id cited anywhere in the given records. */
function citedIds(records: unknown[]): { sources: Set<string>; anchors: Set<string> } {
  const sources = new Set<string>();
  const anchors = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v)) {
      if (k === 'source_id' && typeof val === 'string') sources.add(val);
      else if (k === 'anchor_id' && typeof val === 'string') anchors.add(val);
      else walk(val);
    }
  };
  records.forEach(walk);
  return { sources, anchors };
}

function readBuildId(env: Env): string {
  if (env.BK_BUILD_ID) return env.BK_BUILD_ID;
  if (env.CF_PAGES_COMMIT_SHA) return env.CF_PAGES_COMMIT_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return new Date().toISOString();
  }
}

async function readLock(path: string): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'none';
    throw err;
  }
}

/**
 * The ids copy-scripture publishes: none when it publishes none, else the verified books of the
 * same scripture folder (both read from `env`).
 */
async function publishedBooks(env: Env, lock: string): Promise<string[]> {
  const scripture = await resolveScriptureEnv(env);
  if (checkProductionGuard(scripture, env, lock) === 'none') return [];
  return (await readBookFiles(scripture.SCRIPTURE_DIR))
    .filter(({ book }) => book.status === 'verified')
    .map(({ book }) => book.book)
    .sort();
}

export function checkBudget(file: string, json: string, budget: number): FileReport {
  const bytes = Buffer.byteLength(json);
  const gzip = gzipSync(json, { level: 9 }).length;
  const level = gzip > budget ? 'fail' : gzip >= budget * WARN_AT ? 'warn' : 'ok';
  return { file, bytes, gzip, budget, level };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
export function formatReport(r: FileReport): string {
  const pct = Math.round((r.gzip / r.budget) * 100);
  return `${r.file}: ${kb(r.gzip)} gz / ${kb(r.budget)} (${pct}%), ${kb(r.bytes)} raw${
    r.level === 'ok' ? '' : ` [${r.level.toUpperCase()}]`
  }`;
}

/** Compiles, checks budgets, writes the files, then throws if any file is over budget. */
export async function compileData(opts: CompileOptions): Promise<CompileResult> {
  const { contentDir, outDir, env } = opts;
  const logger = opts.logger ?? { info: console.log, warn: console.warn };
  const budgets = opts.budgets ?? BUDGETS;
  const preview = env.BK_SEED === '1';
  const seedDir = preview ? opts.seedDir : undefined;

  const errors = await validateContent({
    dir: contentDir,
    withSeed: seedDir !== undefined,
    seedDir,
    scriptureDir: opts.scriptureDir,
  });
  if (errors.length) throw new Error(`content failed validation:\n${formatText(errors)}`);

  const data = sharedOnly(await loadData(contentDir, seedDir));
  if (!preview) {
    const fixtures = Object.values(data)
      .flat()
      .filter((e) => (e as { fixture?: boolean }).fixture === true);
    if (fixtures.length) {
      const ids = fixtures.map((e) => (e as { id: string }).id).join(', ');
      throw new Error(`production build refused: fixture data in ${contentDir}: ${ids}`);
    }
  }

  const lock = await readLock(opts.lockFile ?? env.SCRIPTURE_LOCK_FILE ?? 'scripture.lock');
  const buildId = opts.buildId ?? readBuildId(env);
  const scriptureBooks = opts.scriptureBooks ?? (await publishedBooks(env, lock));
  const eras = [...data.eras].sort((a, b) => a.order - b.order || byId(a, b));
  const live = eras.filter((e) => e.status === 'live');

  const indexStreams: IndexStream[] = [...data.streams]
    .sort((a, b) => a.lane_order - b.lane_order || byId(a, b))
    .map((s) => ({
      id: s.id,
      slug: s.slug,
      name_am: s.name_am,
      name_en: s.name_en,
      kind: s.kind,
      fill_color: s.fill_color,
      lane_order: s.lane_order,
      ...(s.parent_stream_id ? { parent_stream_id: s.parent_stream_id } : {}),
    }));
  const indexEra = (e: Era, cfg: TimescaleConfig | null): IndexEra => ({
    id: e.id,
    slug: e.slug,
    name_am: e.name_am,
    name_en: e.name_en,
    ...(e.start ? { start: e.start } : {}),
    ...(e.end ? { end: e.end } : {}),
    certainty: e.certainty,
    status: e.status,
    order: e.order,
    ...(e.gap !== undefined ? { gap: e.gap } : {}),
    minimap_weight: e.minimap_weight ?? 1,
    x: {
      scholarly: cfg ? eraSpan(e, 'scholarly', cfg) : null,
      traditional: cfg ? eraSpan(e, 'traditional', cfg) : null,
    },
    tile: e.status === 'live' ? tileFile(e.slug) : null,
  });

  const tiles: Record<string, TileFile> = {};
  let index: IndexFile;
  /** Items in no live era: in no tile, so counted here instead. */
  const unassignedOf = (inEra: (kind: keyof Unassigned, id: string) => boolean): Unassigned => {
    const list = (kind: keyof Unassigned, xs: { id: string }[]): Unplaced => {
      const ids = xs.map((v) => v.id).filter((id) => !inEra(kind, id));
      return { count: ids.length, ids };
    };
    return {
      streams: list('streams', data.streams),
      reigns: list('reigns', data.reigns),
      events: list('events', data.events),
      people: list('people', data.people),
    };
  };
  let unassigned: Unassigned;

  if (live.length === 0) {
    index = {
      version: DATA_VERSION,
      buildId,
      scriptureVersion: lock,
      scriptureBooks,
      timescale: null,
      layout: null,
      eras: eras.map((e) => indexEra(e, null)),
      streams: indexStreams,
      anchors: data.anchors,
      unplaced: {},
      unassigned: (unassigned = unassignedOf(() => false)),
    };
  } else {
    const cfg = buildTimescaleConfig(eras);
    const input = {
      streams: data.streams,
      reigns: data.reigns,
      people: data.people,
      events: data.events,
    };
    const layouts: Record<Axis, AxisLayout> = {
      scholarly: layoutStreams(input, 'scholarly', cfg),
      traditional: layoutStreams(input, 'traditional', cfg),
    };
    const spans = live.map((e) => ({
      era: e,
      span: {
        scholarly: eraSpan(e, 'scholarly', cfg),
        traditional: eraSpan(e, 'traditional', cfg),
      },
    }));

    // Era membership: every live era an item's placed span crosses, on either axis. Band items
    // (scholarly x in the band, not the domain) count on the traditional axis only.
    const erasOf = (get: (axis: Axis) => (Span & { band?: true }) | undefined): Set<string> => {
      const out = new Set<string>();
      for (const { era, span } of spans) {
        for (const axis of AXES) {
          const g = get(axis);
          const s = span[axis];
          if (g && s && !g.band && g.x0 < s.x1 && s.x0 < g.x1) out.add(era.id);
        }
      }
      return out;
    };
    const perAxis = <T>(f: (l: AxisLayout) => Map<string, T>): Record<Axis, Map<string, T>> => ({
      scholarly: f(layouts.scholarly),
      traditional: f(layouts.traditional),
    });
    const bandsBy = perAxis((l) => new Map(l.bands.map((g) => [g.stream_id, g])));
    const reignsBy = perAxis((l) => new Map(l.reigns.map((g) => [g.reign_id, g])));
    const eventsBy = perAxis((l) => new Map(l.events.map((g) => [g.event_id, g])));
    const peopleBy = perAxis((l) => new Map(l.people.map((g) => [g.person_id, g])));

    const streamEras = new Map(
      data.streams.map((s) => [s.id, erasOf((a) => bandsBy[a].get(s.id))]),
    );
    // Items with no position on either axis fall back to their stream's eras.
    const orStream = (set: Set<string>, streamId: string | null | undefined) =>
      set.size > 0 || !streamId ? set : new Set(streamEras.get(streamId));
    const reignEras = new Map(
      data.reigns.map((r) => [
        r.id,
        orStream(
          erasOf((a) => reignsBy[a].get(r.id)),
          r.stream_id,
        ),
      ]),
    );
    const eventEras = new Map(
      data.events.map((e) => [
        e.id,
        orStream(
          erasOf((a) => eventsBy[a].get(e.id)),
          e.stream_id,
        ),
      ]),
    );
    const personEras = new Map(
      data.people.map((p) => {
        const own = erasOf((a) => peopleBy[a].get(p.id));
        for (const r of data.reigns) {
          if (r.person_id === p.id) for (const id of reignEras.get(r.id)!) own.add(id);
        }
        return [p.id, orStream(own, p.stream_id)];
      }),
    );

    const unplacedIndex: IndexFile['unplaced'] = {};
    for (const era of live) {
      const has = (m: Map<string, Set<string>>) => (id: string) => m.get(id)?.has(era.id) === true;
      const streams = data.streams.filter((s) => has(streamEras)(s.id));
      const reigns = data.reigns.filter((r) => has(reignEras)(r.id));
      const events = data.events.filter((e) => has(eventEras)(e.id));
      const people = data.people.filter((p) => has(personEras)(p.id));
      const ids = (xs: { id: string }[]) => new Set(xs.map((v) => v.id));
      const [sIds, rIds, eIds, pIds] = [ids(streams), ids(reigns), ids(events), ids(people)];
      const pick = (u: Unplaced, keep: Set<string>): Unplaced => {
        const kept = u.ids.filter((id) => keep.has(id));
        return { count: kept.length, ids: kept };
      };

      const axes = {} as Record<Axis, TileAxis>;
      const counts = {} as Record<Axis, UnplacedCounts>;
      for (const axis of AXES) {
        const l = layouts[axis];
        const unplaced = {
          streams: pick(l.unplaced.streams, sIds),
          reigns: pick(l.unplaced.reigns, rIds),
          events: pick(l.unplaced.events, eIds),
          people: pick(l.unplaced.people, pIds),
        };
        axes[axis] = {
          bands: l.bands.filter((b) => sIds.has(b.stream_id)),
          reigns: l.reigns.filter((g) => rIds.has(g.reign_id)),
          events: l.events.filter((g) => eIds.has(g.event_id)),
          people: l.people.filter((g) => pIds.has(g.person_id)),
          unplaced,
        };
        counts[axis] = {
          streams: unplaced.streams.count,
          reigns: unplaced.reigns.count,
          events: unplaced.events.count,
          people: unplaced.people.count,
        };
      }
      unplacedIndex[era.id] = counts;

      const cited = citedIds([...reigns, ...events, ...people]);
      tiles[era.slug] = {
        version: DATA_VERSION,
        buildId,
        era: era.id,
        axes,
        people,
        reigns,
        events,
        sources: data.sources.filter((s) => cited.sources.has(s.id)),
        anchors: data.anchors.filter((a) => cited.anchors.has(a.id)),
      };
    }

    index = {
      version: DATA_VERSION,
      buildId,
      scriptureVersion: lock,
      scriptureBooks,
      timescale: cfg,
      layout: {
        scholarly: { height: layouts.scholarly.height, lanes: layouts.scholarly.lanes },
        traditional: { height: layouts.traditional.height, lanes: layouts.traditional.lanes },
      },
      eras: eras.map((e) => indexEra(e, cfg)),
      streams: indexStreams,
      anchors: data.anchors,
      unplaced: unplacedIndex,
      unassigned: (unassigned = unassignedOf(
        (kind, id) =>
          ({ streams: streamEras, reigns: reignEras, events: eventEras, people: personEras })[
            kind
          ].get(id)!.size > 0,
      )),
    };
  }

  const loose = Object.entries(unassigned)
    .filter(([, u]) => u.count > 0)
    .map(([kind, u]) => `${kind}: ${u.ids.join(', ')}`);
  if (live.length > 0 && loose.length) {
    logger.warn(`in no live era (not in any tile): ${loose.join('; ')}`);
  }

  // Serialize, check budgets, write.
  const files: [string, string, number][] = [
    [INDEX_FILE, JSON.stringify(index), budgets.index],
    ...Object.keys(tiles)
      .sort()
      .map((slug): [string, string, number] => [
        tileFile(slug),
        JSON.stringify(tiles[slug]),
        budgets.tile,
      ]),
  ];
  const report = files.map(([file, json, budget]) => checkBudget(file, json, budget));
  for (const r of report) (r.level === 'ok' ? logger.info : logger.warn)(formatReport(r));

  await rm(join(outDir, 'tiles'), { recursive: true, force: true });
  for (const [file, json] of files) {
    const path = join(outDir, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, json);
  }

  const over = report.filter((r) => r.level === 'fail');
  if (over.length) {
    throw new Error(`data over budget: ${over.map((r) => r.file).join(', ')}`);
  }
  return { index, tiles, report };
}

/**
 * Compiles /data/ at build start and when the dev server starts. It runs as its own Node process
 * (the same code as `pnpm compile:data`): Astro closes the Vite module runner that loaded the
 * config before build hooks run, so the lazy `node:fs` import in loadBooks() would fail in-process.
 */
export function compileDataIntegration(env: Env = process.env): AstroIntegration {
  let outDir: string;
  const script = fileURLToPath(import.meta.url);
  const run = (logger: Logger) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', script, '--out', outDir], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const relay = (stream: NodeJS.ReadableStream, log: (m: string) => void) => {
        let buf = '';
        stream.setEncoding('utf8');
        stream.on('data', (chunk: string) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop()!;
          for (const line of lines) if (line.trim()) log(line);
        });
        stream.on('end', () => buf.trim() && log(buf));
      };
      relay(child.stdout, (m) => logger.info(m));
      relay(child.stderr, (m) => logger.warn(m));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`compile-data failed (exit ${code})`)),
      );
    });
  return {
    name: 'bk-compile-data',
    hooks: {
      'astro:config:setup': async ({ command, config, logger }) => {
        outDir = fileURLToPath(new URL('data/', config.publicDir));
        if (command === 'dev') await run(logger);
      },
      'astro:build:start': async ({ logger }) => run(logger),
    },
  };
}

async function main(argv: string[]): Promise<void> {
  const at = argv.indexOf('--out');
  await compileData({
    contentDir: 'content',
    seedDir: 'seed',
    outDir: at >= 0 && argv[at + 1] ? argv[at + 1]! : 'public/data',
    env: process.env,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
