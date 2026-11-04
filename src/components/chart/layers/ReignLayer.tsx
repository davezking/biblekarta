// ReignLayer: each reign as a segment inside its kingdom's stream, bounded by thin dividers (FR-3).
// Mounted in the x-scaled geometry group, so everything is in base (k = 1) coordinates with a
// non-scaling stroke, and there is no text here (labels are LabelLayer's, in screen space).
//
// - The segments are clipped to their stream's path, so a divider never pokes out of a tapering
//   or forking stream.
// - An approximate reign (`dashed`) gets a dashed outline.
// - An open end (only one year known) gets no divider on its unknown side.
// - Every segment has a transparent hit target at least 44 px tall (touch), carrying
//   `data-select="reign:<id>"` for Chart's tap handler and `data-reign` for LabelLayer's tooltip.
import { useId } from 'react';
import { touchTarget } from '../../../lib/core/tokens';
import {
  ROW_HEIGHT_PX,
  rowY,
  type ReignSegment,
  type StreamBand,
} from '../../../lib/layout/streams';
import type { LayerProps } from './types';
import './labels.css';

export interface ReignBox {
  reign: ReignSegment;
  band: StreamBand;
  /** Chart y of the band's lane top. */
  laneTop: number;
  /** The slot the reign fills, in chart y. */
  y0: number;
  y1: number;
}

/**
 * Whether a reign fills a packed row rather than the stream's full width. A polity's reigns are
 * fixed at row 0 and always fill the full width, even when the polity has packed rows for its
 * events and people (see `layoutStreams`).
 */
export function inPackedRow(band: Pick<StreamBand, 'kind' | 'rows'>, row: number): boolean {
  return band.kind !== 'polity' && band.rows > 0 && row >= 0;
}

/**
 * Where each reign sits on the current axis: a polity's reigns fill the stream's full width; a
 * reign in another stream with packed rows (a prophet ribbon) fills its row. Reigns in hidden
 * lanes are left out.
 */
export function reignBoxes(p: Pick<LayerProps, 'tile' | 'axis' | 'laneY'>): ReignBox[] {
  const geo = p.tile.axes[p.axis];
  const bandOf = new Map(geo.bands.map((b) => [b.stream_id, b]));
  const out: ReignBox[] = [];
  for (const reign of geo.reigns) {
    const band = bandOf.get(reign.stream_id);
    const laneTop = band ? p.laneY.get(band.lane_id) : undefined;
    if (!band || laneTop === undefined) continue;
    if (inPackedRow(band, reign.row)) {
      const cy = laneTop + rowY(band, reign.row);
      out.push({ reign, band, laneTop, y0: cy - ROW_HEIGHT_PX / 2, y1: cy + ROW_HEIGHT_PX / 2 });
    } else {
      const cy = laneTop + band.cy;
      out.push({ reign, band, laneTop, y0: cy - band.height / 2, y1: cy + band.height / 2 });
    }
  }
  return out;
}

/** The hit target's y range: the slot, grown to at least the touch target and centred on it. */
export function hitRange(box: Pick<ReignBox, 'y0' | 'y1'>): [number, number] {
  const h = Math.max(box.y1 - box.y0, touchTarget);
  const cy = (box.y0 + box.y1) / 2;
  return [cy - h / 2, cy + h / 2];
}

export default function ReignLayer(props: LayerProps) {
  const uid = useId().replace(/:/g, '');
  const boxes = reignBoxes(props);
  const streams = [...new Map(boxes.map((b) => [b.band.stream_id, b])).values()];
  const clipId = (streamId: string) => `bk-reign-clip-${uid}-${streamId}`;

  return (
    <g className="chart-reigns">
      <defs>
        {streams.map(({ band, laneTop }) => (
          <clipPath key={band.stream_id} id={clipId(band.stream_id)} clipPathUnits="userSpaceOnUse">
            <path d={band.d} transform={`translate(0,${laneTop})`} />
          </clipPath>
        ))}
      </defs>
      {boxes.map(({ reign, band, y0, y1 }) => (
        <g
          key={reign.reign_id}
          className="reign-segment"
          data-reign-segment={reign.reign_id}
          clipPath={`url(#${clipId(band.stream_id)})`}
        >
          <rect
            className={reign.dashed ? 'reign-fill reign-dashed' : 'reign-fill'}
            x={reign.x0}
            y={y0}
            width={reign.x1 - reign.x0}
            height={y1 - y0}
            vectorEffect="non-scaling-stroke"
          />
          {reign.open !== 'start' && (
            <line
              className="reign-divider"
              x1={reign.x0}
              x2={reign.x0}
              y1={y0}
              y2={y1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {reign.open !== 'end' && (
            <line
              className="reign-divider"
              x1={reign.x1}
              x2={reign.x1}
              y1={y0}
              y2={y1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      ))}
      {boxes.map((box) => {
        const [h0, h1] = hitRange(box);
        return (
          <rect
            key={box.reign.reign_id}
            className="reign-hit"
            data-select={`reign:${box.reign.reign_id}`}
            data-reign={box.reign.reign_id}
            x={box.reign.x0}
            y={h0}
            width={box.reign.x1 - box.reign.x0}
            height={h1 - h0}
          />
        );
      })}
    </g>
  );
}
