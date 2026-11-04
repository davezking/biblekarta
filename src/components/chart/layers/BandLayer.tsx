// BandLayer: the tradition-only band (R10) and the gap labels.
//
// - The band: on the scholarly axis, when the config has one (cfg.band), a lightly tinted strip at
//   the left of the chart, [0, band.widthPx] at k = 1, labelled in red ink. The band's gap
//   (band.gapPx) is left empty, separating it from the scholarly domain. Never on the traditional
//   axis.
// - Gap labels: for each era with `gap: true` that has a span on this axis, a label centred in it.
//
// The tint is geometry, so it is drawn here in the x-scaled group. The labels are text, and text
// never goes in the x-scaled group (it would stretch): they are rendered through a portal into the
// chart's screen-space labels group and re-placed imperatively from the viewport during a gesture,
// with no React render.
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { IndexEra } from '../../../lib/core/datafiles';
import type { Axis, Band, TimescaleConfig } from '../../../lib/layout/timescale';
import { AXIS_BAND_PX, AXIS_BOTTOM_PX } from '../geometry';
import type { Viewport } from '../state';
import type { LayerProps } from './types';
import './anchors.css';

/** The band label's baseline sits this far below the top of the lane area. */
const BAND_LABEL_DY_PX = 18;

/** The band to draw: the config's band on the scholarly axis, otherwise none. */
export function bandOn(axis: Axis, cfg: TimescaleConfig): Band | null {
  return axis === 'scholarly' ? cfg.band : null;
}

export interface GapLabel {
  id: string;
  /** Centre x at k = 1. */
  cx: number;
}

/** The gap eras with a span on this axis, each with its centre. */
export function gapLabels(axis: Axis, eras: readonly IndexEra[]): GapLabel[] {
  const out: GapLabel[] = [];
  for (const era of eras) {
    const span = era.x[axis];
    if (era.gap && span) out.push({ id: era.id, cx: (span.x0 + span.x1) / 2 });
  }
  return out;
}

/** Screen x of a base x. */
const screenX = (v: Viewport, bx: number) => v.k * bx + v.x;

export default function BandLayer({
  index,
  axis,
  cfg,
  viewport,
  committed,
  height,
  t,
}: LayerProps) {
  const band = bandOn(axis, cfg);
  const gaps = gapLabels(axis, index.eras);
  const ref = useRef<SVGGElement>(null);
  const textRef = useRef<SVGGElement>(null);
  // The labels group lives in the same SVG; found once after mount.
  const [labelsGroup, setLabelsGroup] = useState<SVGGElement | null>(null);
  useLayoutEffect(() => {
    const g = ref.current?.ownerSVGElement?.querySelector<SVGGElement>('g.chart-labels') ?? null;
    setLabelsGroup(g);
  }, []);

  const top = AXIS_BAND_PX;
  const bottom = Math.max(top, height - AXIS_BOTTOM_PX);
  const labels = [
    ...(band
      ? [{ id: 'band', cx: band.widthPx / 2, y: top + BAND_LABEL_DY_PX, kind: 'band' }]
      : []),
    ...gaps.map((g) => ({ id: g.id, cx: g.cx, y: (top + bottom) / 2, kind: 'gap' })),
  ];

  // Follow the live viewport imperatively; re-apply the latest one after every render.
  useLayoutEffect(() => {
    const g = textRef.current;
    if (!g) return;
    const nodes = [...g.querySelectorAll<SVGTextElement>('text[data-cx]')];
    const place = (v: Viewport) => {
      for (const el of nodes) {
        el.setAttribute('x', String(Math.round(screenX(v, Number(el.dataset.cx)) * 10) / 10));
      }
    };
    const v = viewport.get() ?? committed;
    if (v) place(v);
    return viewport.subscribe(place);
  }, [labelsGroup, viewport, committed, labels.length, axis]);

  return (
    <g ref={ref} className="chart-tradition-band">
      {band && (
        <rect
          className="band-tint"
          x={0}
          y={top}
          width={band.widthPx}
          height={bottom - top}
          data-band="tradition-only"
        />
      )}
      {labelsGroup &&
        labels.length > 0 &&
        createPortal(
          <g ref={textRef} className="chart-band-labels" aria-hidden="true">
            {labels.map((l) => (
              <text
                key={l.id}
                className={l.kind === 'band' ? 'band-label' : 'gap-label'}
                data-gap={l.kind === 'gap' ? l.id : undefined}
                data-cx={l.cx}
                y={l.y}
              >
                {l.kind === 'band' ? t('band.traditionOnly') : t('gap.label')}
              </text>
            ))}
          </g>,
          labelsGroup,
        )}
    </g>
  );
}
