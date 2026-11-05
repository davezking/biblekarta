// ProphetLayer: people drawn as spans of their own (FR-5; Board 5). These are the people with no
// reign (a reign already shows its person: ReignLayer and LabelLayer draw it, Elisha's included).
// In the prophet ribbon they are the prophets; in a neighbour lane (Sidon, Aram, Ethiopia…) they
// are the people Board 5 letters there.
//
// - A person with a span is a pill in their stream's packed row, so overlapping people never
//   overlap on screen; an approximate span (`dashed`) gets a dashed outline.
// - A person with only a point (one known year) is a marker at that date.
// - Names are lettered with LOD (the full "name (years)" where it fits, with the "በግምት" form from
//   formatScholarly for approximate dates; then the name alone), with a tooltip where they are not.
//
// Pills are geometry, in the x-scaled group; markers, names and hit targets are in screen space
// through EventLayer's ItemsOverlay.
import { useMemo } from 'react';
import { ink, vellum } from '../../../lib/core/tokens';
import { spanDates } from '../../../lib/layout/timescale';
import {
  formatOn,
  ItemsOverlay,
  POINT_MAX_PX,
  useLabelsGroup,
  slotOf,
  type ScreenItem,
} from './EventLayer';
import { yExtent } from '../cull';
import { inkOn } from './LabelLayer';
import type { LayerProps } from './types';
import './items.css';

type Input = Pick<LayerProps, 'tile' | 'index' | 'axis' | 'laneY' | 't'>;

/** The people with a span of their own on this axis, each in their stream's row. */
export function personItems(p: Input): ScreenItem[] {
  const people = new Map(p.tile.people.map((x) => [x.id, x]));
  const streams = new Map(p.index.streams.map((s) => [s.id, s]));
  const out: ScreenItem[] = [];
  for (const span of p.tile.axes[p.axis].people) {
    const person = people.get(span.person_id);
    const slot = slotOf(p, span);
    if (!person || !slot) continue;
    const stream = streams.get(span.stream_id);
    const [birth, death] =
      p.axis === 'scholarly'
        ? [person.birth_scholarly, person.death_scholarly]
        : [person.birth_traditional, person.death_traditional];
    const years = formatOn(p.axis, spanDates(birth, death), p.t);
    const name = person.name_am;
    out.push({
      key: `person:${person.id}`,
      group: `${span.stream_id}:${span.row}`,
      x0: span.x0,
      x1: span.x1,
      ...slot,
      point: span.x1 - span.x0 <= POINT_MAX_PX,
      dashed: span.dashed,
      importance: person.importance,
      texts: years ? [`${name} (${years})`, name] : [name],
      size: stream?.kind === 'ribbon' ? 'name' : 'years',
      inkColor: inkOn(stream?.fill_color ?? vellum.base, ink.black),
      tip: { name, years },
    });
  }
  return out;
}

export default function ProphetLayer(props: LayerProps) {
  const { tile, index, axis, laneY, t, viewport, committed } = props;
  const { ref, labelsGroup } = useLabelsGroup();
  const items = useMemo(
    () => personItems({ tile, index, axis, laneY, t }),
    [tile, index, axis, laneY, t],
  );
  return (
    <g ref={ref} className="chart-people">
      {items
        .filter((it) => !it.point)
        .map((it) => (
          <rect
            key={it.key}
            className={it.dashed ? 'person-pill item-dashed' : 'person-pill'}
            data-person-span={it.key.slice('person:'.length)}
            {...yExtent(it.cy - it.h / 2, it.cy + it.h / 2)}
            x={it.x0}
            y={it.cy - it.h / 2 + 2}
            width={it.x1 - it.x0}
            height={it.h - 4}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      <ItemsOverlay
        labelsGroup={labelsGroup}
        items={items}
        className="chart-person-items"
        mark="dot"
        viewport={viewport}
        committed={committed}
        yBand={props.yBand}
      />
    </g>
  );
}
