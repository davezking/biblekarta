// Static item pages (FR-10, architecture §5): /p/<slug>/, /e/<slug>/ and /era/<slug>/.
// loadItemPages() reads the compiled data (public/data/index.json and the era tiles, written by
// compile-data before pages build) and returns, per person, event and live era, everything a page
// renders on the server: names, both dates with their certainty, the refs as text (book, chapter,
// verse: never verse text), the meta tags, and the chart state that opens the chart on the item.
// No live era (production with no content) means no tiles, so no pages, and no error.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { formatScholarly, formatTraditional } from '../lib/core/dates';
import { INDEX_FILE, type IndexEra, type IndexFile, type TileFile } from '../lib/core/datafiles';
import { formatRef } from '../lib/core/refs';
import type { DateValue, Era, ScriptureRef } from '../lib/core/schema';
import { roundZoom, serializeViewState, type ViewState } from '../lib/core/viewstate';
import { createT, type Lang, type T } from '../lib/i18n';
import { x as yearToX, type Axis, type TimescaleConfig } from '../lib/layout/timescale';
import { AXES, certaintyOf, dateText, type DatePair } from '../components/panel/DateRow';
import { dateBlocks, resolveSelection } from '../components/panel/DetailPanel';
import { refText } from '../components/panel/HowKnown';

export const SITE_URL = 'https://biblekarta.com';
/** How wide (screen px) a person or event is framed when its page opens the chart: fits a phone. */
export const FRAME_PX = 360;
/** How wide an era is framed: a desktop's chart width (a phone sees its middle, and can zoom out). */
export const ERA_FRAME_PX = 960;

export type ItemKind = 'person' | 'event' | 'era';
export const ROUTE: Record<ItemKind, string> = { person: 'p', event: 'e', era: 'era' };

export interface ItemDateRow {
  axis: Axis;
  /** The axis name, e.g. "ታሪካዊ ምርምር". */
  label: string;
  /** The formatted date, or TBD / the relative text: never a made-up year. */
  text: string;
  /** The certainty label, when the axis has a date. */
  certainty?: string;
}

export interface ItemDateBlock {
  label?: string;
  rows: ItemDateRow[];
}

export interface ItemLink {
  name_am: string;
  href: string;
}

export interface ItemPage {
  kind: ItemKind;
  slug: string;
  /** e.g. "/p/ahab/". */
  path: string;
  /** e.g. "https://biblekarta.com/p/ahab/". */
  canonical: string;
  name_am: string;
  name_en: string;
  title: string;
  description: string;
  dates: ItemDateBlock[];
  /** The refs as text, e.g. "መጽሐፈ ነገሥት ቀዳማዊ ፲፮፥፳፱". */
  refs: string[];
  /** The chart state that opens the chart on the item ("?sel=p:ahab&y=…&z=…"). */
  search: string;
  /** An era's people and events (links to their pages). */
  people?: ItemLink[];
  events?: ItemLink[];
}

const pathOf = (kind: ItemKind, slug: string) => `/${ROUTE[kind]}/${slug}/`;

/** The fractional year at base x `px` (timescale.x is linear on each axis). */
function yearAt(px: number, axis: Axis, cfg: TimescaleConfig): number {
  const x0 = yearToX(0, axis, cfg);
  return (px - x0) / (yearToX(1, axis, cfg) - x0);
}

/** y and z that centre a base-px span and make it about `framePx` wide, within the zoom range. */
export function framing(
  span: { x0: number; x1: number },
  axis: Axis,
  cfg: TimescaleConfig,
  framePx = FRAME_PX,
): Pick<ViewState, 'y' | 'z'> {
  const width = Math.max(1, span.x1 - span.x0);
  const k = Math.min(cfg.zoom.kMax, Math.max(cfg.zoom.kMin, framePx / width));
  // z is written with 2 decimals: keep the rounded value inside the range.
  const z = Math.min(
    Math.floor(cfg.zoom.kMax * 100) / 100,
    Math.max(Math.ceil(cfg.zoom.kMin * 100) / 100, roundZoom(k)),
  );
  // Year y spans [x(y), x(y + 1)), so the year at the centre is the floor (a one-year event at
  // −852 is centred at −851.5, which is still −852).
  return { y: Math.floor(yearAt((span.x0 + span.x1) / 2, axis, cfg)), z };
}

/** The union of x spans, or null. */
function union(spans: { x0: number; x1: number }[]): { x0: number; x1: number } | null {
  if (spans.length === 0) return null;
  return {
    x0: Math.min(...spans.map((s) => s.x0)),
    x1: Math.max(...spans.map((s) => s.x1)),
  };
}

/** The view state for an item: its selection, plus a framing on the first axis it is drawn on. */
function viewFor(
  sel: ViewState['sel'],
  spanOn: (axis: Axis) => { x0: number; x1: number } | null,
  cfg: TimescaleConfig | null,
  framePx = FRAME_PX,
): string {
  const state: ViewState = { axis: 'scholarly', hide: [], ...(sel ? { sel } : {}) };
  if (cfg) {
    for (const axis of AXES) {
      const span = spanOn(axis);
      if (!span) continue;
      Object.assign(state, { axis }, framing(span, axis, cfg, framePx));
      break;
    }
  }
  return serializeViewState(state);
}

function rowsOf(dates: DatePair, t: T): ItemDateRow[] {
  return AXES.map((axis) => {
    const start = dates[`start_${axis}`];
    const end = dates[`end_${axis}`];
    const certainty = certaintyOf(start, end);
    return {
      axis,
      label: t(`axis.${axis}.name`),
      text: dateText(axis, t, start, end),
      ...(certainty ? { certainty: t(`certainty.${certainty}`) } : {}),
    };
  });
}

/** "ታሪካዊ ምርምር፦ 874–853 ዓ.ዓ.፤ ትውፊታዊ፦ ያልተወሰነ" (the first date block). */
function datesSummary(blocks: ItemDateBlock[], t: T): string {
  return (blocks[0]?.rows ?? [])
    .map((r) => t('page.date', { axis: r.label, date: r.text }))
    .join(t('page.date.separator'));
}

function refsText(refs: readonly ScriptureRef[], index: IndexFile): string[] {
  const books = index.books ?? {};
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of refs) {
    const book = books[r.book_id];
    const text = book ? formatRef(r, [book]) : refText(r);
    if (!seen.has(text)) {
      seen.add(text);
      out.push(text);
    }
  }
  return out;
}

/** An era's dates as DateValues (its YearPairs), so the same formatting applies. */
const ERA_CERTAINTY: Record<Era['certainty'], DateValue['certainty']> = {
  anchored: 'exact',
  approximate: 'approximate',
  disputed: 'disputed',
  tradition_only: 'tradition_only',
};
function eraRows(era: IndexEra, t: T): ItemDateRow[] {
  return AXES.map((axis) => {
    const s = era.start?.[axis];
    const e = era.end?.[axis];
    const label = t(`axis.${axis}.name`);
    if (s === undefined && e === undefined) return { axis, label, text: t('date.tbd') };
    const start = s ?? e!;
    const dv: DateValue = {
      start,
      ...(e !== undefined && e !== start ? { end: e } : {}),
      certainty: ERA_CERTAINTY[era.certainty],
      method: 'anchor',
    };
    const text = axis === 'scholarly' ? formatScholarly(dv, t) : formatTraditional(dv, t);
    return { axis, label, text, certainty: t(`page.era.certainty.${era.certainty}`) };
  });
}

/** Builds every page from a compiled index and its tiles. Pure. */
export function buildItemPages(
  index: IndexFile,
  tiles: readonly TileFile[],
  lang: Lang = 'am',
): ItemPage[] {
  const t = createT(lang);
  const cfg = index.timescale;
  const site = t('page.site');
  const streams = new Map(index.streams.map((s) => [s.id, s.name_am]));
  const pages: ItemPage[] = [];

  // Every tile's items, each once (a person can appear in two eras' tiles).
  const merged = {
    people: new Map<string, TileFile['people'][number]>(),
    reigns: new Map<string, TileFile['reigns'][number]>(),
    events: new Map<string, TileFile['events'][number]>(),
  };
  for (const tile of tiles) {
    for (const p of tile.people) merged.people.set(p.id, p);
    for (const r of tile.reigns) merged.reigns.set(r.id, r);
    for (const e of tile.events) merged.events.set(e.id, e);
  }
  const all = {
    people: [...merged.people.values()],
    reigns: [...merged.reigns.values()],
    events: [...merged.events.values()],
  };
  const geometry = (axis: Axis) => tiles.flatMap((tile) => [tile.axes[axis]]);

  const page = (
    kind: ItemKind,
    slug: string,
    name_am: string,
    name_en: string,
    dates: ItemDateBlock[],
    refs: string[],
    search: string,
    extra: Partial<ItemPage> = {},
  ): ItemPage => ({
    kind,
    slug,
    path: pathOf(kind, slug),
    canonical: `${SITE_URL}${pathOf(kind, slug)}`,
    name_am,
    name_en,
    title: t('page.title', { name: name_am, site }),
    description: '',
    dates,
    refs,
    search,
    ...extra,
  });

  for (const person of all.people) {
    const item = resolveSelection({ kind: 'person', id: person.id }, all)!;
    const blocks = dateBlocks(item, (id) => streams.get(id) ?? id, t).map((b) => ({
      ...(b.label ? { label: b.label } : {}),
      rows: rowsOf(b.dates, t),
    }));
    const search = viewFor(
      { kind: 'person', slug: person.slug },
      (axis) =>
        union(
          geometry(axis).flatMap((g) => [
            ...g.people.filter((s) => s.person_id === person.id),
            ...g.reigns.filter((s) => s.person_id === person.id),
          ]),
        ),
      cfg,
    );
    const p = page(
      'person',
      person.slug,
      person.name_am,
      person.name_en,
      blocks,
      refsText(person.refs, index),
      search,
    );
    p.description = t('page.description', {
      name: person.name_am,
      name_en: person.name_en,
      dates: datesSummary(blocks, t),
    });
    pages.push(p);
  }

  for (const event of all.events) {
    const blocks = [
      {
        rows: rowsOf(
          { start_scholarly: event.date_scholarly, start_traditional: event.date_traditional },
          t,
        ),
      },
    ];
    const search = viewFor(
      { kind: 'event', slug: event.slug },
      (axis) =>
        union(geometry(axis).flatMap((g) => g.events.filter((s) => s.event_id === event.id))),
      cfg,
    );
    const p = page(
      'event',
      event.slug,
      event.title_am,
      event.title_en,
      blocks,
      refsText(event.refs, index),
      search,
    );
    p.description = t('page.description', {
      name: event.title_am,
      name_en: event.title_en,
      dates: datesSummary(blocks, t),
    });
    pages.push(p);
  }

  for (const era of index.eras) {
    if (era.status !== 'live' || !era.tile) continue;
    const tile = tiles.find((tl) => tl.era === era.id);
    if (!tile) continue;
    const blocks = [{ rows: eraRows(era, t) }];
    const people = tile.people.map((p) => ({ name_am: p.name_am, href: pathOf('person', p.slug) }));
    const events = tile.events.map((e) => ({ name_am: e.title_am, href: pathOf('event', e.slug) }));
    const search = viewFor(undefined, (axis) => era.x[axis], cfg, ERA_FRAME_PX);
    const p = page('era', era.slug, era.name_am, era.name_en, blocks, [], search, {
      people,
      events,
    });
    p.description = t('page.description.era', {
      name: era.name_am,
      name_en: era.name_en,
      dates: datesSummary(blocks, t),
      people: people.length,
      events: events.length,
    });
    pages.push(p);
  }

  // Titles must be unique: two items with the same Amharic name also show the English one.
  const byTitle = new Map<string, ItemPage[]>();
  for (const p of pages) byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p]);
  for (const same of byTitle.values()) {
    if (same.length < 2) continue;
    for (const p of same) {
      p.title = t('page.title', { name: `${p.name_am} (${p.name_en})`, site });
    }
  }
  return pages;
}

async function readJson<V>(path: string): Promise<V | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as V;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Reads the compiled data and builds the pages; [] when there is no data or no live era. */
export async function loadItemPages(
  dataDir = 'public/data',
  lang: Lang = 'am',
): Promise<ItemPage[]> {
  const index = await readJson<IndexFile>(join(dataDir, INDEX_FILE));
  if (!index) return [];
  const tiles: TileFile[] = [];
  for (const era of index.eras) {
    if (era.status !== 'live' || !era.tile) continue;
    const tile = await readJson<TileFile>(join(dataDir, era.tile));
    if (tile) tiles.push(tile);
  }
  return buildItemPages(index, tiles, lang);
}

/** The pages of one kind, as getStaticPaths entries. */
export async function itemPaths(kind: ItemKind) {
  return (await loadItemPages())
    .filter((p) => p.kind === kind)
    .map((p) => ({ params: { slug: p.slug }, props: { page: p } }));
}
