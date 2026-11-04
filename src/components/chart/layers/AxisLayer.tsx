// AxisLayer: the year labels (DR-7). The top row is Ge'ez numerals with half-centuries in red ink;
// the bottom row is Arabic numerals. Both are Abyssinica (manuscript text). The scholarly axis
// labels BC/AD years; the traditional axis labels AA years.
//
// Labels are screen-space text in the labels group (text never goes in the x-scaled geometry
// group, where it would stretch). The tick set is computed with React at each gesture end (from
// `committed`), for the visible range plus one screen on each side. During a gesture, the label
// nodes' x and visibility are re-placed imperatively from the viewport channel, with no React
// render. A label that would overlap another is dropped; coarser levels win.
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { astroToBcAd, type Era } from '../../../lib/core/dates';
import { toGeez } from '../../../lib/core/geez';
import type { T } from '../../../lib/i18n';
import {
  MIN_TICK_GAP_PX,
  MIN_YEAR_PX,
  ticks,
  totalWidth,
  type Axis,
  type TickLevel,
  type TimescaleConfig,
} from '../../../lib/layout/timescale';
import { AXIS_BAND_PX } from '../geometry';
import type { Viewport } from '../state';
import { visibleRange, type ViewportChannel } from '../viewport';
import type { LayerProps } from './types';
import './axis.css';

/**
 * Labels are offered every LABEL_GAP_PX on screen. ticks() keeps its ticks ≥ 48 px apart, but one
 * year is only ≥ 40 px wide at kMax (MIN_YEAR_PX), so at 48 px single years would never be
 * labelled. Offering them at 40 px and dropping the ones that would overlap (below) labels single
 * years at full zoom.
 */
export const LABEL_GAP_PX = MIN_YEAR_PX;
/** Minimum empty space between two labels on a row. */
export const LABEL_PAD_PX = 8;
/** Label font size; matches --font-size-xs in axis.css. */
export const LABEL_FONT_PX = 13;
/** Baseline of the top row (inside the axis band above the first lane). */
export const TOP_BASELINE_PX = AXIS_BAND_PX - 12;
/**
 * The bottom row's baseline sits this far above the chart's bottom edge, inside the bottom axis
 * band that placeLanes reserves below the last lane (AXIS_BOTTOM_PX in ../geometry).
 */
export const BOTTOM_INSET_PX = 8;
const CAPTION_X_PX = 4;

const LEVEL_RANK: Record<TickLevel, number> = { century: 0, half: 1, decade: 2, year: 3 };

export interface AxisLabel {
  /** The axis year (astronomical on scholarly, AA on traditional). */
  year: number;
  /** Line x at k = 1 (the year's left edge), from timescale.ts. */
  x: number;
  level: TickLevel;
  red: boolean;
  era: Era | null;
  /** Top row text (Ge'ez numerals). */
  geez: string;
  /** Bottom row text (Arabic numerals). */
  arabic: string;
}

/** The labels for the viewport's visible range plus one screen width on each side, within the domain. */
export function axisLabels(axis: Axis, v: Viewport, cfg: TimescaleConfig, t: T): AxisLabel[] {
  const [b0, b1] = visibleRange(v);
  const pad = b1 - b0;
  // (1 + 1e-9): at kMax a year is exactly LABEL_GAP_PX, which rounding must not push below.
  const k = ((v.k * MIN_TICK_GAP_PX) / LABEL_GAP_PX) * (1 + 1e-9);
  // ticks() stops at the domain's start but not its end; clamp both.
  const range: [number, number] = [
    Math.max(0, b0 - pad),
    Math.min(totalWidth(axis, cfg), b1 + pad),
  ];
  const tk = ticks(axis, k, range, cfg);
  const labels = tk.map((tick) => {
    const { year, era } =
      axis === 'scholarly' ? astroToBcAd(tick.year) : { year: tick.year, era: null };
    return { tick, year, era };
  });
  // Near 1 BC / AD 1, the AD labels carry their era so the two runs of numbers are told apart.
  const mixed = labels.some((l) => l.era === 'BC') && labels.some((l) => l.era === 'AD');
  const withEra = (era: Era | null, n: string) =>
    mixed && era === 'AD' ? t('date.ad', { year: n }) : n;
  return labels.map(({ tick, year, era }) => ({
    year: tick.year,
    x: tick.x,
    level: tick.level,
    red: tick.red,
    era,
    geez: withEra(era, toGeez(year)),
    arabic: withEra(era, String(year)),
  }));
}

/** The caption at the left of each row: the era of the first visible label, or the AA prefix. */
export function captionText(axis: Axis, era: Era | null, t: T): string {
  if (axis === 'traditional') return t('axis.traditional.prefix');
  return t(era === 'AD' ? 'date.ad' : 'date.bc', { year: '' }).trim();
}

/**
 * Screen x for each label (its centre), or null where it is dropped: off screen, over the caption
 * (which takes [0, reserveLeft]), or overlapping a label of the same or a coarser level.
 */
export function placeRow(
  labels: readonly Pick<AxisLabel, 'x' | 'level'>[],
  widths: readonly number[],
  v: Viewport,
  reserveLeft = 0,
): (number | null)[] {
  const out: (number | null)[] = labels.map(() => null);
  const taken: [number, number][] = [];
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => LEVEL_RANK[labels[a]!.level] - LEVEL_RANK[labels[b]!.level] || a - b);
  for (const i of order) {
    const sx = v.k * labels[i]!.x + v.x;
    const half = widths[i]! / 2;
    const l = sx - half;
    const r = sx + half;
    if (l < reserveLeft || r > v.width) continue;
    if (taken.some(([a, b]) => l < b + LABEL_PAD_PX && r > a - LABEL_PAD_PX)) continue;
    taken.push([l, r]);
    out[i] = sx;
  }
  return out;
}

const isGeezDigit = (c: string) => c >= '፩' && c <= '፼';

// Canvas measurement, cached per text: no forced layout (getComputedTextLength would lay out the
// whole chart right after a commit). The cache is cleared when web fonts finish loading.
const widthCache = new Map<string, number>();
let canvas: CanvasRenderingContext2D | null = null;
function canvasWidth(text: string): number {
  if (!canvas) {
    try {
      canvas =
        typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    } catch {
      canvas = null;
    }
  }
  if (!canvas) return 0;
  let w = widthCache.get(text);
  if (w === undefined) {
    canvas.font = `${LABEL_FONT_PX}px "Abyssinica SIL", serif`;
    w = canvas.measureText(text).width;
    widthCache.set(text, w);
  }
  return w;
}

/** Drops the canvas and the cached widths (tests mock the canvas per test). */
export function resetAxisMeasure(): void {
  canvas = null;
  widthCache.clear();
}

/** The rendered width of a label; estimated where there is no canvas (tests). */
function measure(el: SVGTextElement): number {
  const text = el.textContent ?? '';
  const w = canvasWidth(text);
  if (w > 0) return w;
  let em = 0;
  for (const c of text) em += isGeezDigit(c) ? 0.85 : 0.6;
  return em * LABEL_FONT_PX;
}

interface Row {
  g: SVGGElement;
  caption: SVGTextElement;
  texts: SVGTextElement[];
  widths: number[];
}

function rowOf(g: SVGGElement): Row {
  const caption = g.querySelector<SVGTextElement>('text.axis-caption')!;
  const texts = [...g.querySelectorAll<SVGTextElement>('text.axis-label')];
  return { g, caption, texts, widths: texts.map(measure) };
}

/** Caption text → its rendered width, so a gesture frame does not force a layout to measure it. */
type CaptionWidths = Map<string, number>;

function placeAll(
  rows: Row[],
  labels: readonly AxisLabel[],
  v: Viewport,
  axis: Axis,
  t: T,
  captionWidths: CaptionWidths,
): void {
  // The caption names the era of the first label on screen (scholarly), or the AA prefix.
  const first = labels.find((l) => v.k * l.x + v.x >= 0);
  const caption = captionText(axis, first?.era ?? null, t);
  for (const row of rows) {
    if (row.caption.textContent !== caption) row.caption.textContent = caption;
  }
  // Measured once per caption text (both rows share the font), before any label is moved.
  let captionWidth = captionWidths.get(caption);
  if (captionWidth === undefined) {
    captionWidth = measure(rows[0]!.caption);
    captionWidths.set(caption, captionWidth);
  }
  const reserve = CAPTION_X_PX + captionWidth;
  for (const row of rows) {
    const xs = placeRow(labels, row.widths, v, reserve);
    row.texts.forEach((el, i) => {
      const sx = xs[i];
      if (sx === null || sx === undefined) {
        el.setAttribute('visibility', 'hidden');
      } else {
        el.setAttribute('x', String(Math.round(sx * 10) / 10));
        el.removeAttribute('visibility');
      }
    });
  }
}

/** Web fonts settling: `document.fonts.ready` (read once per page) and each `loadingdone`. */
let fontsReady: Promise<unknown> | undefined;
function onFontsLoaded(cb: () => void): () => void {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) return () => {};
  if (fonts.status !== 'loaded') {
    fontsReady ??= fonts.ready ?? Promise.resolve();
    void fontsReady.then(cb);
  }
  fonts.addEventListener?.('loadingdone', cb);
  return () => fonts.removeEventListener?.('loadingdone', cb);
}

function usePlacement(
  refs: RefObject<SVGGElement | null>[],
  labels: readonly AxisLabel[],
  viewport: ViewportChannel,
  committed: Viewport | null,
  axis: Axis,
  t: T,
) {
  // After each render (a new tick set), measure the labels once and place them; then follow the
  // live viewport imperatively until the next gesture end.
  useLayoutEffect(() => {
    const rows = refs.map((r) => rowOf(r.current!));
    const captionWidths: CaptionWidths = new Map();
    const place = (v: Viewport) => placeAll(rows, labels, v, axis, t, captionWidths);
    const v = viewport.get() ?? committed;
    if (v) place(v);
    const unsubscribe = viewport.subscribe(place);

    // Abyssinica loads with font-display: swap, so the chart can hydrate while a fallback font
    // is drawn. When web fonts finish loading, measure again and re-place. (document.fonts.ready
    // is read once per page: reading it updates style and layout, too costly on every commit.)
    let live = true;
    const remeasure = () => {
      if (!live) return;
      widthCache.clear();
      for (const row of rows) row.widths = row.texts.map(measure);
      captionWidths.clear();
      const now = viewport.get() ?? committed;
      if (now) place(now);
    };
    const unsubscribeFonts = onFontsLoaded(remeasure);
    return () => {
      live = false;
      unsubscribe();
      unsubscribeFonts();
    };
  }, [refs, labels, viewport, committed, axis, t]);
}

export default function AxisLayer({ axis, cfg, viewport, committed, height, t }: LayerProps) {
  const top = useRef<SVGGElement>(null);
  const bottom = useRef<SVGGElement>(null);
  const refs = useMemo(() => [top, bottom], []);
  const labels = useMemo(
    () => (committed ? axisLabels(axis, committed, cfg, t) : []),
    [axis, committed, cfg, t],
  );
  usePlacement(refs, labels, viewport, committed, axis, t);

  const bottomY = height - BOTTOM_INSET_PX;
  return (
    <g className="chart-axis" aria-hidden="true">
      <g ref={top} className="axis-row axis-top">
        <text className="axis-caption" x={CAPTION_X_PX} y={TOP_BASELINE_PX} />
        {labels.map((l) => (
          <text
            key={l.year}
            className={l.red ? 'axis-label axis-red' : 'axis-label'}
            data-year={l.year}
            y={TOP_BASELINE_PX}
          >
            {l.geez}
          </text>
        ))}
      </g>
      <g ref={bottom} className="axis-row axis-bottom">
        <text className="axis-caption" x={CAPTION_X_PX} y={bottomY} />
        {labels.map((l) => (
          <text key={l.year} className="axis-label" data-year={l.year} y={bottomY}>
            {l.arabic}
          </text>
        ))}
      </g>
    </g>
  );
}
