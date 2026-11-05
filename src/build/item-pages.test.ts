import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ChartData } from '../components/chart/data/useChartData';
import { seedChartData } from '../components/chart/seed-data.testutil';
import { INDEX_FILE, type IndexFile } from '../lib/core/datafiles';
import { parseViewState } from '../lib/core/viewstate';
import { viewLimits } from '../components/chart/url-sync';
import { buildItemPages, loadItemPages, SITE_URL, type ItemPage } from './item-pages';

// The non-scriptural fixture book: none of its verse text may appear in any page field.
const fixtureVerses = async () =>
  (
    JSON.parse(await readFile('scripture-fixtures/books/fixture.json', 'utf8')) as {
      chapters: { verses: { t: string }[] }[];
    }
  ).chapters.flatMap((c) => c.verses.map((v) => v.t));

let data: ChartData;
let pages: ItemPage[];
beforeAll(async () => {
  data = await seedChartData();
  pages = buildItemPages(data.index, [data.tile]);
});
const find = (kind: ItemPage['kind'], slug: string) =>
  pages.find((p) => p.kind === kind && p.slug === slug)!;

describe('buildItemPages (seed)', () => {
  it('has a page for every person, event and live era', () => {
    const slugs = (kind: ItemPage['kind']) =>
      pages
        .filter((p) => p.kind === kind)
        .map((p) => p.slug)
        .sort();
    expect(slugs('person')).toEqual(data.tile.people.map((p) => p.slug).sort());
    expect(slugs('event')).toEqual(data.tile.events.map((e) => e.slug).sort());
    expect(slugs('era')).toEqual(
      data.index.eras.filter((e) => e.status === 'live').map((e) => e.slug),
    );
  });

  it("formats Ahab's page: names, both dates with certainty, refs, meta", () => {
    const ahab = find('person', 'ahab');
    expect(ahab.path).toBe('/p/ahab/');
    expect(ahab.canonical).toBe(`${SITE_URL}/p/ahab/`);
    expect(ahab.name_am).toBe('አክዓብ');
    expect(ahab.name_en).toBe('Ahab');
    expect(ahab.dates).toHaveLength(1);
    expect(ahab.dates[0]!.rows).toEqual([
      { axis: 'scholarly', label: 'ታሪካዊ ምርምር', text: '874–853 ዓ.ዓ.', certainty: 'ትክክለኛ' },
      { axis: 'traditional', label: 'ትውፊታዊ', text: 'ያልተወሰነ', certainty: 'ትውፊት ብቻ' },
    ]);
    const book = data.index.books!['1ki']!;
    expect(ahab.refs).toEqual([`${book.name_am} ፲፮፥፳፱`]);
    expect(ahab.title).toBe('አክዓብ — የመጽሐፍ ቅዱስ ካርታ');
    expect(ahab.description).toBe('አክዓብ (Ahab)፤ ታሪካዊ ምርምር፦ 874–853 ዓ.ዓ.፤ ትውፊታዊ፦ ያልተወሰነ።');
  });

  it('opens the chart on the item: its selection, centred and zoomed within range', () => {
    const limits = viewLimits(data.index.timescale!);
    const ahab = parseViewState(find('person', 'ahab').search, limits);
    expect(ahab.sel).toEqual({ kind: 'person', slug: 'ahab' });
    expect(ahab.z).toBeDefined();
    expect(ahab.axis).toBe('scholarly');
    // Centred inside his reign (874–853 BC = −873…−852).
    expect(ahab.y).toBeGreaterThanOrEqual(-873);
    expect(ahab.y).toBeLessThanOrEqual(-852);
    expect(ahab.z).toBeDefined();

    const qarqar = parseViewState(find('event', 'battle-of-qarqar').search, limits);
    expect(qarqar.sel).toEqual({ kind: 'event', slug: 'battle-of-qarqar' });
    expect(qarqar.y).toBe(-852);

    // Every page's state survives the URL parser with its limits (nothing dropped).
    for (const p of pages) {
      const s = parseViewState(p.search, limits);
      // Framed (y and z) when drawn on an axis; an item with only relative dates has neither
      // and opens on the fitted view, still selected.
      expect(s.y === undefined, p.path).toBe(s.z === undefined);
      if (p.kind !== 'era') expect(s.sel?.slug, p.path).toBe(p.slug);
    }
  });

  it('frames an era wider than an item, with no selection', () => {
    const limits = viewLimits(data.index.timescale!);
    const era = parseViewState(find('era', 'divided-kingdom').search, limits);
    expect(era.sel).toBeUndefined();
    expect(era.z!).toBeLessThan(parseViewState(find('person', 'ahab').search, limits).z!);
  });

  it("lists an era's people and events as links to their pages", () => {
    const era = find('era', 'divided-kingdom');
    expect(era.people!.map((l) => l.href)).toContain('/p/ahab/');
    expect(era.events!.map((l) => l.href)).toContain('/e/battle-of-qarqar/');
    expect(era.people).toHaveLength(data.tile.people.length);
    expect(era.dates[0]!.rows.map((r) => r.axis)).toEqual(['scholarly', 'traditional']);
    expect(era.description).toContain(`${data.tile.people.length} ሰዎችና`);
  });

  it('gives every page a unique title, description and canonical URL', () => {
    for (const field of ['title', 'description', 'canonical'] as const) {
      const values = pages.map((p) => p[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it('shows both date rows on every page and no year for a relative-only date', () => {
    for (const p of pages) {
      for (const block of p.dates) {
        expect(block.rows.map((r) => r.axis)).toEqual(['scholarly', 'traditional']);
      }
    }
    // Sheba's visit has only relative dates: no digits in either row.
    for (const r of find('event', 'sheba-visit').dates[0]!.rows) expect(r.text).not.toMatch(/\d/);
  });

  it('puts no verse text in any field', async () => {
    const json = JSON.stringify(pages);
    for (const t of await fixtureVerses()) expect(json).not.toContain(t);
  });

  it('disambiguates two items with the same Amharic name', () => {
    const tile = structuredClone(data.tile);
    const twin = {
      ...tile.people.find((p) => p.id === 'ahab')!,
      id: 'ahab-2',
      slug: 'ahab-2',
      name_en: 'Ahab II',
    };
    tile.people.push(twin);
    const titles = buildItemPages(data.index, [tile])
      .filter((p) => p.name_am === 'አክዓብ')
      .map((p) => p.title)
      .sort();
    expect(titles).toEqual(['አክዓብ (Ahab II) — የመጽሐፍ ቅዱስ ካርታ', 'አክዓብ (Ahab) — የመጽሐፍ ቅዱስ ካርታ']);
  });
});

describe('loadItemPages', () => {
  it('returns no pages when there is no compiled data, or no live era', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-items-'));
    expect(await loadItemPages(dir)).toEqual([]);
    const empty: IndexFile = {
      ...data.index,
      timescale: null,
      layout: null,
      eras: data.index.eras.map((e) => ({ ...e, status: 'coming_soon', tile: null })),
    };
    await writeFile(join(dir, INDEX_FILE), JSON.stringify(empty));
    expect(await loadItemPages(dir)).toEqual([]);
  });

  it('reads the index and the live tiles from the data folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-items-'));
    await mkdir(join(dir, 'tiles'), { recursive: true });
    await writeFile(join(dir, INDEX_FILE), JSON.stringify(data.index));
    const era = data.index.eras.find((e) => e.status === 'live')!;
    await writeFile(join(dir, era.tile!), JSON.stringify(data.tile));
    expect(await loadItemPages(dir)).toEqual(pages);
  });
});

// Build-level check (the e2e build pattern): real `astro build`s into the checkout's own cache
// folder (astro moves built CSS with fs.rename, which fails across mounts).
const run = promisify(execFile);
const BUILD_TMP = join(process.cwd(), 'node_modules', '.cache', 'bk-item-pages');
const FIXTURE_SCRIPTURE = {
  SCRIPTURE_DIR: 'scripture-fixtures',
  BK_SCRIPTURE: 'fixtures',
  SCRIPTURE_VERSION: 'fixtures',
};

async function astroBuild(env: Record<string, string>) {
  await mkdir(BUILD_TMP, { recursive: true });
  const outDir = await mkdtemp(join(BUILD_TMP, 'dist-'));
  const base = { ...process.env };
  delete base.BK_SEED;
  delete base.BK_ALLOW_FIXTURE_SCRIPTURE;
  await run('pnpm', ['exec', 'astro', 'build', '--outDir', outDir], {
    env: { ...base, ...FIXTURE_SCRIPTURE, ...env },
    maxBuffer: 32 * 1024 * 1024,
  });
  return outDir;
}

describe('astro build', () => {
  it('a seeded build writes /p/ahab/ with the name, dates and meta, and no verse text', async () => {
    const out = await astroBuild({ BK_SEED: '1' });
    try {
      const html = await readFile(join(out, 'p', 'ahab', 'index.html'), 'utf8');
      expect(html).toContain('<html lang="am">');
      expect(html).toContain('<title>አክዓብ — የመጽሐፍ ቅዱስ ካርታ</title>');
      expect(html).toContain('አክዓብ');
      expect(html).toContain('874–853 ዓ.ዓ.');
      expect(html).toContain('<link rel="canonical" href="https://biblekarta.com/p/ahab/">');
      for (const prop of ['og:title', 'og:description', 'og:url', 'og:type']) {
        expect(html).toContain(`property="${prop}"`);
      }
      expect(html).toMatch(/<meta name="description" content="አክዓብ \(Ahab\)[^"]*874–853/);
      for (const t of await fixtureVerses()) expect(html).not.toContain(t);
      expect(existsSync(join(out, 'e', 'battle-of-qarqar', 'index.html'))).toBe(true);
      const era = await readFile(join(out, 'era', 'divided-kingdom', 'index.html'), 'utf8');
      expect(era).toContain('href="/p/ahab/"');
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 180_000);

  it('a production build with no content builds no item pages and does not fail', async () => {
    // As before the first text release: scripture.lock "none" (the repo's lock pins a release,
    // which a fixtures-only production build refuses, by design).
    const lockDir = await mkdtemp(join(tmpdir(), 'bk-lock-'));
    const lock = join(lockDir, 'scripture.lock');
    await writeFile(lock, 'none\n');
    const out = await astroBuild({ SCRIPTURE_LOCK_FILE: lock });
    try {
      expect(existsSync(join(out, 'index.html'))).toBe(true);
      for (const dir of ['p', 'e', 'era']) expect(existsSync(join(out, dir))).toBe(false);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 180_000);
});
