// EventLayer: events in their stream (FR-6; Board 5). A point event is a ፨ mark and its title; a
// span event is a thin bar with its title. Each sits in its `stream_id`'s lane (in its packed row
// when the stream has rows), or in the top lane if it has none.
//
// This file also holds the screen-space item engine that ProphetLayer uses for people: the marks,
// titles, hit targets and tooltip of items that are not reigns. Bars and pills are geometry, drawn
// in the x-scaled group in base (k = 1) coordinates; marks, text and hit targets are portaled into
// the screen-space labels group (text never goes in the x-scaled group) and re-placed imperatively
// from the viewport during a gesture, with no React render. Which titles show is decided once per
// gesture end (from `committed.k`), by importance: the higher wins a collision.
//
// Every item is selectable (`data-select="event:<id>"` or `"person:<id>"`, for Chart's tap
// handler), with a touch target ≥ 44 px, and an item whose title is not shown has a tooltip
// (hover on desktop, long-press on touch).
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatScholarly, formatTraditional } from '../../../lib/core/dates';
import type { DateValue } from '../../../lib/core/schema';
import { ink, touchTarget, vellum } from '../../../lib/core/tokens';
import type { T } from '../../../lib/i18n';
import { LOD_GAP_PX, LOD_PAD_PX, type LabelKind, type Measure } from '../../../lib/layout/lod';
import { ROW_HEIGHT_PX, rowY } from '../../../lib/layout/streams';
import type { Axis } from '../../../lib/layout/timescale';
import { yExtent } from '../cull';
import { createWriter, type Write } from '../dom-writer';
import type { Viewport } from '../state';
import { atEdge, nearCommitted, nearView, panShifting, type YBand } from '../viewport';
import { createMeasure, inkOn, LONG_PRESS_MS, LONG_PRESS_SLOP_PX, movedPast } from './LabelLayer';
import type { LayerProps } from './types';
import './items.css';

/** The event mark (Board 5). */
export const EVENT_MARK = '፨';
/** Space between a point's mark and its title, px. */
const MARK_GAP_PX = 6;
/** Half the mark's width, px (the ፨ at 13 px; the person dot). */
const MARK_HALF_PX = 6;
/** A span event's bar height, px. */
export const BAR_PX = 4;
/** The click that follows a long-press's release arrives within this long. */
const CLICK_AFTER_PRESS_MS = 400;

// --- Items ---------------------------------------------------------------------------------

/** An item lettered in screen space: an event, or a person who has no reign. */
export interface ScreenItem {
  /** Unique across the layer, e.g. `event:temple-built`; also the `data-select` value. */
  key: string;
  /** Collisions are checked only within a group (a stream's row). */
  group: string;
  x0: number;
  x1: number;
  /** Chart y of the slot's centre, and its height. */
  cy: number;
  h: number;
  /** Drawn as a mark at the middle of its span (true), or as a span with the title inside it. */
  point: boolean;
  /** Approximate: a dashed outline. */
  dashed: boolean;
  importance: number;
  /** Title options, longest first (e.g. with and without the date). */
  texts: string[];
  size: LabelKind;
  inkColor: string;
  tip: { name: string; years: string };
}

/** Space between a polity's lowest row and its lower edge, px. */
const POLITY_ROW_INSET_PX = 4;

/**
 * The slot an item sits in: its row in a stream with rows, otherwise the stream's centre.
 * OverlayLayer outlines a selected event or person in this same slot.
 */
export function slotOf(
  p: Pick<LayerProps, 'tile' | 'index' | 'axis' | 'laneY'>,
  m: { stream_id: string | null; row: number; x1: number },
): { cy: number; h: number } | null {
  const bands = p.tile.axes[p.axis].bands;
  const band = m.stream_id ? bands.find((b) => b.stream_id === m.stream_id) : null;
  const top = band ? p.laneY.get(band.lane_id) : undefined;
  if (!band || top === undefined) return null;
  if (band.rows > 0 && m.row >= 0) {
    if (band.kind === 'polity') {
      // At a fork, on the centre line, between the streams forked from it (Board 5: the 931
      // split lettered between Israel and Judah).
      const forks = new Set(
        p.index.streams.filter((s) => s.parent_stream_id === band.stream_id).map((s) => s.id),
      );
      const forkX = Math.min(...bands.filter((b) => forks.has(b.stream_id)).map((b) => b.x0));
      if (m.x1 >= forkX) return { cy: top + band.cy, h: ROW_HEIGHT_PX };
      // Elsewhere a polity's reigns fill its centre (their labels too), so its rows of events
      // and people stack up from its lower edge instead (Board 5: the temple under Solomon).
      const bottom = band.cy + band.height / 2 - POLITY_ROW_INSET_PX;
      return { cy: top + bottom - ROW_HEIGHT_PX * (band.rows - m.row - 0.5), h: ROW_HEIGHT_PX };
    }
    return { cy: top + rowY(band, m.row), h: ROW_HEIGHT_PX };
  }
  return { cy: top + band.cy, h: band.height };
}

/** The top visible lane, for events with no stream: its slot, and its first stream's id. */
export function topLaneSlot(
  p: Pick<LayerProps, 'index' | 'axis' | 'laneY'>,
): { cy: number; h: number; laneId: string; streamId: string | undefined } | null {
  const lane = (p.index.layout?.[p.axis].lanes ?? []).find((l) => p.laneY.has(l.id));
  if (!lane) return null;
  const top = p.laneY.get(lane.id)!;
  return {
    cy: top + lane.height / 2,
    h: lane.height,
    laneId: lane.id,
    streamId: lane.stream_ids[0],
  };
}

export function formatOn(axis: Axis, dv: DateValue | undefined, t: T): string {
  if (!dv) return '';
  return axis === 'scholarly' ? formatScholarly(dv, t) : formatTraditional(dv, t);
}

/** A span no wider than this at k = 1 (about a year) is drawn as a point. */
export const POINT_MAX_PX = 8;

/** The events on this axis, each in its lane and row (or the top lane when it has no stream). */
export function eventItems(p: Pick<LayerProps, 'tile' | 'index' | 'axis' | 'laneY' | 't'>) {
  const events = new Map(p.tile.events.map((e) => [e.id, e]));
  const fills = new Map(p.index.streams.map((s) => [s.id, s.fill_color]));
  const topLane = topLaneSlot(p);
  const out: ScreenItem[] = [];
  for (const m of p.tile.axes[p.axis].events) {
    const e = events.get(m.event_id);
    if (!e) continue;
    const own = slotOf(p, m);
    const slot = own ?? (m.stream_id ? null : topLane && { cy: topLane.cy, h: topLane.h });
    if (!slot) continue;
    const fill = fills.get((own ? m.stream_id : topLane?.streamId) ?? '');
    const date = formatOn(
      p.axis,
      p.axis === 'scholarly' ? e.date_scholarly : e.date_traditional,
      p.t,
    );
    const title = e.title_am;
    out.push({
      key: `event:${e.id}`,
      group: `${m.stream_id ?? topLane?.laneId}:${m.row}`,
      x0: m.x0,
      x1: m.x1,
      ...slot,
      point: e.type === 'point' || m.x1 - m.x0 <= POINT_MAX_PX,
      dashed: m.dashed,
      importance: e.importance,
      texts: date ? [`${title} (${date})`, title] : [title],
      size: 'years',
      inkColor: inkOn(fill ?? vellum.base, ink.red),
      tip: { name: title, years: date },
    });
  }
  return out;
}

// --- Level of detail -----------------------------------------------------------------------

export interface ItemLabel {
  text: string;
  width: number;
}

/**
 * The titles shown at zoom k, by item key. A span's title must fit inside the span (with padding);
 * a point's title runs to the right of its mark. Within a group, the higher importance wins a
 * collision (then the earlier item, then the key); each item takes the longest of its texts that
 * fits, or none.
 */
export function itemLabels(
  items: readonly ScreenItem[],
  k: number,
  measure: Measure,
): Map<string, ItemLabel> {
  const sorted = [...items].sort(
    (a, b) =>
      b.importance - a.importance || a.x0 - b.x0 || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const taken = new Map<string, [number, number][]>();
  const out = new Map<string, ItemLabel>();
  for (const it of sorted) {
    const boxes = taken.get(it.group) ?? [];
    for (const text of it.texts) {
      const width = measure(text, it.size);
      let box: [number, number];
      if (it.point) {
        const ax = ((it.x0 + it.x1) / 2) * k;
        box = [ax - MARK_HALF_PX, ax + MARK_HALF_PX + MARK_GAP_PX + width];
      } else {
        if (width > (it.x1 - it.x0) * k - 2 * LOD_PAD_PX) continue;
        const mid = ((it.x0 + it.x1) / 2) * k;
        box = [mid - width / 2, mid + width / 2];
      }
      if (boxes.some(([a, b]) => box[0] < b + LOD_GAP_PX && box[1] > a - LOD_GAP_PX)) continue;
      boxes.push(box);
      taken.set(it.group, boxes);
      out.set(it.key, { text, width });
      break;
    }
  }
  return out;
}

// --- Imperative placement --------------------------------------------------------------------

const r1 = (v: number) => String(Math.round(v * 10) / 10);

/** An item's nodes, looked up once per render. */
interface ItemNodes {
  g: SVGGElement;
  it: ScreenItem;
  hit: SVGRectElement;
  text: SVGTextElement | null;
}

function nodesOf(root: SVGGElement, items: Map<string, ScreenItem>): ItemNodes[] {
  const out: ItemNodes[] = [];
  for (const g of root.querySelectorAll<SVGGElement>('g[data-item]')) {
    const it = items.get(g.dataset.item!);
    if (!it) continue;
    out.push({
      g,
      it,
      hit: g.querySelector<SVGRectElement>('rect.item-hit')!,
      text: g.querySelector<SVGTextElement>('text.item-title'),
    });
  }
  return out;
}

/**
 * Places every item for the viewport: one transform per item (to the middle of its span), its
 * hit target's width (spans), and its title. Items far off screen, or outside the window's y band,
 * are set to display: none, out of layout and paint, until they come near. Returns the keys of
 * the items whose title is on screen, and of those not wholly on screen (`edge`: clamped or
 * flipped at an edge). With `only`, just those items are placed, inside a group shifted by `dx`
 * (a pan frame: the rest moved with the group).
 */
function place(
  nodes: ItemNodes[],
  labels: Map<string, ItemLabel>,
  v: Viewport,
  band: YBand,
  write: Write,
  only?: { keys: Set<string>; dx: number },
): { shown: Set<string>; edge: Set<string> } {
  const shown = new Set<string>();
  const edge = new Set<string>();
  const dx = only?.dx ?? 0;
  for (const n of nodes) {
    const { it } = n;
    if (only && !only.keys.has(it.key)) continue;
    const sx0 = v.k * it.x0 + v.x;
    const sx1 = v.k * it.x1 + v.x;
    const mid = (sx0 + sx1) / 2;
    const label = labels.get(it.key);
    const reach = it.point ? MARK_HALF_PX + MARK_GAP_PX + (label?.width ?? 0) : 0;
    const half = Math.max(it.h, touchTarget) / 2;
    const l = Math.min(sx0, mid - reach);
    const r = Math.max(sx1, mid + reach);
    if (atEdge(v, l, r)) edge.add(it.key);
    const near = nearView(v, band, l, r, it.cy - half, it.cy + half);
    write(n.g, 'display', near ? null : 'none');
    if (!near) continue;
    write(n.g, 'transform', `translate(${r1(mid - dx)},0)`);
    if (!it.point) {
      const w = Math.max(sx1 - sx0, touchTarget);
      write(n.hit, 'x', r1(-w / 2));
      write(n.hit, 'width', r1(w));
    }
    if (!n.text || !label) continue;
    let x: number;
    let show: boolean;
    let anchor: string | null = null;
    if (it.point) {
      // Right of the mark; flipped to its left where it would run off the right edge.
      const right = mid + MARK_HALF_PX + MARK_GAP_PX;
      const flip = right + label.width > v.width && mid - MARK_HALF_PX - MARK_GAP_PX >= label.width;
      x = flip ? mid - MARK_HALF_PX - MARK_GAP_PX : right;
      anchor = flip ? 'end' : 'start';
      show = mid + MARK_HALF_PX > 0 && mid - MARK_HALF_PX < v.width;
    } else {
      // Centred in the visible part of the span; hidden where that no longer fits it.
      const left = Math.max(sx0, 0) + LOD_PAD_PX;
      const right = Math.min(sx1, v.width) - LOD_PAD_PX;
      const halfW = label.width / 2;
      x = Math.min(Math.max(mid, left + halfW), right - halfW);
      show = right - left >= label.width;
    }
    if (show) {
      write(n.text, 'x', r1(x - mid));
      if (anchor) write(n.text, 'text-anchor', anchor);
      write(n.text, 'visibility', null);
      shown.add(it.key);
    } else {
      write(n.text, 'visibility', 'hidden');
    }
  }
  return { shown, edge };
}

// --- Tooltip -------------------------------------------------------------------------------

function showTip(
  tip: SVGGElement,
  it: ScreenItem,
  at: { x: number; y: number },
  width: number,
  measure: Measure,
) {
  const rect = tip.querySelector('rect')!;
  const [name, yrs] = [...tip.querySelectorAll('text')];
  name!.textContent = it.tip.name;
  yrs!.textContent = it.tip.years;
  const pad = 8;
  const w = Math.max(measure(it.tip.name, 'name'), measure(it.tip.years, 'years')) + 2 * pad;
  const h = 16 + (it.tip.years ? 13 + pad : 0) + 2 * pad;
  const x = Math.min(Math.max(at.x - w / 2, 4), Math.max(width - w - 4, 4));
  const y = at.y - h - 12 >= 0 ? at.y - h - 12 : at.y + 24;
  rect.setAttribute('width', String(w));
  rect.setAttribute('height', String(h));
  name!.setAttribute('x', String(pad));
  name!.setAttribute('y', String(pad + 14));
  yrs!.setAttribute('x', String(pad));
  yrs!.setAttribute('y', String(pad * 2 + 16 + 9));
  tip.setAttribute('transform', `translate(${Math.round(x)},${Math.round(y)})`);
  tip.setAttribute('data-tip-for', it.key);
  tip.removeAttribute('visibility');
}

function hideTip(tip: SVGGElement) {
  tip.setAttribute('visibility', 'hidden');
  tip.removeAttribute('data-tip-for');
}

// --- The overlay component -------------------------------------------------------------------

/** A ref for the layer's own group, and the chart's labels group (found once after mount). */
export function useLabelsGroup() {
  const ref = useRef<SVGGElement>(null);
  const [labelsGroup, setLabelsGroup] = useState<SVGGElement | null>(null);
  useLayoutEffect(() => {
    const g = ref.current?.ownerSVGElement?.querySelector<SVGGElement>('g.chart-labels') ?? null;
    setLabelsGroup(g);
  }, []);
  return { ref, labelsGroup };
}

interface ItemsOverlayProps extends Pick<LayerProps, 'viewport' | 'committed' | 'yBand'> {
  /** The chart's screen-space labels group (from `useLabelsGroup`). */
  labelsGroup: SVGGElement | null;
  items: ScreenItem[];
  className: string;
  /** The mark a point item gets: the ፨ glyph (events) or a dot (people). */
  mark: 'glyph' | 'dot';
}

/** Marks, titles, hit targets and the tooltip of screen-space items, portaled into the labels group. */
export function ItemsOverlay({
  labelsGroup,
  items,
  className,
  mark,
  viewport,
  committed,
  yBand,
}: ItemsOverlayProps) {
  const rootRef = useRef<SVGGElement>(null);
  const itemsRef = useRef<SVGGElement>(null);
  const tipRef = useRef<SVGGElement>(null);
  const [measure] = useState(createMeasure);

  const byKey = useMemo(() => new Map(items.map((it) => [it.key, it])), [items]);
  const labels = useMemo(
    () => (committed ? itemLabels(items, committed.k, measure) : new Map<string, ItemLabel>()),
    [items, committed, measure],
  );
  // Only the items near the committed view are rendered (a pan reveals them by the next commit).
  const rendered = useMemo(
    () =>
      items.filter((it) => {
        const half = Math.max(it.h, touchTarget) / 2;
        const reach = labels.get(it.key)?.width ?? 0;
        return nearCommitted(
          committed,
          yBand,
          it.x0,
          it.x1 + (committed ? reach / committed.k : 0),
          it.cy - half,
          it.cy + half,
        );
      }),
    [items, labels, committed, yBand],
  );
  const shownRef = useRef<Set<string>>(new Set());
  // One writer for the overlay's life (nodes React keeps keep their written values).
  const [write] = useState(createWriter);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const tip = tipRef.current;
    if (!root || !tip) return;
    let opened: Viewport | null = null;
    const nodes = nodesOf(root, byKey);
    let edge = new Set<string>();
    // Pan frames shift the items' group (viewport.ts, panShifting) and re-place only the items
    // at the screen's edges.
    const shift = panShifting(itemsRef.current!, (v) => {
      const p = place(nodes, labels, v, viewport.band(), write);
      shownRef.current = p.shown;
      edge = p.edge;
    });
    let band = viewport.band();
    const run = (v: Viewport) => {
      const changed = viewport.band() !== band;
      band = viewport.band();
      const dx = shift(v, changed);
      if (dx !== null) place(nodes, labels, v, band, write, { keys: edge, dx });
    };
    const v = viewport.get() ?? committed;
    if (v) run(v);
    const unsubscribe = viewport.subscribe((next) => {
      run(next);
      if (opened && movedPast(opened, next)) {
        opened = null;
        hideTip(tip);
      }
    });

    const svg = root.ownerSVGElement;
    if (!svg) return unsubscribe;
    const width = () => viewport.get()?.width ?? committed?.width ?? svg.clientWidth;
    const local = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const itemAt = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.('[data-item]');
      return el && root.contains(el) ? (byKey.get(el.getAttribute('data-item')!) ?? null) : null;
    };
    const open = (it: ScreenItem, e: PointerEvent) => {
      if (shownRef.current.has(it.key)) return hideTip(tip);
      showTip(tip, it, local(e), width(), measure);
      opened = viewport.get() ?? committed;
    };
    let press: { pointerId: number; x: number; y: number; timer: number } | null = null;
    let longPressed: number | null = null;
    let suppressClickUntil = 0;
    const cancelPress = () => {
      if (press) clearTimeout(press.timer);
      press = null;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        if (
          press?.pointerId === e.pointerId &&
          Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP_PX
        )
          cancelPress();
        return;
      }
      if (e.buttons) return;
      const it = itemAt(e);
      if (it) open(it, e);
      else hideTip(tip);
    };
    const onDown = (e: PointerEvent) => {
      cancelPress();
      if (e.pointerType !== 'touch') return;
      hideTip(tip);
      const it = itemAt(e);
      if (!it) return;
      const timer = window.setTimeout(() => {
        press = null;
        longPressed = e.pointerId;
        open(it, e);
      }, LONG_PRESS_MS);
      press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, timer };
    };
    const onUp = (e: PointerEvent) => {
      cancelPress();
      // The release that ends a long-press is not a tap.
      if (longPressed === e.pointerId) {
        longPressed = null;
        suppressClickUntil = Date.now() + CLICK_AFTER_PRESS_MS;
      }
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      cancelPress();
      hideTip(tip);
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
      unsubscribe();
      cancelPress();
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      svg.removeEventListener('pointerleave', onLeave);
      svg.removeEventListener('click', onClick, { capture: true });
    };
  }, [labelsGroup, byKey, labels, viewport, committed, measure, write]);

  if (!labelsGroup || items.length === 0) return null;
  return createPortal(
    <g ref={rootRef} className={`chart-items ${className}`}>
      <g ref={itemsRef} className="chart-item-nodes">
        {rendered.map((it) => {
          const label = labels.get(it.key);
          const hit = Math.max(it.h, touchTarget);
          return (
            <g key={it.key} data-item={it.key} data-point={it.point || undefined}>
              {it.point &&
                (mark === 'glyph' ? (
                  <text
                    className="item-mark"
                    aria-hidden="true"
                    x={0}
                    y={it.cy + 5}
                    fill={it.inkColor}
                  >
                    {EVENT_MARK}
                  </text>
                ) : (
                  <circle className="item-mark item-dot" cx={0} cy={it.cy} r={5} />
                ))}
              {label && (
                <text
                  className={`item-title item-title-${it.size}`}
                  textAnchor={it.point ? 'start' : 'middle'}
                  y={it.cy + (it.size === 'name' ? 5.5 : 4.5)}
                  fill={it.inkColor}
                >
                  {label.text}
                </text>
              )}
              <rect
                className="item-hit"
                data-select={it.key}
                x={-touchTarget / 2}
                y={it.cy - hit / 2}
                height={hit}
                width={touchTarget}
              />
            </g>
          );
        })}
      </g>
      <g ref={tipRef} className="chart-tooltip item-tooltip" role="tooltip" visibility="hidden">
        <rect rx={6} />
        <text className="tooltip-name" />
        <text className="tooltip-years" />
      </g>
    </g>,
    labelsGroup,
  );
}

// --- The layer -----------------------------------------------------------------------------

export default function EventLayer(props: LayerProps) {
  const { tile, index, axis, laneY, t, viewport, committed } = props;
  const { ref, labelsGroup } = useLabelsGroup();
  const items = useMemo(
    () => eventItems({ tile, index, axis, laneY, t }),
    [tile, index, axis, laneY, t],
  );
  return (
    <g ref={ref} className="chart-events">
      {items
        .filter((it) => !it.point)
        .map((it) => (
          <rect
            key={it.key}
            className={it.dashed ? 'event-bar item-dashed' : 'event-bar'}
            data-event-bar={it.key.slice('event:'.length)}
            {...yExtent(it.cy - BAR_PX / 2, it.cy + BAR_PX / 2)}
            x={it.x0}
            y={it.cy - BAR_PX / 2}
            width={it.x1 - it.x0}
            height={BAR_PX}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      <ItemsOverlay
        labelsGroup={labelsGroup}
        items={items}
        className="chart-event-items"
        mark="glyph"
        viewport={viewport}
        committed={committed}
        yBand={props.yBand}
      />
    </g>
  );
}
