// FigureLayer: figures inside the streams (DR-10; Board 5), for every person of importance ≥ 4
// and every prophet. A figure sits at the left of its person's segment (a reign, or a span of
// their own), and shows only while the segment's visible part is wide enough on screen for the
// figure and its padding. Its size follows the slot's height, 24–40 px.
//
// Figures are decorative: `aria-hidden`, untappable (the segment under them takes the tap), and
// drawn from the sprite (`<use>`) that Chart mounts once. Mounted in the screen-space labels
// group, re-placed imperatively from the viewport during a gesture, with no React render.
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Person } from '../../../lib/core/schema';
import type { Measure } from '../../../lib/layout/lod';
import Figure from '../../figures/Figure';
import { createWriter } from '../dom-writer';
import type { Viewport } from '../state';
import { atEdge, panShifting } from '../viewport';
import { POINT_MAX_PX, slotOf } from './EventLayer';
import { createMeasure, reignLabelData } from './LabelLayer';
import { reignBoxes } from './ReignLayer';
import { memoIgnoringCommitted } from './memo';
import type { LayerProps } from './types';
import './items.css';

export const FIGURE_MIN_PX = 24;
export const FIGURE_MAX_PX = 40;
/** Space kept between a figure and its segment's edges, on screen. */
export const FIGURE_PAD_PX = 6;
/** Space between a figure and its label, px. */
export const FIGURE_GAP_PX = 4;
/** Importance from which a person gets a figure (prophets always do). */
export const FIGURE_IMPORTANCE = 4;

export interface FigureSlot {
  /** Unique per segment (a person can have several reigns). */
  key: string;
  person: Person;
  x0: number;
  x1: number;
  cy: number;
  size: number;
  /** Width of the label centred in the segment (LabelLayer's, or the person's own), px; 0 if none. */
  labelW: number;
}

/** The figure size for a slot this tall: three quarters of it, kept to 24–40 px. */
export const figureSize = (slotHeight: number) =>
  Math.min(FIGURE_MAX_PX, Math.max(FIGURE_MIN_PX, Math.round(slotHeight * 0.75)));

export const hasFigure = (p: Pick<Person, 'importance' | 'figure_kind'>) =>
  p.importance >= FIGURE_IMPORTANCE || p.figure_kind === 'prophet';

/** Every segment that carries a figure, on this axis. */
export function figureSlots(
  p: Pick<LayerProps, 'tile' | 'index' | 'axis' | 'cfg' | 'laneY' | 't'>,
  measure: Measure,
): FigureSlot[] {
  const people = new Map(p.tile.people.map((x) => [x.id, x]));
  const labels = new Map(reignLabelData(p).map((r) => [r.id, r]));
  const out: FigureSlot[] = [];
  for (const box of reignBoxes(p)) {
    const person = people.get(box.reign.person_id);
    if (!person || !hasFigure(person)) continue;
    const label = labels.get(box.reign.reign_id);
    out.push({
      key: `reign:${box.reign.reign_id}`,
      person,
      x0: box.reign.x0,
      x1: box.reign.x1,
      cy: (box.y0 + box.y1) / 2,
      size: figureSize(box.y1 - box.y0),
      labelW: label
        ? Math.max(measure(label.name, 'name'), label.years ? measure(label.years, 'years') : 0)
        : 0,
    });
  }
  for (const span of p.tile.axes[p.axis].people) {
    const person = people.get(span.person_id);
    if (!person || !hasFigure(person) || span.x1 - span.x0 <= POINT_MAX_PX) continue;
    const slot = slotOf(p, span);
    if (!slot) continue;
    out.push({
      key: `person:${person.id}`,
      person,
      x0: span.x0,
      x1: span.x1,
      cy: slot.cy,
      size: figureSize(slot.h),
      labelW: measure(
        person.name_am,
        p.tile.axes[p.axis].bands.find((b) => b.stream_id === span.stream_id)?.kind === 'ribbon'
          ? 'name'
          : 'years',
      ),
    });
  }
  return out;
}

/**
 * The figure's left edge on screen, or null where it does not fit. Where the segment's label fits,
 * the figure sits just left of it (the label is centred in the visible part of the segment, as
 * LabelLayer places it), and shows only if there is room for both; where no label fits, the figure
 * sits at the segment's left, if the segment is wide enough for it alone.
 */
export function figureX(
  s: Pick<FigureSlot, 'x0' | 'x1' | 'size' | 'labelW'>,
  v: Viewport,
): number | null {
  const left = Math.max(v.k * s.x0 + v.x, 0) + FIGURE_PAD_PX;
  const right = Math.min(v.k * s.x1 + v.x, v.width) - FIGURE_PAD_PX;
  if (s.labelW > 0 && right - left >= s.labelW) {
    const half = s.labelW / 2;
    const mid = Math.min(Math.max((v.k * (s.x0 + s.x1)) / 2 + v.x, left + half), right - half);
    const x = mid - half - FIGURE_GAP_PX - s.size;
    return x >= left ? x : null;
  }
  return right - left >= s.size ? left : null;
}

function FigureLayer(props: LayerProps) {
  const { tile, index, axis, cfg, laneY, t, viewport, committed, yBand } = props;
  const ref = useRef<SVGGElement>(null);
  const [measure] = useState(createMeasure);
  // One writer for the layer's life (nodes React keeps keep their written values).
  const [write] = useState(createWriter);
  const slots = useMemo(
    () => figureSlots({ tile, index, axis, cfg, laneY, t }, measure),
    [tile, index, axis, cfg, laneY, t, measure],
  );

  useLayoutEffect(() => {
    const root = ref.current!;
    const bySlot = new Map(slots.map((s) => [s.key, s]));
    const nodes = [...root.querySelectorAll<SVGGElement>('g[data-figure]')].map(
      (g) => [g, bySlot.get(g.dataset.figure!)!] as const,
    );
    let edge = new Set<string>();
    /** Places the figures (all, or just `only`, inside a group shifted by `dx`). */
    const placeAll = (v: Viewport, only?: { keys: Set<string>; dx: number }) => {
      const band = viewport.band();
      const nextEdge = new Set<string>();
      for (const [g, s] of nodes) {
        if (!s || (only && !only.keys.has(s.key))) continue;
        if (atEdge(v, v.k * s.x0 + v.x, v.k * s.x1 + v.x)) nextEdge.add(s.key);
        const x =
          s.cy + s.size / 2 >= band[0] && s.cy - s.size / 2 <= band[1] ? figureX(s, v) : null;
        // A hidden figure is also out of layout and paint (display: none).
        if (x === null) {
          write(g, 'visibility', 'hidden');
          write(g, 'display', 'none');
          continue;
        }
        const left = Math.round((x - (only?.dx ?? 0)) * 10) / 10;
        write(g, 'transform', `translate(${left},${s.cy - s.size / 2})`);
        write(g, 'visibility', null);
        write(g, 'display', null);
      }
      if (!only) edge = nextEdge;
    };
    // Pan frames shift the figures' group (viewport.ts, panShifting) and re-place only the
    // figures at the screen's edges.
    const shift = panShifting(root, (v) => placeAll(v));
    let band = viewport.band();
    const run = (v: Viewport) => {
      const changed = viewport.band() !== band;
      band = viewport.band();
      const dx = shift(v, changed);
      if (dx !== null) placeAll(v, { keys: edge, dx });
    };
    const v = viewport.get() ?? committed;
    if (v) run(v);
    return viewport.subscribe(run);
  }, [slots, viewport, committed, write]);

  return (
    <g ref={ref} className="chart-figures" aria-hidden="true">
      {slots
        .filter((s) => s.cy + s.size / 2 >= yBand[0] && s.cy - s.size / 2 <= yBand[1])
        .map((s) => (
          <g
            key={s.key}
            data-figure={s.key}
            data-person={s.person.id}
            visibility="hidden"
            display="none"
          >
            <Figure kind={s.person.figure_kind} tone={s.person.figure_tone} size={s.size} />
          </g>
        ))}
    </g>
  );
}

/** Re-rendered by data, axis, lanes or selection changes, not by each committed viewport. */
export default memoIgnoringCommitted(FigureLayer);
