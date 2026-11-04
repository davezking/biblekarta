#!/usr/bin/env node
// Stress seed for the performance pass (P2-S3-T7): about 10× Board 5's density in one era, so the
// chart can be profiled under real load.
//
// - It is obviously synthetic: every name is "Stress …", every entry has `fixture: true`, and
//   none of it is biblical data (no real names, dates, references or text).
// - It is generated into a temporary directory at test time and is never written to `seed/` or
//   `content/`: the target directory must be empty or new, and the script refuses those two.
// - It is deterministic (a seeded PRNG), so runs are comparable.
//
// Usage: node scripts/stress-seed.mjs [dir]   (default: a new folder under os.tmpdir()); prints the dir.
// Or: import { writeStressSeed } from './stress-seed.mjs'.
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STRESS = {
  era: { id: 'stress-era', start: -999, end: -800 },
  streams: 40,
  reigns: 600,
  events: 300,
  prophets: 60,
};

/** mulberry32: a small deterministic PRNG. */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(3, '0');
const FILLS = [
  '#E2B54F',
  '#DE9479',
  '#9DB28A',
  '#D9C39A',
  '#8FB0C4',
  '#B7B9C9',
  '#DCC08A',
  '#93A487',
];
/** Traditional (AA) years for the same span: synthetic, a fixed offset from the scholarly ones. */
const AA_OFFSET = 5500;

const SOURCE_TRAD = 'stress-tradition';
const SOURCE_SCH = 'stress-scholarly';

/** A synthetic date on both axes. */
function dates(year, approx) {
  return {
    traditional: {
      start: year + AA_OFFSET,
      certainty: approx ? 'approximate' : 'exact',
      method: 'traditional',
      source_id: SOURCE_TRAD,
    },
    scholarly: {
      start: year,
      certainty: approx ? 'approximate' : 'exact',
      method: 'anchor',
      source_id: SOURCE_SCH,
    },
  };
}

/** Every stress entry, by collection folder. */
export function stressSeed(seed = 20261104) {
  const rnd = prng(seed);
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const { start, end } = STRESS.era;
  const out = {
    eras: [],
    sources: [],
    streams: [],
    people: [],
    reigns: [],
    events: [],
    anchors: [],
    relationships: [],
  };
  const base = { canon: 'shared', fixture: true };

  out.eras.push({
    id: STRESS.era.id,
    slug: STRESS.era.id,
    name_am: 'Stress Era',
    name_en: 'Stress Era',
    start: { scholarly: start, traditional: start + AA_OFFSET },
    end: { scholarly: end, traditional: end + AA_OFFSET },
    certainty: 'approximate',
    status: 'live',
    order: 5,
    ...base,
  });
  out.sources.push(
    { id: SOURCE_TRAD, kind: 'tradition', citation: 'Stress source (synthetic)', ...base },
    { id: SOURCE_SCH, kind: 'scholarly', citation: 'Stress source (synthetic)', ...base },
  );

  // Streams: one prophet ribbon, then polities (some forked) and lanes.
  const streams = [];
  const stream = (i, kind, extra = {}) => {
    const id = `stress-s${pad(i)}`;
    const s = {
      id,
      slug: id,
      name_am: `Stress ${pad(i)}`,
      name_en: `Stress ${pad(i)}`,
      kind,
      fill_color: kind === 'ribbon' ? '#D8DFC0' : FILLS[i % FILLS.length],
      lane_order: i,
      width_keyframes: [
        {
          at: { scholarly: start, traditional: start + AA_OFFSET },
          width: kind === 'polity' ? 3 : 1,
        },
      ],
      ...extra,
      ...base,
    };
    streams.push(s);
    return s;
  };
  stream(1, 'ribbon');
  for (let i = 2; i <= STRESS.streams; i++) {
    // Every fourth polity forks from the one before it, a third of the way into the era.
    if (i % 4 === 0) {
      const at = start + Math.round((end - start) / 3);
      stream(i, 'polity', {
        parent_stream_id: `stress-s${pad(i - 1)}`,
        fork: { scholarly: at, traditional: at + AA_OFFSET },
      });
    } else stream(i, i % 4 === 3 ? 'polity' : 'lane');
  }
  out.streams = streams;
  const carriers = streams.filter((s) => s.kind !== 'ribbon');

  // Reigns: consecutive, back to back, spread evenly over the non-ribbon streams.
  let p = 0;
  const person = (streamId, importance, kind, extra = {}) => {
    p++;
    const id = `stress-p${String(p).padStart(4, '0')}`;
    out.people.push({
      id,
      slug: id,
      name_am: `Stress ${String(p).padStart(4, '0')}`,
      name_en: `Stress ${String(p).padStart(4, '0')}`,
      aliases: [],
      figure_kind: kind,
      importance,
      stream_id: streamId,
      refs: [],
      ...extra,
      ...base,
    });
    return id;
  };
  const perStream = Math.ceil(STRESS.reigns / carriers.length);
  let r = 0;
  for (const s of carriers) {
    const from = s.fork ? s.fork.scholarly : start;
    const span = end - from;
    let y = from;
    for (let j = 0; j < perStream && r < STRESS.reigns; j++) {
      const len = Math.max(1, Math.round((span / perStream) * (0.5 + rnd())));
      const y1 = Math.min(end, y + len);
      if (y >= end) break;
      const pid = person(s.id, int(1, 5), j % 7 === 0 ? 'queen' : 'king');
      const approx = rnd() < 0.2;
      r++;
      out.reigns.push({
        id: `stress-r${pad(r)}`,
        person_id: pid,
        stream_id: s.id,
        coregency_flag: false,
        start_traditional: dates(y, approx).traditional,
        start_scholarly: dates(y, approx).scholarly,
        end_traditional: dates(y1, approx).traditional,
        end_scholarly: dates(y1, approx).scholarly,
        ...base,
      });
      y = y1 + 1;
    }
  }
  // Top up to the reign count with reigns at the end of the first polities (rare; keeps the total).
  while (r < STRESS.reigns) {
    const s = carriers[r % carriers.length];
    const y = int(start, end - 2);
    const pid = person(s.id, 1, 'king');
    r++;
    out.reigns.push({
      id: `stress-r${pad(r)}`,
      person_id: pid,
      stream_id: s.id,
      coregency_flag: false,
      start_scholarly: dates(y, true).scholarly,
      end_scholarly: dates(y + 1, true).scholarly,
      start_traditional: dates(y, true).traditional,
      end_traditional: dates(y + 1, true).traditional,
      ...base,
    });
  }

  // Prophets: people with spans of their own in the ribbon (they overlap, so they pack into rows).
  for (let i = 0; i < STRESS.prophets; i++) {
    const y = int(start, end - 20);
    const len = int(10, 50);
    const approx = rnd() < 0.5;
    person('stress-s001', int(1, 5), 'prophet', {
      birth_traditional: dates(y, approx).traditional,
      birth_scholarly: dates(y, approx).scholarly,
      death_traditional: dates(Math.min(end, y + len), approx).traditional,
      death_scholarly: dates(Math.min(end, y + len), approx).scholarly,
    });
  }

  // Events: mostly points, some spans, in random streams; a few with no stream.
  for (let i = 1; i <= STRESS.events; i++) {
    const y = int(start, end - 5);
    const spanEv = rnd() < 0.2;
    const approx = rnd() < 0.3;
    const s = rnd() < 0.05 ? undefined : streams[int(0, streams.length - 1)].id;
    const d = dates(y, approx);
    out.events.push({
      id: `stress-e${pad(i)}`,
      slug: `stress-e${pad(i)}`,
      title_am: `Stress event ${pad(i)}`,
      title_en: `Stress event ${pad(i)}`,
      ...(s ? { stream_id: s } : {}),
      type: spanEv ? 'span' : 'point',
      importance: int(1, 5),
      date_traditional: spanEv
        ? { ...d.traditional, end: d.traditional.start + int(2, 10) }
        : d.traditional,
      date_scholarly: spanEv
        ? { ...d.scholarly, end: d.scholarly.start + int(2, 10) }
        : d.scholarly,
      refs: [],
      ...base,
    });
  }
  return out;
}

/** Refuses the repo's real data folders. */
function assertSafe(dir) {
  const abs = resolve(dir);
  for (const banned of ['seed', 'content']) {
    const rel = relative(resolve(banned), abs);
    if (rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'))) {
      throw new Error(`stress-seed: refusing to write into ${banned}/ (${abs})`);
    }
  }
}

/** Writes the stress seed (one JSON file per entry, as in seed/) into `dir`, or a new temp dir. */
export async function writeStressSeed(dir) {
  const target = dir ?? (await mkdtemp(join(tmpdir(), 'bk-stress-')));
  assertSafe(target);
  await mkdir(target, { recursive: true });
  if ((await readdir(target)).length) throw new Error(`stress-seed: ${target} is not empty`);
  const data = stressSeed();
  for (const [collection, entries] of Object.entries(data)) {
    await mkdir(join(target, collection), { recursive: true });
    for (const e of entries) {
      await writeFile(join(target, collection, `${e.id}.json`), `${JSON.stringify(e, null, 2)}\n`);
    }
  }
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeStressSeed(process.argv[2])
    .then((d) => console.log(d))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
