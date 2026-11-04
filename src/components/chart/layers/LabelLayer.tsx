// LabelLayer: the reign labels (name, then name + years, as the zoom allows: FR-3, FR-4), the
// stream names (red ink where it meets contrast: DR-3), and the reign tooltip (hover on desktop,
// long-press on touch). Lettered in Abyssinica, never bold.
//
// Mounted in the screen-space labels group (text never goes in the x-scaled geometry group). The
// level-of-detail set is computed with React once per gesture end (from `committed.k`); during a
// gesture, the label nodes are re-placed imperatively from the viewport channel and hidden where
// their span has become too narrow, with no React render. The tooltip is imperative too.
//
// The task names `ui/Tooltip` (P2-S1-T4) for the tooltip; that component isn't merged yet, so
// this layer draws its own small SVG tooltip, to be swapped for it when it lands.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '../../../lib/core/contrast';
import { formatScholarly, formatTraditional } from '../../../lib/core/dates';
import type { DateValue } from '../../../lib/core/schema';
import {
  ink,
  MIN_TEXT_CONTRAST,
  pigment,
  streamNameInk,
  vellum,
  type PigmentKey,
} from '../../../lib/core/tokens';
import type { T } from '../../../lib/i18n';
import {
  fixedWidthMeasure,
  LOD_PAD_PX,
  visibleLabels,
  type LabelMode,
  type LodItem,
  type Measure,
} from '../../../lib/layout/lod';
import { FORK_YEARS } from '../../../lib/layout/streams';
import { spanDates, type Axis } from '../../../lib/layout/timescale';
import type { Viewport } from '../state';
import { reignBoxes, type ReignBox } from './ReignLayer';
import type { LayerProps } from './types';
import './labels.css';

/** Font sizes, px (labels.css matches). */
export const NAME_PX = 16;
export const YEARS_PX = 13;
export const STREAM_NAME_PX = 16;
/** A press this long on a reign, without moving, opens its tooltip. */
export const LONG_PRESS_MS = 500;
/** A touch that moves further than this is a pan, not a long-press. */
const LONG_PRESS_SLOP_PX = 10;
/** Bands at least this tall letter their name along the top; thinner ones centre it. */
const TOP_NAME_MIN_HEIGHT_PX = 72;
const STREAM_NAME_INSET_PX = 8;

// --- Colours -------------------------------------------------------------------------------

const meets = (text: string, fill: string) => contrastRatio(text, fill) >= MIN_TEXT_CONTRAST;

/** The preferred ink if it meets the contrast pair on this fill; otherwise the first that does. */
export function inkOn(fill: string, preferred: string): string {
  return [preferred, ink.black, ink.red, vellum.base].find((c) => meets(c, fill)) ?? ink.black;
}

const pigmentByFill = new Map(
  Object.entries(pigment).map(([key, hex]) => [hex.toLowerCase(), key as PigmentKey]),
);

/** A stream name's ink: red where it meets contrast on the fill (tokens.streamNameInk), else black. */
export function streamInk(fill: string): string {
  const key = pigmentByFill.get(fill.toLowerCase());
  return key ? ink[streamNameInk[key]] : inkOn(fill, ink.red);
}

// --- Measuring -----------------------------------------------------------------------------

const fontOf = (kind: 'name' | 'years') =>
  `${kind === 'name' ? NAME_PX : YEARS_PX}px "Abyssinica SIL", serif`;

/**
 * Canvas measureText with the chart font, cached per string; a fixed-width estimate where there
 * is no canvas (tests). Created afresh when fonts finish loading, so widths follow the real font.
 */
export function createMeasure(): Measure {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  const estimate = fixedWidthMeasure(NAME_PX, YEARS_PX, 0.85);
  if (!ctx) return estimate;
  const cache = new Map<string, number>();
  return (text, kind) => {
    const key = `${kind}\u0000${text}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = fontOf(kind);
      w = ctx.measureText(text).width || estimate(text, kind);
      cache.set(key, w);
    }
    return w;
  };
}

// --- Data ----------------------------------------------------------------------------------

export interface ReignLabelData extends LodItem {
  box: ReignBox;
  nameInk: string;
  yearsInk: string;
}

function years(start: DateValue | undefined, end: DateValue | undefined, axis: Axis, t: T) {
  const dv = spanDates(start, end);
  if (!dv) return '';
  return axis === 'scholarly' ? formatScholarly(dv, t) : formatTraditional(dv, t);
}

/** Everything a reign label needs, for each reign drawn on the current axis. */
type LabelInput = Pick<LayerProps, 'tile' | 'index' | 'axis' | 'cfg' | 'laneY' | 't'>;

export function reignLabelData(p: LabelInput): ReignLabelData[] {
  const people = new Map(p.tile.people.map((x) => [x.id, x]));
  const reigns = new Map(p.tile.reigns.map((x) => [x.id, x]));
  const fills = new Map(p.index.streams.map((s) => [s.id, s.fill_color]));
  const out: ReignLabelData[] = [];
  for (const box of reignBoxes(p)) {
    const { reign } = box;
    const person = people.get(reign.person_id);
    const data = reigns.get(reign.reign_id);
    if (!person || !data) continue;
    const [start, end] =
      p.axis === 'scholarly'
        ? [data.start_scholarly, data.end_scholarly]
        : [data.start_traditional, data.end_traditional];
    const fill = fills.get(reign.stream_id) ?? vellum.base;
    out.push({
      id: reign.reign_id,
      group: `${box.band.stream_id}:${reign.row}`,
      x0: reign.x0,
      x1: reign.x1,
      importance: person.importance,
      name: person.name_am,
      years: years(start, end, p.axis, p.t),
      height: box.y1 - box.y0,
      box,
      nameInk: inkOn(fill, ink.black),
      yearsInk: inkOn(fill, ink.brown),
    });
  }
  return out;
}

interface StreamName {
  id: string;
  name: string;
  ink: string;
  x0: number;
  x1: number;
  y: number;
}

function streamNames(p: Omit<LabelInput, 't'>): StreamName[] {
  const meta = new Map(p.index.streams.map((s) => [s.id, s]));
  const out: StreamName[] = [];
  for (const band of p.tile.axes[p.axis].bands) {
    const top = p.laneY.get(band.lane_id);
    const s = meta.get(band.stream_id);
    if (top === undefined || !s) continue;
    const cy = top + band.cy;
    const y =
      band.height >= TOP_NAME_MIN_HEIGHT_PX
        ? cy - band.height / 2 + STREAM_NAME_PX + 4
        : cy + STREAM_NAME_PX * 0.35;
    out.push({
      id: s.id,
      name: s.name_am,
      ink: streamInk(s.fill_color),
      // A forked stream tapers from its fork: letter its name where it is full width.
      x0: band.x0 + (s.parent_stream_id ? FORK_YEARS * p.cfg.pxPerYear : 0),
      x1: band.x1,
      y,
    });
  }
  return out;
}

/** Name and years baselines for a label centred on its slot. */
function baselines(box: ReignBox, mode: LabelMode): { name: number; years: number } {
  const cy = (box.y0 + box.y1) / 2;
  return mode === 'full'
    ? { name: cy - 2, years: cy + YEARS_PX + 1 }
    : { name: cy + NAME_PX * 0.35, years: cy };
}

// --- Imperative placement --------------------------------------------------------------------

interface Placed {
  /** Reign ids whose label (with its years) is on screen now. */
  full: Set<string>;
  /** Reign ids whose name is on screen now. */
  named: Set<string>;
}

type Box = [x0: number, x1: number, y0: number, y1: number];
const overlaps = (a: Box, b: Box) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];

function place(
  root: SVGGElement,
  v: Viewport,
  reigns: Map<string, ReignLabelData>,
  lod: Map<string, { mode: LabelMode; width: number }>,
  names: StreamName[],
  measure: Measure,
): Placed {
  const sx = (x: number) => v.k * x + v.x;
  // Stream names sit in the visible part of their stream, at its left.
  const nameBoxes = new Map<string, Box>();
  for (const n of names) {
    const el = root.querySelector<SVGTextElement>(`text[data-stream-name="${n.id}"]`);
    if (!el) continue;
    const w = measure(n.name, 'name') * (STREAM_NAME_PX / NAME_PX);
    const x = Math.max(sx(n.x0), 0) + STREAM_NAME_INSET_PX;
    const fits = x + w <= Math.min(sx(n.x1), v.width) - STREAM_NAME_INSET_PX;
    if (fits) {
      el.setAttribute('x', String(Math.round(x * 10) / 10));
      el.removeAttribute('visibility');
      nameBoxes.set(n.id, [x, x + w, n.y - STREAM_NAME_PX, n.y + 4]);
    } else {
      el.setAttribute('visibility', 'hidden');
    }
  }
  const placed: Placed = { full: new Set(), named: new Set() };
  for (const g of root.querySelectorAll<SVGGElement>('g.reign-label')) {
    const id = g.dataset.label!;
    const r = reigns.get(id);
    const label = lod.get(id);
    if (!r || !label) continue;
    // Centred in the visible part of the span, so a span running off screen keeps its label.
    const left = Math.max(sx(r.x0), 0) + LOD_PAD_PX;
    const right = Math.min(sx(r.x1), v.width) - LOD_PAD_PX;
    const half = label.width / 2;
    const mid = Math.min(Math.max(sx((r.x0 + r.x1) / 2), left + half), right - half);
    const y = (r.box.y0 + r.box.y1) / 2;
    const box: Box = [mid - half, mid + half, y - NAME_PX, y + NAME_PX];
    const streamName = nameBoxes.get(r.box.band.stream_id);
    // Hidden where the visible span no longer fits it (zooming out mid-gesture, or off screen),
    // or under the stream name.
    const show = right - left >= label.width && !(streamName && overlaps(box, streamName));
    if (!show) {
      g.setAttribute('visibility', 'hidden');
      continue;
    }
    g.removeAttribute('visibility');
    const x = String(Math.round(mid * 10) / 10);
    for (const text of g.querySelectorAll('text')) text.setAttribute('x', x);
    placed.named.add(id);
    if (label.mode === 'full') placed.full.add(id);
  }
  return placed;
}

// --- Tooltip -------------------------------------------------------------------------------

function showTooltip(
  tip: SVGGElement,
  r: ReignLabelData,
  at: { x: number; y: number },
  width: number,
  measure: Measure,
) {
  const [rect, name, yrs] = [
    tip.querySelector('rect')!,
    tip.querySelector<SVGTextElement>('text.tooltip-name')!,
    tip.querySelector<SVGTextElement>('text.tooltip-years')!,
  ];
  name.textContent = r.name;
  yrs.textContent = r.years;
  const pad = 8;
  const w = Math.max(measure(r.name, 'name'), measure(r.years, 'years')) + 2 * pad;
  const h = NAME_PX + YEARS_PX + 3 * pad;
  const x = Math.min(Math.max(at.x - w / 2, 4), Math.max(width - w - 4, 4));
  const y = at.y - h - 12 >= 0 ? at.y - h - 12 : at.y + 24;
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  name.setAttribute('x', String(pad));
  name.setAttribute('y', String(pad + NAME_PX * 0.85));
  yrs.setAttribute('x', String(pad));
  yrs.setAttribute('y', String(pad * 2 + NAME_PX + YEARS_PX * 0.7));
  tip.setAttribute('transform', `translate(${Math.round(x)},${Math.round(y)})`);
  tip.setAttribute('data-reign', r.id);
  tip.removeAttribute('visibility');
}

const hideTooltip = (tip: SVGGElement) => {
  tip.setAttribute('visibility', 'hidden');
  tip.removeAttribute('data-reign');
};

// --- Component -----------------------------------------------------------------------------

/** Swaps in a fresh measurer when web fonts finish loading (one React commit, not in a gesture). */
function useMeasure(): Measure {
  const [measure, setMeasure] = useState(createMeasure);
  useEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts) return;
    const measuredLoaded = fonts.status === 'loaded';
    let live = true;
    const refresh = () => live && setMeasure(() => createMeasure());
    void fonts.ready?.then(() => !measuredLoaded && refresh());
    fonts.addEventListener?.('loadingdone', refresh);
    return () => {
      live = false;
      fonts.removeEventListener?.('loadingdone', refresh);
    };
  }, []);
  return measure;
}

export default function LabelLayer(props: LayerProps) {
  const { tile, index, axis, cfg, laneY, t, viewport, committed } = props;
  const rootRef = useRef<SVGGElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const measure = useMeasure();

  const reigns = useMemo(
    () => reignLabelData({ tile, index, axis, cfg, laneY, t }),
    [tile, index, axis, cfg, laneY, t],
  );
  const names = useMemo(
    () => streamNames({ tile, index, axis, cfg, laneY }),
    [tile, index, axis, cfg, laneY],
  );
  const byId = useMemo(() => new Map(reigns.map((r) => [r.id, r])), [reigns]);
  const lod = useMemo(
    () =>
      committed
        ? visibleLabels(reigns, committed.k, measure)
        : new Map<string, { mode: LabelMode; width: number }>(),
    [reigns, committed, measure],
  );
  const placedRef = useRef<Placed>({ full: new Set(), named: new Set() });

  // Place after every render, then follow the live viewport imperatively (and close the tooltip:
  // the item under it is moving).
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const tip = tipRef.current!;
    const run = (v: Viewport) => {
      placedRef.current = place(root, v, byId, lod, names, measure);
    };
    const v = viewport.get() ?? committed;
    if (v) run(v);
    return viewport.subscribe((next) => {
      run(next);
      hideTooltip(tip);
    });
  }, [viewport, committed, byId, lod, names, measure]);

  // Tooltips: hover (mouse, pen) and long-press (touch) on a reign whose label is not fully shown.
  useEffect(() => {
    const root = rootRef.current!;
    const tip = tipRef.current!;
    const svg = root.ownerSVGElement;
    if (!svg) return;
    const width = () => viewport.get()?.width ?? committed?.width ?? svg.clientWidth;
    const local = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const reignAt = (e: Event) =>
      (e.target as Element | null)?.closest?.('[data-reign]')?.getAttribute('data-reign') ?? null;
    const open = (id: string, e: PointerEvent) => {
      const r = byId.get(id);
      if (!r || placedRef.current.full.has(id)) return hideTooltip(tip);
      showTooltip(tip, r, local(e), width(), measure);
    };

    let press: { id: string; pointerId: number; x: number; y: number; timer: number } | null = null;
    let suppressClickUntil = 0;
    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (press && press.pointerId === e.pointerId) {
          if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX)
            cancelPress();
        }
        return;
      }
      const id = reignAt(e);
      if (id) open(id, e);
      else hideTooltip(tip);
    };
    const onDown = (e: PointerEvent) => {
      cancelPress();
      if (e.pointerType !== 'touch') return;
      hideTooltip(tip);
      const id = reignAt(e);
      if (!id) return;
      const timer = window.setTimeout(() => {
        press = null;
        open(id, e);
        // The release that ends a long-press is not a tap.
        suppressClickUntil = Date.now() + 800;
      }, LONG_PRESS_MS);
      press = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer };
    };
    const onUp = () => cancelPress();
    const onLeave = () => {
      cancelPress();
      hideTooltip(tip);
    };
    const onClick = (e: Event) => {
      if (Date.now() < suppressClickUntil) {
        suppressClickUntil = 0;
        e.stopPropagation();
        e.preventDefault();
      }
    };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', onLeave);
    svg.addEventListener('click', onClick, { capture: true });
    return () => {
      cancelPress();
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      svg.removeEventListener('pointerleave', onLeave);
      svg.removeEventListener('click', onClick, { capture: true });
    };
  }, [byId, measure, viewport, committed]);

  return (
    <g ref={rootRef} className="chart-names">
      {names.map((n) => (
        <text key={n.id} className="stream-name" data-stream-name={n.id} y={n.y} fill={n.ink}>
          {n.name}
        </text>
      ))}
      {[...lod].map(([id, label]) => {
        const r = byId.get(id)!;
        const y = baselines(r.box, label.mode);
        return (
          <g key={id} className="reign-label" data-label={id} data-mode={label.mode}>
            <text className="reign-name" y={y.name} fill={r.nameInk}>
              {r.name}
            </text>
            {label.mode === 'full' && (
              <text className="reign-years" y={y.years} fill={r.yearsInk}>
                {r.years}
              </text>
            )}
          </g>
        );
      })}
      <g ref={tipRef} className="chart-tooltip" role="tooltip" visibility="hidden">
        <rect rx={6} />
        <text className="tooltip-name" />
        <text className="tooltip-years" />
      </g>
    </g>
  );
}
