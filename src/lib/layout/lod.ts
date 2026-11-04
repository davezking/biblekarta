// Level of detail for labels lettered inside spans (FR-4): which reigns show their name, which
// show name + years, and which show only their dividers at a zoom k. Pure: the text measurer is
// injected (canvas measureText with the loaded font in the browser, a fixed-width estimate in
// tests), so the same input always gives the same set.

/** Empty space kept between a label and its span's dividers, on each side, in screen px. */
export const LOD_PAD_PX = 6;
/** Minimum gap between two labels in the same group, in screen px. */
export const LOD_GAP_PX = 8;
/** A span shorter than this (its slot height, px) has room for the name only, not the years. */
export const FULL_MIN_HEIGHT_PX = 44;

export type LabelKind = 'name' | 'years';
/** Rendered width in px of a text in the given role (name or years font). */
export type Measure = (text: string, kind: LabelKind) => number;
/** `name`: the name only; `full`: the name with the years under it. */
export type LabelMode = 'name' | 'full';

export interface LodItem {
  id: string;
  /** Labels collide only within a group (a lane's row of spans). */
  group: string;
  /** Span at k = 1. */
  x0: number;
  x1: number;
  /** 1–5; the higher wins a collision. */
  importance: number;
  name: string;
  years: string;
  /** Height of the slot the label sits in, px; the years need FULL_MIN_HEIGHT_PX. */
  height?: number;
}

export interface LodLabel {
  mode: LabelMode;
  /** Width of the widest line shown, px. */
  width: number;
}

/** A fixed-width estimate: every character is `em` × the font size wide. */
export function fixedWidthMeasure(namePx: number, yearsPx: number, em = 0.6): Measure {
  return (text, kind) => [...text].length * em * (kind === 'name' ? namePx : yearsPx);
}

/** The room a span leaves for its label at zoom k, px. */
export function labelRoom(item: Pick<LodItem, 'x0' | 'x1'>, k: number): number {
  return (item.x1 - item.x0) * k - 2 * LOD_PAD_PX;
}

/**
 * The labels shown at zoom k, by item id. An item shows a label when its on-screen width fits the
 * measured name plus padding; it shows the years too when they also fit (and the slot is tall
 * enough). Labels are centred on their span; where two in the same group would overlap, the
 * higher importance wins (then the earlier span, then the id).
 */
export function visibleLabels(
  items: readonly LodItem[],
  k: number,
  measure: Measure,
): Map<string, LodLabel> {
  const candidates: { item: LodItem; label: LodLabel }[] = [];
  for (const item of items) {
    const room = labelRoom(item, k);
    const nameW = measure(item.name, 'name');
    if (nameW > room) continue;
    const yearsW = item.years ? measure(item.years, 'years') : Infinity;
    const tall = (item.height ?? Infinity) >= FULL_MIN_HEIGHT_PX;
    const full = tall && yearsW <= room;
    candidates.push({
      item,
      label: { mode: full ? 'full' : 'name', width: full ? Math.max(nameW, yearsW) : nameW },
    });
  }
  candidates.sort(
    (a, b) =>
      b.item.importance - a.item.importance ||
      a.item.x0 - b.item.x0 ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );
  const taken = new Map<string, [number, number][]>();
  const out = new Map<string, LodLabel>();
  for (const { item, label } of candidates) {
    const mid = ((item.x0 + item.x1) / 2) * k;
    const l = mid - label.width / 2;
    const r = mid + label.width / 2;
    const boxes = taken.get(item.group) ?? [];
    if (boxes.some(([a, b]) => l < b + LOD_GAP_PX && r > a - LOD_GAP_PX)) continue;
    boxes.push([l, r]);
    taken.set(item.group, boxes);
    out.set(item.id, label);
  }
  return out;
}
