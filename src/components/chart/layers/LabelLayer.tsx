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
import { invert, spanDates, x as yearToX, type Axis } from '../../../lib/layout/timescale';
import { createWriter, type Write } from '../dom-writer';
import type { Viewport } from '../state';
import { ALL_Y, atEdge, nearCommitted, nearView, panShifting, type YBand } from '../viewport';
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
export const LONG_PRESS_SLOP_PX = 10;
/** The click that follows a long-press's release arrives within this long. */
const CLICK_AFTER_PRESS_MS = 400;
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

export interface StreamName {
  id: string;
  name: string;
  ink: string;
  x0: number;
  x1: number;
  y: number;
}

/** Where a forked stream reaches full width: FORK_YEARS after its start, through timescale.ts. */
function afterFork(x0: number, axis: Axis, cfg: LayerProps['cfg']): number {
  const at = invert(x0, axis, cfg);
  return at.band ? x0 : yearToX(at.year + FORK_YEARS, axis, cfg);
}

/** Every stream's name, with its span and baseline, on the current axis. */
export function streamNames(p: Omit<LabelInput, 't'>): StreamName[] {
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
      x0: s.parent_stream_id ? afterFork(band.x0, p.axis, p.cfg) : band.x0,
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

/** A screen box: [x0, x1, y0, y1]. */
export type Box = [x0: number, x1: number, y0: number, y1: number];
export const overlaps = (a: Box, b: Box) =>
  a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];

/**
 * Where each stream name sits on screen: in the visible part of its stream, at its left. Names
 * that do not fit there are left out. Pure, so other layers (EventLayer's titles) can keep off the
 * names without reading them from the DOM.
 */
export function streamNameBoxes(
  names: readonly StreamName[],
  v: Viewport,
  measure: Measure,
): Map<string, { x: number; box: Box }> {
  const sx = (x: number) => v.k * x + v.x;
  const out = new Map<string, { x: number; box: Box }>();
  for (const n of names) {
    const w = measure(n.name, 'name') * (STREAM_NAME_PX / NAME_PX);
    const x = Math.max(sx(n.x0), 0) + STREAM_NAME_INSET_PX;
    if (x + w <= Math.min(sx(n.x1), v.width) - STREAM_NAME_INSET_PX) {
      out.set(n.id, { x, box: [x, x + w, n.y - STREAM_NAME_PX, n.y + 4] });
    }
  }
  return out;
}

/** The label nodes, looked up once per render rather than on every viewport frame. */
interface Nodes {
  names: Map<string, SVGTextElement>;
  labels: { g: SVGGElement }[];
}

function nodesOf(root: SVGGElement): Nodes {
  const names = new Map<string, SVGTextElement>();
  for (const el of root.querySelectorAll<SVGTextElement>('text[data-stream-name]')) {
    names.set(el.dataset.streamName!, el);
  }
  const labels = [...root.querySelectorAll<SVGGElement>('g.reign-label')].map((g) => ({ g }));
  return { names, labels };
}

/** Stream names sit in the visible part of their stream, at its left. Returns their boxes. */
function placeNames(
  nodes: Nodes,
  v: Viewport,
  names: StreamName[],
  measure: Measure,
  write: Write,
): Map<string, Box> {
  const placed = streamNameBoxes(names, v, measure);
  const nameBoxes = new Map<string, Box>();
  for (const n of names) {
    const el = nodes.names.get(n.id);
    if (!el) continue;
    const at = placed.get(n.id);
    if (at) {
      write(el, 'x', String(Math.round(at.x * 10) / 10));
      write(el, 'visibility', null);
      nameBoxes.set(n.id, at.box);
    } else {
      write(el, 'visibility', 'hidden');
    }
  }
  return nameBoxes;
}

interface LabelPlacement extends Placed {
  /** Labels whose span is not wholly on screen: clamped to its visible part, or hidden by it. */
  edge: Set<string>;
}

/**
 * Places the reign labels for the viewport. With `only`, just those labels are placed, inside a
 * group shifted by `dx` (a pan frame: the rest moved with the group).
 */
function placeLabels(
  nodes: Nodes,
  v: Viewport,
  reigns: Map<string, ReignLabelData>,
  lod: Map<string, { mode: LabelMode; width: number }>,
  nameBoxes: Map<string, Box>,
  band: YBand,
  write: Write,
  only?: { ids: Set<string>; dx: number },
): LabelPlacement {
  const sx = (x: number) => v.k * x + v.x;
  const placed: LabelPlacement = { full: new Set(), named: new Set(), edge: new Set() };
  for (const { g } of nodes.labels) {
    const id = g.dataset.label!;
    if (only && !only.ids.has(id)) continue;
    const r = reigns.get(id);
    const label = lod.get(id);
    if (!r || !label) continue;
    const sx0 = sx(r.x0);
    const sx1 = sx(r.x1);
    if (atEdge(v, sx0, sx1)) placed.edge.add(id);
    // Far off screen, or outside the window's y band: out of layout until it comes near.
    const near = nearView(v, band, sx0, sx1, r.box.y0, r.box.y1);
    write(g, 'display', near ? null : 'none');
    if (!near) continue;
    // Centred in the visible part of the span, so a span running off screen keeps its label.
    const left = Math.max(sx0, 0) + LOD_PAD_PX;
    const right = Math.min(sx1, v.width) - LOD_PAD_PX;
    const half = label.width / 2;
    const mid = Math.min(Math.max(sx((r.x0 + r.x1) / 2), left + half), right - half);
    const y = (r.box.y0 + r.box.y1) / 2;
    const box: Box = [mid - half, mid + half, y - NAME_PX, y + NAME_PX];
    const streamName = nameBoxes.get(r.box.band.stream_id);
    // Hidden where the visible span no longer fits it (zooming out mid-gesture, or off screen),
    // or under the stream name.
    const show = right - left >= label.width && !(streamName && overlaps(box, streamName));
    if (!show) {
      write(g, 'visibility', 'hidden');
      continue;
    }
    write(g, 'visibility', null);
    // Moved as a group: a transform does not re-lay out the text, as a new x would.
    write(g, 'transform', `translate(${Math.round((mid - (only?.dx ?? 0)) * 10) / 10},0)`);
    placed.named.add(id);
    if (label.mode === 'full') placed.full.add(id);
  }
  return placed;
}

/** Places the stream names and every reign label. */
function place(
  nodes: Nodes,
  v: Viewport,
  reigns: Map<string, ReignLabelData>,
  lod: Map<string, { mode: LabelMode; width: number }>,
  names: StreamName[],
  measure: Measure,
  band: YBand = ALL_Y,
  write: Write = createWriter(),
): LabelPlacement {
  const nameBoxes = placeNames(nodes, v, names, measure, write);
  return placeLabels(nodes, v, reigns, lod, nameBoxes, band, write);
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

/** The view the tooltip opened on: finger jitter (a pixel or two of pan) must not close it. */
const tipViews = new WeakMap<SVGGElement, Viewport>();

/** Whether the view moved more than finger jitter since `from`. */
export function movedPast(from: Viewport, to: Viewport, slopPx = LONG_PRESS_SLOP_PX): boolean {
  return Math.abs(to.x - from.x) > slopPx || Math.abs(to.k / from.k - 1) > 0.02;
}

const hideTooltip = (tip: SVGGElement) => {
  tipViews.delete(tip);
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
  const { tile, index, axis, cfg, laneY, t, viewport, committed, yBand } = props;
  const rootRef = useRef<SVGGElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const labelsRef = useRef<SVGGElement>(null);
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
  // Only the labels near the committed view are rendered: the rest would cost every commit and
  // every gesture frame for nothing (a pan reveals them by the next commit).
  const rendered = useMemo(
    () =>
      [...lod].filter(([id]) => {
        const r = byId.get(id)!;
        return nearCommitted(committed, yBand, r.x0, r.x1, r.box.y0, r.box.y1);
      }),
    [lod, byId, committed, yBand],
  );
  const placedRef = useRef<Placed>({ full: new Set(), named: new Set() });
  // One writer for the layer's life: nodes React keeps across renders keep their written values.
  const [write] = useState(createWriter);

  // Place after every render, then follow the live viewport imperatively (and close the tooltip:
  // the item under it is moving).
  useLayoutEffect(() => {
    const root = rootRef.current!;
    const tip = tipRef.current!;
    const nodes = nodesOf(root);
    let edge = new Set<string>();
    // Pan frames shift the labels' group (viewport.ts, panShifting) and re-place only the edge
    // labels (clamped into the visible part of their span) and the stream names.
    const shift = panShifting(labelsRef.current!, (v) => {
      const p = place(nodes, v, byId, lod, names, measure, viewport.band(), write);
      placedRef.current = p;
      edge = p.edge;
    });
    let band = viewport.band();
    const run = (v: Viewport) => {
      const changed = viewport.band() !== band;
      band = viewport.band();
      const dx = shift(v, changed);
      if (dx === null) return;
      const nameBoxes = placeNames(nodes, v, names, measure, write);
      placeLabels(nodes, v, byId, lod, nameBoxes, band, write, { ids: edge, dx });
    };
    const v = viewport.get() ?? committed;
    if (v) run(v);
    return viewport.subscribe((next) => {
      run(next);
      const opened = tipViews.get(tip);
      if (opened && movedPast(opened, next)) hideTooltip(tip);
    });
  }, [viewport, committed, byId, lod, names, measure, write]);

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
      const v = viewport.get() ?? committed;
      if (v) tipViews.set(tip, v);
    };

    let press: { id: string; pointerId: number; x: number; y: number; timer: number } | null = null;
    /** The pointer whose long-press opened the tooltip, until it lifts. */
    let longPressed: number | null = null;
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
      if (e.buttons) return;
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
        longPressed = e.pointerId;
        open(id, e);
      }, LONG_PRESS_MS);
      press = { id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer };
    };
    const onUp = (e: PointerEvent) => {
      cancelPress();
      // The release that ends a long-press is not a tap, however long the press was held.
      if (longPressed === e.pointerId) {
        longPressed = null;
        suppressClickUntil = Date.now() + CLICK_AFTER_PRESS_MS;
      }
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
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
      <g ref={labelsRef} className="reign-labels">
        {rendered.map(([id, label]) => {
          const r = byId.get(id)!;
          const y = baselines(r.box, label.mode);
          return (
            <g key={id} className="reign-label" data-label={id} data-mode={label.mode}>
              <text className="reign-name" x={0} y={y.name} fill={r.nameInk}>
                {r.name}
              </text>
              {label.mode === 'full' && (
                <text className="reign-years" x={0} y={y.years} fill={r.yearsInk}>
                  {r.years}
                </text>
              )}
            </g>
          );
        })}
      </g>
      <g ref={tipRef} className="chart-tooltip" role="tooltip" visibility="hidden">
        <rect rx={6} />
        <text className="tooltip-name" />
        <text className="tooltip-years" />
      </g>
    </g>
  );
}
