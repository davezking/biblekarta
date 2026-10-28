import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { IndexFile, TileFile } from '../lib/core/datafiles';
import {
  checkBudget,
  compileData,
  formatReport,
  type CompileOptions,
  type CompileResult,
} from './compile-data';

// Abstract fixtures (src/build/__fixtures__/compile): their names and years test the compiler and
// are not dates of anything. content/ has a shared and an ethiopian_81 item of each kind; seed/
// adds one fixture event.
const FIX = 'src/build/__fixtures__/compile';
const quiet = { info: () => {}, warn: () => {} };

async function run(
  env: Record<string, string | undefined>,
  over: Partial<CompileOptions> = {},
): Promise<CompileResult & { outDir: string }> {
  const outDir = await mkdtemp(join(tmpdir(), 'bk-compile-'));
  const result = await compileData({
    contentDir: join(FIX, 'content'),
    seedDir: join(FIX, 'seed'),
    outDir,
    env,
    logger: quiet,
    buildId: 'test-build',
    scriptureBooks: ['fixture'],
    lockFile: join(FIX, 'missing.lock'),
    scriptureDir: 'scripture-fixtures',
    ...over,
  });
  return { ...result, outDir };
}

const read = async (dir: string, file: string) => readFile(join(dir, file), 'utf8');
const ids = (xs: { id: string }[]) => xs.map((v) => v.id);

describe('compileData', () => {
  it('overlays seed/ only when BK_SEED=1', async () => {
    const prod = await run({});
    const preview = await run({ BK_SEED: '1' });
    const allEvents = (r: CompileResult) => Object.values(r.tiles).flatMap((t) => ids(t.events));
    expect(allEvents(prod)).not.toContain('e-seed');
    expect(allEvents(preview)).toContain('e-seed');
    for (const dir of [prod.outDir]) {
      const files = [await read(dir, 'index.json'), await read(dir, 'tiles/early.json')];
      for (const f of files) expect(f).not.toContain('"fixture":true');
    }
  });

  it('keeps only canon "shared" items', async () => {
    const r = await run({ BK_SEED: '1' });
    const all = JSON.stringify(r);
    for (const id of ['"other"', '"p-three"', '"e-81"', 'ethiopian_81']) {
      expect(all).not.toContain(id);
    }
    expect(ids(r.index.streams)).toEqual(['river']);
  });

  it('puts each item in every live era its placed span crosses', async () => {
    const { tiles, index } = await run({});
    expect(Object.keys(tiles).sort()).toEqual(['early', 'late']);
    expect(ids(tiles.early!.reigns)).toEqual(['r-one', 'r-two']);
    expect(ids(tiles.late!.reigns)).toEqual(['r-two']);
    expect(ids(tiles.early!.events)).toEqual([]);
    expect(ids(tiles.late!.events)).toEqual(['e-shared']);
    // People come with their reigns; streams go to every era they cross.
    expect(ids(tiles.early!.people)).toEqual(['p-one', 'p-two']);
    expect(ids(tiles.late!.people)).toEqual(['p-two']);
    for (const t of Object.values(tiles)) {
      expect(t.axes.scholarly.bands.map((b) => b.stream_id)).toEqual(['river']);
    }
    // Index: every era in order, coming-soon ones with no tile and their minimap weight.
    expect(index.eras.map((e) => [e.id, e.status, e.tile, e.minimap_weight])).toEqual([
      ['early', 'live', 'tiles/early.json', 1],
      ['late', 'live', 'tiles/late.json', 1],
      ['later', 'coming_soon', null, 2],
    ]);
    expect(index.eras[2]!.x).toEqual({ scholarly: null, traditional: null });
  });

  it('carries the sources and anchors that the tile’s dates cite', async () => {
    const { tiles } = await run({});
    expect(ids(tiles.early!.anchors)).toEqual(['anc-a']);
    expect(ids(tiles.early!.sources)).toEqual(['src-a']);
    expect(ids(tiles.late!.anchors)).toEqual([]);
    expect(ids(tiles.late!.sources)).toEqual(['src-a']);
  });

  it('counts unplaced items per era and axis, and lists them in the tile', async () => {
    const { tiles, index } = await run({});
    // r-one's traditional dates are TBD; r-two has traditional years.
    expect(tiles.early!.axes.traditional.unplaced.reigns).toEqual({ count: 1, ids: ['r-one'] });
    expect(tiles.early!.axes.scholarly.unplaced.reigns).toEqual({ count: 0, ids: [] });
    expect(tiles.early!.axes.traditional.reigns.map((g) => g.reign_id)).toEqual(['r-two']);
    expect(index.unplaced.early!.traditional).toEqual({
      streams: 0,
      reigns: 1,
      events: 0,
      people: 0,
    });
    expect(index.unplaced.late!.traditional.events).toBe(1);
  });

  it('counts the items that belong to no live era, since no tile has them', async () => {
    const warn = vi.fn();
    const { index, tiles } = await run({}, { logger: { info: () => {}, warn } });
    // e-loose has no stream and only a TBD traditional date.
    expect(index.unassigned.events).toEqual({ count: 1, ids: ['e-loose'] });
    expect(index.unassigned.reigns).toEqual({ count: 0, ids: [] });
    expect(Object.values(tiles).flatMap((t) => ids(t.events))).not.toContain('e-loose');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/in no live era.*events: e-loose/));
  });

  it('writes an empty index and no tiles for a production build with no content', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'bk-empty-'));
    const r = await run({}, { contentDir: empty });
    expect(r.index.eras).toEqual([]);
    expect(r.index.timescale).toBeNull();
    expect(r.index.unassigned.events.count).toBe(0);
    expect(r.tiles).toEqual({});
    expect(await readdir(r.outDir)).toEqual(['index.json']);
    expect(await read(r.outDir, 'index.json')).not.toContain('"fixture":true');
  });

  it('refuses fixture data in a production build', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-fixture-'));
    await mkdir(join(dir, 'sources'));
    await writeFile(
      join(dir, 'sources', 's.json'),
      JSON.stringify({ id: 's', citation: 'c', kind: 'scholarly', fixture: true }),
    );
    await expect(run({}, { contentDir: dir })).rejects.toThrow(/fixture data/);
  });

  it('fails on a validation error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-invalid-'));
    await mkdir(join(dir, 'sources'));
    await writeFile(join(dir, 'sources', 's.json'), JSON.stringify({ id: 'S!' }));
    await expect(run({}, { contentDir: dir })).rejects.toThrow(/failed validation/);
  });

  it('is deterministic apart from buildId', async () => {
    const a = await run({ BK_SEED: '1' });
    const b = await run({ BK_SEED: '1' });
    const c = await run({ BK_SEED: '1' }, { buildId: 'other-build' });
    for (const file of ['index.json', 'tiles/early.json', 'tiles/late.json']) {
      const fa = await read(a.outDir, file);
      expect(await read(b.outDir, file)).toBe(fa);
      expect((await read(c.outDir, file)).replace('"other-build"', '"test-build"')).toBe(fa);
    }
  });

  it('writes files that match the datafiles.ts contract', async () => {
    const r = await run({ BK_SEED: '1' });
    expectTypeOf(r.index).toEqualTypeOf<IndexFile>();
    expectTypeOf(r.tiles).toEqualTypeOf<Record<string, TileFile>>();
    expect(JSON.parse(await read(r.outDir, 'index.json'))).toEqual(r.index);
    expect(JSON.parse(await read(r.outDir, 'tiles/early.json'))).toEqual(r.tiles.early);
    expect(r.index).toMatchObject({
      version: 1,
      buildId: 'test-build',
      scriptureVersion: 'none',
      scriptureBooks: ['fixture'],
    });
    expect(Object.keys(r.index.layout!)).toEqual(['scholarly', 'traditional']);
    expect(r.tiles.early!.version).toBe(1);
  });

  it('lists the verified books of the scripture folder named in env', async () => {
    const env = { BK_SEED: '1', SCRIPTURE_DIR: 'scripture-fixtures', BK_SCRIPTURE: 'fixtures' };
    const r = await run(env, { scriptureBooks: undefined });
    expect(r.index.scriptureBooks).toEqual(['fixture']);
    const none = await run(
      { ...env, SCRIPTURE_DIR: join(FIX, 'content') },
      { scriptureBooks: undefined },
    );
    expect(none.index.scriptureBooks).toEqual([]);
  });

  it('reads the scripture version from the lock file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-lock-'));
    await writeFile(join(dir, 'scripture.lock'), 'abc123\n');
    const r = await run({}, { lockFile: join(dir, 'scripture.lock') });
    expect(r.index.scriptureVersion).toBe('abc123');
  });
});

describe('budgets', () => {
  it('is ok under 80%, warns from 80%, fails above 100%', () => {
    const json = JSON.stringify({ a: 'x'.repeat(50) });
    const gz = checkBudget('f', json, 1e9).gzip;
    expect(checkBudget('f', json, Math.ceil(gz / 0.79)).level).toBe('ok');
    expect(checkBudget('f', json, Math.floor(gz / 0.8)).level).toBe('warn');
    expect(checkBudget('f', json, gz).level).toBe('warn');
    expect(checkBudget('f', json, gz - 1).level).toBe('fail');
  });

  it('prints one summary line per file and fails the build when over budget', async () => {
    const info = vi.fn();
    const warn = vi.fn();
    await expect(
      run({}, { logger: { info, warn }, budgets: { index: 10, tile: 1e6 } }),
    ).rejects.toThrow(/over budget: index.json/);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^index\.json: .* \[FAIL\]$/));
    expect(info).toHaveBeenCalledTimes(2); // the two tiles
    expect(formatReport({ file: 'f', bytes: 2048, gzip: 512, budget: 1024, level: 'ok' })).toBe(
      'f: 0.5 KB gz / 1.0 KB (50%), 2.0 KB raw',
    );
  });

  it('keeps the seed index and tile well within the real budgets', async () => {
    const r = await run(
      { BK_SEED: '1' },
      { contentDir: 'content', seedDir: 'seed', scriptureDir: undefined },
    );
    expect(Object.keys(r.tiles)).toEqual(['divided-kingdom']);
    for (const f of r.report) expect(f.level).toBe('ok');
    const ahab = r.tiles['divided-kingdom']!;
    expect(ahab.axes.scholarly.reigns.some((g) => g.reign_id === 'ahab')).toBe(true);
    expect(ahab.axes.traditional.unplaced.reigns.ids).toContain('ahab');
  });
});
