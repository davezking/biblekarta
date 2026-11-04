// The one place a year becomes an x position (CLAUDE.md). Pure: no DOM, clock or globals.
// - traditional axis: linear in AA years (creation = AA 1)
// - scholarly axis: linear in astronomical years (1 BC = 0), with a tradition-only band to its
//   left for pre-Abraham items that have only a traditional date (R10)
// Positions are at zoom k = 1; the chart's d3-zoom transform applies k. A year y occupies
// [x(y), x(y + 1)), so a point date is one year wide and a span's end year is inclusive.
import {
  aaToAmeteMihret,
  ameteMihretToAa,
  ameteMihretToGregorianRange,
  spanOf,
} from '../core/dates';
import type { DateValue, Era } from '../core/schema';

export type Axis = 'scholarly' | 'traditional';

export interface Domain {
  /** First year shown (inclusive). */
  min: number;
  /** Last year shown (inclusive). */
  max: number;
}

export interface Band {
  /** AA range the band covers (inclusive). */
  aaMin: number;
  aaMax: number;
  /** Band width at k = 1; the band starts at x = 0. */
  widthPx: number;
  /** Space between the band and the scholarly domain at k = 1. */
  gapPx: number;
}

/** Plain numbers only: the compiler writes it into /data/index.json. */
export interface TimescaleConfig {
  scholarly: Domain;
  traditional: Domain;
  pxPerYear: number;
  band: Band | null;
  zoom: { kMin: number; kMax: number };
}

export interface TimescaleOptions {
  /** Viewport the domain is sized for at k = 1. */
  viewportPx?: number;
  /** Narrowest viewport (a small phone) that must still fit the whole domain at kMin. */
  minViewportPx?: number;
  /** Minimum width of one year at kMax. */
  minYearPxAtKMax?: number;
  /** Margin added to each end of a domain; default 5% of its span, at least 5 years. */
  marginYears?: number;
  /** Band width as a share of viewportPx. */
  bandShare?: number;
  bandGapPx?: number;
}

export const VIEWPORT_PX = 1440;
export const MIN_VIEWPORT_PX = 320;
export const MIN_YEAR_PX = 40;
export const MIN_TICK_GAP_PX = 48;
const BAND_SHARE = 0.2;
const BAND_GAP_PX = 24;

function marginFor(span: number, opts: TimescaleOptions): number {
  return opts.marginYears ?? Math.max(5, Math.ceil(span * 0.05));
}

function domainOf(years: number[], opts: TimescaleOptions): Domain | null {
  if (years.length === 0) return null;
  const lo = Math.min(...years);
  const hi = Math.max(...years);
  const m = marginFor(hi - lo, opts);
  return { min: lo - m, max: hi + m };
}

const yearsIn = (d: Domain) => d.max + 1 - d.min;

/**
 * Derives the config from the live eras' YearPairs, plus a margin. A tradition-only era with no
 * scholarly years sets the band. If no era gives years on one axis, that domain is the calendar
 * equivalent of the other (see equivalentYear); it is a view range, not a dating claim.
 */
export function buildTimescaleConfig(
  eras: readonly Era[],
  opts: TimescaleOptions = {},
): TimescaleConfig {
  const live = eras.filter((e) => e.status === 'live');
  const pairs = live.flatMap((e) => [e.start, e.end]).filter((p) => p !== undefined);
  const schol = domainOf(
    pairs.map((p) => p.scholarly).filter((y) => y !== undefined),
    opts,
  );
  const trad = domainOf(
    pairs.map((p) => p.traditional).filter((y) => y !== undefined),
    opts,
  );
  if (!schol && !trad) throw new Error('buildTimescaleConfig: no live era has a year');

  const scholarly = schol ?? {
    min: equivalentYear(trad!.min, 'traditional', 'scholarly'),
    max: equivalentYear(trad!.max, 'traditional', 'scholarly'),
  };
  const traditional = trad ?? {
    min: equivalentYear(schol!.min, 'scholarly', 'traditional'),
    max: equivalentYear(schol!.max, 'scholarly', 'traditional'),
  };

  const viewportPx = opts.viewportPx ?? VIEWPORT_PX;
  const bandAa = live
    .filter(
      (e) =>
        e.certainty === 'tradition_only' &&
        e.start?.scholarly === undefined &&
        e.end?.scholarly === undefined,
    )
    .flatMap((e) => [e.start?.traditional, e.end?.traditional])
    .filter((y) => y !== undefined);
  const band: Band | null =
    bandAa.length === 0
      ? null
      : {
          aaMin: Math.min(...bandAa),
          aaMax: Math.max(...bandAa),
          widthPx: viewportPx * (opts.bandShare ?? BAND_SHARE),
          gapPx: opts.bandGapPx ?? BAND_GAP_PX,
        };

  const bandPx = band ? band.widthPx + band.gapPx : 0;
  if (bandPx >= viewportPx) throw new Error('buildTimescaleConfig: the band fills the viewport');
  const pxPerYear = Math.min(
    (viewportPx - bandPx) / yearsIn(scholarly),
    viewportPx / yearsIn(traditional),
  );
  // k = 1 fits viewportPx; zooming out to kMin fits the narrowest phone too (FR-6, DR-12).
  const kMin = Math.min(1, (opts.minViewportPx ?? MIN_VIEWPORT_PX) / viewportPx);
  const kMax = Math.max(kMin, (opts.minYearPxAtKMax ?? MIN_YEAR_PX) / pxPerYear);
  return { scholarly, traditional, pxPerYear, band, zoom: { kMin, kMax } };
}

/** Where the axis domain starts at k = 1 (after the band on the scholarly axis). */
function offset(axis: Axis, cfg: TimescaleConfig): number {
  return axis === 'scholarly' && cfg.band ? cfg.band.widthPx + cfg.band.gapPx : 0;
}

/** Total chart width at k = 1. */
export function totalWidth(axis: Axis, cfg: TimescaleConfig): number {
  return x(cfg[axis].max + 1, axis, cfg);
}

/**
 * Left edge of `year` at k = 1. Linear for any year; with a band, scholarly years before the
 * domain would land in the band's space, so the domain must cover every placed item.
 */
export function x(year: number, axis: Axis, cfg: TimescaleConfig): number {
  return offset(axis, cfg) + (year - cfg[axis].min) * cfg.pxPerYear;
}

function bandPxPerYear(band: Band): number {
  return band.widthPx / (band.aaMax + 1 - band.aaMin);
}

/** Left edge of AA year `aa` inside the tradition-only band, at k = 1. */
export function xBand(aa: number, cfg: TimescaleConfig): number {
  if (!cfg.band) throw new Error('xBand: this config has no tradition-only band');
  return (aa - cfg.band.aaMin) * bandPxPerYear(cfg.band);
}

/** Float division can land a hair off a whole year; snap those back so round trips are exact. */
function snap(v: number): number {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 ? r : v;
}

export type Inverted = { band: false; year: number } | { band: true; aa: number };

/**
 * The (fractional) year at `px` (k = 1). On the scholarly axis, points left of the domain are in
 * the band; the gap goes to the nearer of the band's end or the domain's start.
 */
export function invert(px: number, axis: Axis, cfg: TimescaleConfig): Inverted {
  const off = offset(axis, cfg);
  const band = axis === 'scholarly' ? cfg.band : null;
  if (band && px < off) {
    if (px <= band.widthPx) {
      return { band: true, aa: snap(band.aaMin + px / bandPxPerYear(band)) };
    }
    if (px < band.widthPx + band.gapPx / 2) return { band: true, aa: band.aaMax + 1 };
    return { band: false, year: cfg[axis].min };
  }
  return { band: false, year: snap(cfg[axis].min + (px - off) / cfg.pxPerYear) };
}

export interface Datable {
  scholarly?: DateValue;
  traditional?: DateValue;
}

export type UnplacedReason = 'relative' | 'missing' | 'no-band' | 'outside-band';

export type Placement =
  { kind: 'axis' | 'band'; x0: number; x1: number } | { kind: 'unplaced'; reason: UnplacedReason };

/**
 * Where an item goes on `axis` at k = 1, or why it can't be placed. Nothing is ever given an
 * invented position: a date with no year (method "relative") or no date at all is unplaced
 * (counted, not shown). On the scholarly axis, an item with no scholarly year (no date, or a
 * relative one) but a dated tradition-only traditional date goes in the band.
 */
export function place(item: Datable, axis: Axis, cfg: TimescaleConfig): Placement {
  const dv = item[axis];
  const span = dv ? spanOf(dv) : null;
  if (span) return { kind: 'axis', x0: x(span[0], axis, cfg), x1: x(span[1] + 1, axis, cfg) };
  // A date with no year counts as no date here, so a tradition-only item can still use the band.
  const trad = item.traditional;
  if (axis === 'scholarly' && trad?.certainty === 'tradition_only') {
    const aa = spanOf(trad);
    if (!aa) return { kind: 'unplaced', reason: 'relative' };
    const band = cfg.band;
    if (!band) return { kind: 'unplaced', reason: 'no-band' };
    if (aa[0] < band.aaMin || aa[1] > band.aaMax) {
      return { kind: 'unplaced', reason: 'outside-band' };
    }
    return { kind: 'band', x0: xBand(aa[0], cfg), x1: xBand(aa[1] + 1, cfg) };
  }
  return { kind: 'unplaced', reason: dv?.method === 'relative' ? 'relative' : 'missing' };
}

/**
 * One DateValue covering a start and an end date (e.g. a reign's start_scholarly and
 * end_scholarly), for place(). If either has no year, that one is returned, so the item stays
 * unplaced rather than getting a guessed span.
 */
export function spanDates(start?: DateValue, end?: DateValue): DateValue | undefined {
  if (!start || !end) return start ?? end;
  const a = spanOf(start);
  if (!a) return start;
  const b = spanOf(end);
  if (!b) return end;
  return { ...start, start: Math.min(a[0], b[0]), end: Math.max(a[1], b[1]) };
}

export type TickLevel = 'century' | 'half' | 'decade' | 'year';

export interface Tick {
  year: number;
  level: TickLevel;
  /** Half-centuries are drawn in red ink (DR-7). */
  red: boolean;
  /** Left edge of the year at k = 1. */
  x: number;
}

/** Steps from finest to coarsest; steps above 100 are coarser century ticks. */
const STEPS = [1, 10, 50, 100, 200, 500, 1000, 2000, 5000];

/** The year as a reader sees it: AA as is; astronomical as BC/AD (−799 is 800 BC). */
function labelYear(year: number, axis: Axis): number {
  return axis === 'scholarly' && year <= 0 ? 1 - year : year;
}

function levelOf(label: number): TickLevel {
  if (label % 100 === 0) return 'century';
  if (label % 50 === 0) return 'half';
  if (label % 10 === 0) return 'decade';
  return 'year';
}

/**
 * Ticks for the visible range [px0, px1] (in k = 1 coordinates, i.e. already inverted from the
 * zoom transform) at zoom `k`. Picks the finest level whose ticks stay ≥ 48 screen px apart.
 * Ticks sit on round BC/AD or AA years, so the scholarly ones are uneven across 1 BC / AD 1.
 */
export function ticks(
  axis: Axis,
  k: number,
  [px0, px1]: [number, number],
  cfg: TimescaleConfig,
): Tick[] {
  const yearPx = cfg.pxPerYear * k;
  const step = STEPS.find((s) => s * yearPx >= MIN_TICK_GAP_PX) ?? STEPS[STEPS.length - 1]!;
  const lo = Math.max(px0, offset(axis, cfg));
  if (px1 < lo) return [];
  const y0 = Math.ceil(snap(cfg[axis].min + (lo - offset(axis, cfg)) / cfg.pxPerYear));
  const y1 = Math.floor(snap(cfg[axis].min + (px1 - offset(axis, cfg)) / cfg.pxPerYear));
  const out: Tick[] = [];
  for (let y = y0; y <= y1; y++) {
    const label = labelYear(y, axis);
    if (label % step !== 0) continue;
    const level = levelOf(label);
    out.push({ year: y, level, red: level === 'half', x: x(y, axis, cfg) });
  }
  return out;
}

/**
 * The year on axis `to` that is the calendar equivalent of `year` on axis `from`, used only to
 * keep the view centred when the reader switches axis. This is a calendar conversion
 * (AA ↔ Amete Mihret ↔ Gregorian, through dates.ts), NOT a claim that the two chronologies date
 * any event the same way. A Gregorian year maps to the AM year covering its January–September,
 * so the conversion round-trips. A fractional year (e.g. a view centre) keeps its fraction.
 */
export function equivalentYear(year: number, from: Axis, to: Axis): number {
  if (from === to) return year;
  const whole = Math.floor(year);
  const frac = year - whole;
  if (from === 'traditional') {
    return ameteMihretToGregorianRange(aaToAmeteMihret(whole))[1] + frac;
  }
  const gregorianOfAm0 = ameteMihretToGregorianRange(0)[1];
  return ameteMihretToAa(whole - gregorianOfAm0) + frac;
}
