// The minimap's geometry (FR-7): a strip of every era, in `order`, and the mapping between the
// chart's base x (k = 1, from timescale.ts via the index) and the strip's pixels. Pure.
//
// - Each era gets a box whose width is its share of `minimap_weight` (default 1). Coming-soon eras
//   have no dates, so the strip is proportional to weights, never to years.
// - A live era's box maps linearly to its span on the current axis (IndexEra.x).
// - Between two live boxes (coming-soon eras or gaps in between), the mapping is linear from the
//   end of one span to the start of the next, so it stays continuous and monotonic.
// - Before the first live span and after the last, it clamps: those parts of the chart (margins)
//   fall on the first box's left edge and the last box's right edge.
// - If no live era has years on an axis (e.g. only scholarly dates so far, and the traditional
//   domain is their calendar equivalent), the live boxes together map to the whole chart width on
//   that axis: a view range, never a dating claim (as timescale.ts says of that domain).
import type { IndexEra } from '../core/datafiles';
import { totalWidth, type Axis, type TimescaleConfig } from './timescale';

export interface MinimapBox {
  id: string;
  slug: string;
  name_am: string;
  name_en: string;
  live: boolean;
  /** Left edge and width in strip px. */
  left: number;
  width: number;
  /** The era's base-x span on each axis, or null (coming soon, or no years on that axis). */
  span: Record<Axis, { x0: number; x1: number } | null>;
}

export type MinimapEra = Pick<
  IndexEra,
  'id' | 'slug' | 'name_am' | 'name_en' | 'status' | 'order' | 'minimap_weight' | 'x' | 'certainty'
>;

export interface MinimapLayout {
  width: number;
  boxes: MinimapBox[];
  /** The chart's total width at k = 1 per axis (the fallback mapping), or null without a config. */
  content: Record<Axis, number> | null;
}

const weightOf = (e: MinimapEra) =>
  Number.isFinite(e.minimap_weight) && e.minimap_weight > 0 ? e.minimap_weight : 1;

/**
 * One box per era, in `order`, sized by weight across `widthPx`. A live tradition-only era with no
 * scholarly years sits in the scholarly axis's tradition-only band, so it takes the band's span.
 */
export function minimapLayout(
  eras: readonly MinimapEra[],
  widthPx: number,
  cfg?: TimescaleConfig | null,
): MinimapLayout {
  const sorted = [...eras].sort((a, b) => a.order - b.order);
  const total = sorted.reduce((s, e) => s + weightOf(e), 0);
  const width = Math.max(0, widthPx);
  let left = 0;
  const boxes = sorted.map((e): MinimapBox => {
    const w = total > 0 ? (weightOf(e) / total) * width : 0;
    const live = e.status === 'live';
    const band =
      live && !e.x.scholarly && e.certainty === 'tradition_only' && cfg?.band
        ? { x0: 0, x1: cfg.band.widthPx }
        : null;
    const box: MinimapBox = {
      id: e.id,
      slug: e.slug,
      name_am: e.name_am,
      name_en: e.name_en,
      live,
      left,
      width: w,
      span: {
        scholarly: live ? (e.x.scholarly ?? band) : null,
        traditional: live ? e.x.traditional : null,
      },
    };
    left += w;
    return box;
  });
  const content = cfg
    ? { scholarly: totalWidth('scholarly', cfg), traditional: totalWidth('traditional', cfg) }
    : null;
  return { width, boxes, content };
}

/**
 * The base-x span a box focuses on `axis`: its own span, or (when no live era has years on the
 * axis) the whole chart for a live box. Null for coming-soon boxes.
 */
export function boxSpan(
  layout: MinimapLayout,
  box: MinimapBox,
  axis: Axis,
): { x0: number; x1: number } | null {
  if (!box.live) return null;
  if (box.span[axis]) return box.span[axis];
  const anySpan = layout.boxes.some((b) => b.live && b.span[axis]);
  return !anySpan && layout.content ? { x0: 0, x1: layout.content[axis] } : null;
}

/** Matching knots: base x ↔ strip px, both increasing. Empty when no era has a span on `axis`. */
function knots(layout: MinimapLayout, axis: Axis): { x: number[]; px: number[] } {
  const x: number[] = [];
  const px: number[] = [];
  for (const b of layout.boxes) {
    const s = b.span[axis];
    if (!s || s.x1 <= s.x0) continue;
    // Keep the knots monotonic even if spans overlap (they shouldn't).
    if (x.length && s.x0 < x[x.length - 1]!) continue;
    x.push(s.x0, s.x1);
    px.push(b.left, b.left + b.width);
  }
  if (!x.length && layout.content) {
    const live = layout.boxes.filter((b) => b.live);
    if (live.length) {
      const last = live[live.length - 1]!;
      return { x: [0, layout.content[axis]], px: [live[0]!.left, last.left + last.width] };
    }
  }
  return { x, px };
}

/** Piecewise-linear interpolation through (from[i], to[i]); clamps outside. */
function interp(v: number, from: number[], to: number[]): number {
  const n = from.length;
  if (n === 0) return NaN;
  if (v <= from[0]!) return to[0]!;
  if (v >= from[n - 1]!) return to[n - 1]!;
  let i = 1;
  while (i < n - 1 && v > from[i]!) i++;
  const a = from[i - 1]!;
  const b = from[i]!;
  if (b === a) return to[i]!;
  return to[i - 1]! + ((v - a) / (b - a)) * (to[i]! - to[i - 1]!);
}

/** Strip px for a base x on `axis` (clamped to the live spans). */
export function baseToMinimap(baseX: number, layout: MinimapLayout, axis: Axis): number {
  const k = knots(layout, axis);
  return interp(baseX, k.x, k.px);
}

/** Base x on `axis` for a strip px (clamped to the live spans). */
export function minimapToBase(px: number, layout: MinimapLayout, axis: Axis): number {
  const k = knots(layout, axis);
  return interp(px, k.px, k.x);
}

export interface ChartView {
  /** d3 transform x and k. */
  x: number;
  k: number;
  /** Chart width, px. */
  width: number;
}

/** The window rectangle (strip px) for the chart's visible range, or null with no live span. */
export function viewToMinimap(
  view: ChartView,
  layout: MinimapLayout,
  axis: Axis,
): { left: number; width: number } | null {
  const k = knots(layout, axis);
  if (!k.x.length) return null;
  const a = interp(-view.x / view.k, k.x, k.px);
  const b = interp((view.width - view.x) / view.k, k.x, k.px);
  return { left: a, width: Math.max(0, b - a) };
}

/**
 * The view that centres the chart on strip px `px`, at zoom `k` (the caller's setView clamps it to
 * the content). Null with no live span.
 */
export function minimapToView(
  px: number,
  layout: MinimapLayout,
  axis: Axis,
  k: number,
  width: number,
): { x: number; k: number } | null {
  const base = minimapToBase(px, layout, axis);
  if (!Number.isFinite(base)) return null;
  return { x: width / 2 - base * k, k };
}

/** The strip px of the view's centre (what minimapToView inverts). */
export function viewCentreToMinimap(view: ChartView, layout: MinimapLayout, axis: Axis): number {
  return baseToMinimap((view.width / 2 - view.x) / view.k, layout, axis);
}
