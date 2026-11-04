// The chart's shareable view state (FR-10, architecture §5), as URL search parameters. Pure.
//
//   ?y=-850&z=12.5&ax=t&sel=p:ahab&hide=assyria,egypt
//
// - y: the year at the centre of the view, on the current axis (an integer);
// - z: the zoom k, 2 decimals;
// - ax: the primary axis, s (scholarly) or t (traditional);
// - sel: the selection: p:<person slug>, e:<event slug> or r:<reign id> (reigns have no slug);
// - hide: the hidden lanes, as comma-separated stream slugs.
//
// Parsing never throws: an invalid or out-of-range value is dropped on its own, and the rest is
// kept. Serializing omits defaults (scholarly axis, no selection, nothing hidden, and no y or z
// for the fitted view), so a fresh view has a clean `/`. Item pages (P2-S4-T3) reuse this to open
// the chart on an item.
import type { Axis } from '../layout/timescale';

export type ViewSelKind = 'person' | 'event' | 'reign';

export interface ViewState {
  axis: Axis;
  /** Centre year on `axis`, an integer; undefined keeps the default (fitted) centre. */
  y?: number;
  /** Zoom k, rounded to 2 decimals; undefined keeps the default (fitted) zoom. */
  z?: number;
  sel?: { kind: ViewSelKind; slug: string };
  /** Hidden lanes' stream slugs, sorted and unique. */
  hide: string[];
}

export const DEFAULT_VIEW_STATE: ViewState = { axis: 'scholarly', hide: [] };

/** Ranges a parsed value must fall in (inclusive). Without one, any finite value is kept. */
export interface ViewStateLimits {
  y?: Partial<Record<Axis, readonly [number, number]>>;
  z?: readonly [number, number];
}

const AXIS_CODE: Record<Axis, string> = { scholarly: 's', traditional: 't' };
const CODE_AXIS: Record<string, Axis> = { s: 'scholarly', t: 'traditional' };
const KIND_CODE: Record<ViewSelKind, string> = { person: 'p', event: 'e', reign: 'r' };
const CODE_KIND: Record<string, ViewSelKind> = { p: 'person', e: 'event', r: 'reign' };

/** schema.ts's Slug (people, events, streams) and Id (reigns). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const INT = /^-?\d{1,9}$/;
const DECIMAL = /^\d{1,9}(?:\.\d+)?$/;

const within = (v: number, r: readonly [number, number] | undefined) =>
  !r || (v >= r[0] && v <= r[1]);

/** z as it is written: 2 decimals. */
export const roundZoom = (k: number) => Math.round(k * 100) / 100;

export function parseViewState(search: string, limits: ViewStateLimits = {}): ViewState {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { ...DEFAULT_VIEW_STATE, hide: [] };
  }
  const get = (k: string) => params.get(k)?.trim() ?? null;
  const out: ViewState = { axis: CODE_AXIS[get('ax') ?? ''] ?? 'scholarly', hide: [] };

  const y = get('y');
  if (y !== null && INT.test(y)) {
    const n = Number(y);
    if (within(n, limits.y?.[out.axis])) out.y = n === 0 ? 0 : n;
  }

  const z = get('z');
  if (z !== null && DECIMAL.test(z)) {
    const n = roundZoom(Number(z));
    if (n > 0 && within(n, limits.z)) out.z = n;
  }

  const sel = get('sel');
  const m = sel !== null ? /^([per]):(.+)$/.exec(sel) : null;
  if (m) {
    const kind = CODE_KIND[m[1]!]!;
    const slug = m[2]!;
    if ((kind === 'reign' ? ID : SLUG).test(slug)) out.sel = { kind, slug };
  }

  const hide = get('hide');
  if (hide)
    out.hide = [...new Set(hide.split(',').map((s) => s.trim()))]
      .filter((s) => SLUG.test(s))
      .sort();
  return out;
}

/** The search string for `s` ('' for the default view, else starting with '?'). */
export function serializeViewState(s: ViewState): string {
  const parts: string[] = [];
  if (s.y !== undefined && Number.isFinite(s.y)) parts.push(`y=${Math.round(s.y)}`);
  if (s.z !== undefined && Number.isFinite(s.z) && s.z > 0) parts.push(`z=${roundZoom(s.z)}`);
  if (s.axis !== 'scholarly') parts.push(`ax=${AXIS_CODE[s.axis]}`);
  if (s.sel) parts.push(`sel=${KIND_CODE[s.sel.kind]}:${s.sel.slug}`);
  const hide = [...new Set(s.hide)].sort();
  if (hide.length) parts.push(`hide=${hide.join(',')}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
