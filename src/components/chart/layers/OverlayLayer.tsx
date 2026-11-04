// OverlayLayer: the red outline around the selected reign, person or event (DR-3: emphasis is
// red ink). Mounted in the x-scaled overlay group, so it draws in base coordinates with a
// non-scaling stroke.
import { ROW_HEIGHT_PX, rowY, type StreamBand } from '../../../lib/layout/streams';
import type { LayerProps } from './types';

export interface Outline {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Outline boxes for the selection on the current axis (none when it has no position there). */
export function selectionOutlines(p: LayerProps): Outline[] {
  const sel = p.selection;
  if (!sel) return [];
  const geo = p.tile.axes[p.axis];
  const bandOf = new Map(geo.bands.map((b) => [b.stream_id, b]));
  const box = (streamId: string | null, x0: number, x1: number, row: number): Outline | null => {
    const band: StreamBand | undefined = streamId ? bandOf.get(streamId) : undefined;
    const top = band ? p.laneY.get(band.lane_id) : undefined;
    if (!band || top === undefined) return null;
    if (band.rows > 0 && row >= 0) {
      const cy = top + rowY(band, row);
      return { x0, x1, y0: cy - ROW_HEIGHT_PX / 2, y1: cy + ROW_HEIGHT_PX / 2 };
    }
    return { x0, x1, y0: top + band.cy - band.height / 2, y1: top + band.cy + band.height / 2 };
  };
  const out: (Outline | null)[] = [];
  if (sel.kind === 'reign') {
    for (const r of geo.reigns)
      if (r.reign_id === sel.id) out.push(box(r.stream_id, r.x0, r.x1, r.row));
  } else if (sel.kind === 'event') {
    for (const e of geo.events)
      if (e.event_id === sel.id) out.push(box(e.stream_id, e.x0, e.x1, e.row));
  } else {
    for (const r of geo.reigns)
      if (r.person_id === sel.id) out.push(box(r.stream_id, r.x0, r.x1, r.row));
    for (const s of geo.people)
      if (s.person_id === sel.id) out.push(box(s.stream_id, s.x0, s.x1, s.row));
  }
  return out.filter((o): o is Outline => o !== null);
}

export default function OverlayLayer(props: LayerProps) {
  return (
    <>
      {selectionOutlines(props).map((o, i) => (
        <rect
          key={i}
          className="chart-selection"
          x={o.x0}
          y={o.y0}
          width={o.x1 - o.x0}
          height={o.y1 - o.y0}
        />
      ))}
    </>
  );
}
