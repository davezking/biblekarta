// GridLayer: the decade ruling grid behind the streams (DR-7). Decade lines are thin, low-contrast
// ink; century lines are a little stronger; half-century lines are red ink.
//
// The layer is mounted in the screen-space grid group (see ./types.ts), so it carries its own
// x-only transform: the lines are drawn once, over the whole domain, in base (k = 1) coordinates
// with a non-scaling stroke, and a gesture only rewrites this group's transform from the viewport
// channel. No React render happens during a gesture.
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  MIN_TICK_GAP_PX,
  ticks,
  totalWidth,
  type Axis,
  type Tick,
  type TimescaleConfig,
} from '../../../lib/layout/timescale';
import { AXIS_BAND_PX } from '../geometry';
import type { Viewport } from '../state';
import { transformAttr } from '../zoom';
import type { LayerProps } from './types';
import './axis.css';

/** Decade lines closer than this on screen are hidden (centuries and half-centuries stay). */
export const MIN_DECADE_GAP_PX = 6;
/** The lines start a little above the first lane, reaching up to the top tick labels. */
const LINE_TOP_PX = AXIS_BAND_PX - 6;

/** Every decade, half-century and century line on the axis, from ticks() at decade zoom. */
export function gridTicks(axis: Axis, cfg: TimescaleConfig): Tick[] {
  // The zoom at which one decade is exactly the tick gap, so ticks() steps by 10 years.
  const k = (MIN_TICK_GAP_PX / (10 * cfg.pxPerYear)) * (1 + 1e-9);
  return ticks(axis, k, [0, totalWidth(axis, cfg)], cfg);
}

function place(g: SVGGElement, v: Viewport, cfg: TimescaleConfig): void {
  g.setAttribute('transform', transformAttr(v));
  const decadesShown = 10 * cfg.pxPerYear * v.k >= MIN_DECADE_GAP_PX;
  g.toggleAttribute('data-decades-hidden', !decadesShown);
}

export default function GridLayer({ axis, cfg, viewport, committed, height }: LayerProps) {
  const ref = useRef<SVGGElement>(null);
  const lines = useMemo(() => gridTicks(axis, cfg), [axis, cfg]);

  // Follow the live viewport imperatively; re-apply the latest one after every render.
  useLayoutEffect(() => {
    const g = ref.current!;
    const v = viewport.get() ?? committed;
    if (v) place(g, v, cfg);
    return viewport.subscribe((next) => place(g, next, cfg));
  }, [viewport, committed, cfg, lines]);

  return (
    <g ref={ref} className="chart-grid-lines">
      {lines.map((tk) => (
        <line
          key={tk.year}
          className={`grid-line grid-${tk.level}`}
          data-year={tk.year}
          x1={tk.x}
          x2={tk.x}
          y1={LINE_TOP_PX}
          y2={height}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </g>
  );
}
