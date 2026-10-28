// Stream layout: lanes, stream bands, reign segments and packed rows, for one axis. Runs at build
// time (the compiler) for both axes; the browser only scales x. Years become x only through
// timescale.ts. Pure and deterministic: coordinates are rounded to 0.1 px and every list has a
// stable order, so the same input gives byte-identical JSON.
import { curveMonotoneX, line } from 'd3-shape';
import type { DateValue, Event, Person, Reign, Stream } from '../core/schema';
import { packIntervals, rowCount } from './intervals';
import { place, spanDates, x, type Axis, type Datable, type TimescaleConfig } from './timescale';

// Sizes, checked against design-reference/board5-desktop.html (7.6 px/year there):
// - WIDTH_UNIT_PX: Board 5 draws Israel and Judah (width 3) 110 px tall and the one-unit
//   neighbour lanes 24–40 px; 36 px a unit gives 108 px for width 3 and 36 px for width 1.
// - LANE_PAD_PX: the mockup leaves ~15 px between lanes; 8 px above and below each lane.
// - SLOT_GAP_PX: keeps sibling streams of one lane (Israel, Judah) from touching.
// - ROW_HEIGHT_PX: the ribbon's prophet pills are 30 px tall in a 40 px ribbon.
// - ITEM_GAP_PX: the smallest gap between two packed items in a row.
// - FORK_YEARS: Board 5's fork curves take ~80 px (~11 years) to reach full width.
// - END_YEARS: an ending stream tapers over the same length as a fork grows.
export const WIDTH_UNIT_PX = 36;
export const LANE_PAD_PX = 8;
export const SLOT_GAP_PX = 8;
export const ROW_HEIGHT_PX = 32;
export const ITEM_GAP_PX = 4;
export const FORK_YEARS = 10;
export const END_YEARS = 10;
/** Samples per fork or taper, so the monotone curve follows the S shape. */
const CURVE_STEPS = 4;

export interface LayoutInput {
  streams: readonly Stream[];
  reigns: readonly Reign[];
  people: readonly Person[];
  events: readonly Event[];
}

/** One top-level stream and the streams forked from it. Lane-local y starts at 0. */
export interface Lane {
  id: string;
  y0: number;
  height: number;
  stream_ids: string[];
}

export interface StreamBand {
  stream_id: string;
  lane_id: string;
  kind: Stream['kind'];
  /** SVG path in lane-local coordinates (x at k = 1). */
  d: string;
  x0: number;
  x1: number;
  /** Lane-local centre line of the stream at full width. */
  cy: number;
  /** Full width in px (the stream's widest keyframe). */
  height: number;
  /** Rows of packed items (ribbon and lane streams); 0 for polities. */
  rows: number;
}

export interface ReignSegment {
  reign_id: string;
  person_id: string;
  stream_id: string;
  x0: number;
  x1: number;
  row: number;
  dashed: boolean;
  /** Placed in the tradition-only band (scholarly axis only). */
  band?: true;
}

export interface EventMark {
  event_id: string;
  stream_id: string | null;
  x0: number;
  x1: number;
  row: number;
  dashed: boolean;
  band?: true;
}

export interface PersonSpan {
  person_id: string;
  stream_id: string;
  x0: number;
  x1: number;
  row: number;
  dashed: boolean;
  band?: true;
}

export interface Unplaced {
  count: number;
  ids: string[];
}

export interface AxisLayout {
  axis: Axis;
  /** Sum of the lane heights. */
  height: number;
  lanes: Lane[];
  bands: StreamBand[];
  reigns: ReignSegment[];
  events: EventMark[];
  people: PersonSpan[];
  /** Items with no position on this axis: counted, never drawn. */
  unplaced: { streams: Unplaced; reigns: Unplaced; events: Unplaced; people: Unplaced };
}

const r1 = (v: number) => Math.round(v * 10) / 10 || 0;
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byOrder = (a: Stream, b: Stream) => a.lane_order - b.lane_order || byId(a, b);
const smooth = (u: number) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

/** Lane-local y of the centre of `row` in a band with packed rows. */
export function rowY(band: Pick<StreamBand, 'cy' | 'rows'>, row: number): number {
  return band.cy - (band.rows * ROW_HEIGHT_PX) / 2 + ROW_HEIGHT_PX * (row + 0.5);
}

interface Life {
  /** Years: [start, endX) with an exclusive end. */
  start: number;
  endX: number;
  forkYear?: number;
  endYear?: number;
  keyframes: { year: number; width: number }[];
}

/** A stream's life on this axis, or null when a year it needs is missing on this axis. */
function lifeOf(s: Stream, axis: Axis, cfg: TimescaleConfig): Life | null {
  const keyframes = s.width_keyframes
    .map((k, i) => ({ year: k.at[axis], width: k.width, i }))
    .filter((k): k is { year: number; width: number; i: number } => k.year !== undefined)
    .sort((a, b) => a.year - b.year || a.i - b.i)
    .map(({ year, width }) => ({ year, width }));
  if (keyframes.length === 0) return null;
  const forkYear = s.fork ? s.fork[axis] : undefined;
  if (s.fork && forkYear === undefined) return null;
  const endYear = s.end ? s.end[axis] : undefined;
  if (s.end && endYear === undefined) return null;
  const start = forkYear ?? keyframes[0]!.year;
  const endX = (endYear ?? cfg[axis].max) + 1;
  if (endX <= start) return null;
  return { start, endX, forkYear, endYear, keyframes };
}

/** Width in units at year t: linear between keyframes, constant outside them. */
export function widthAt(keyframes: readonly { year: number; width: number }[], t: number): number {
  const first = keyframes[0];
  if (!first) throw new Error('widthAt: no keyframes');
  if (t <= first.year) return first.width;
  for (let i = 1; i < keyframes.length; i++) {
    const a = keyframes[i - 1]!;
    const b = keyframes[i]!;
    if (t <= b.year) return a.width + ((b.width - a.width) * (t - a.year)) / (b.year - a.year);
  }
  return keyframes[keyframes.length - 1]!.width;
}

const isApprox = (...dvs: (DateValue | undefined)[]) =>
  dvs.some((dv) => dv?.certainty === 'approximate');

interface Placed {
  key: string;
  id: string;
  stream_id: string | null;
  x0: number;
  x1: number;
  dashed: boolean;
  band: boolean;
  /** Reigns in a polity sit in row 0; everything else is packed. */
  fixedRow: boolean;
}

export function layoutStreams(input: LayoutInput, axis: Axis, cfg: TimescaleConfig): AxisLayout {
  const streams = [...input.streams].sort(byOrder);
  const streamById = new Map(streams.map((s) => [s.id, s]));
  const lives = new Map<string, Life>();
  const unplacedStreams: string[] = [];
  for (const s of streams) {
    const life = lifeOf(s, axis, cfg);
    if (life) lives.set(s.id, life);
    else unplacedStreams.push(s.id);
  }

  // Items: reigns, events, and people who have no reign (a reign already shows its person).
  const placed: Placed[] = [];
  const unplaced = { reigns: [] as string[], events: [] as string[], people: [] as string[] };
  const add = (
    kind: 'reigns' | 'events' | 'people',
    id: string,
    streamId: string | null,
    item: Datable,
    dashed: boolean,
    fixedRow: boolean,
  ) => {
    const p = place(item, axis, cfg);
    if (p.kind === 'unplaced') {
      unplaced[kind].push(id);
      return;
    }
    placed.push({
      key: `${kind}:${id}`,
      id,
      stream_id: streamId,
      x0: r1(p.x0),
      x1: r1(p.x1),
      dashed,
      band: p.kind === 'band',
      fixedRow,
    });
  };
  for (const r of [...input.reigns].sort(byId)) {
    const item = {
      scholarly: spanDates(r.start_scholarly, r.end_scholarly),
      traditional: spanDates(r.start_traditional, r.end_traditional),
    };
    const dashed = isApprox(r[`start_${axis}`], r[`end_${axis}`]);
    add('reigns', r.id, r.stream_id, item, dashed, streamById.get(r.stream_id)?.kind === 'polity');
  }
  for (const e of [...input.events].sort(byId)) {
    const item = { scholarly: e.date_scholarly, traditional: e.date_traditional };
    add('events', e.id, e.stream_id ?? null, item, isApprox(e[`date_${axis}`]), false);
  }
  const withReign = new Set(input.reigns.map((r) => r.person_id));
  for (const p of [...input.people].sort(byId)) {
    if (withReign.has(p.id)) continue;
    const item = {
      scholarly: spanDates(p.birth_scholarly, p.death_scholarly),
      traditional: spanDates(p.birth_traditional, p.death_traditional),
    };
    add('people', p.id, p.stream_id, item, isApprox(p[`birth_${axis}`], p[`death_${axis}`]), false);
  }

  // Rows: per stream, everything not in a fixed row is packed together.
  const rowOf = new Map<string, number>();
  const rowsIn = new Map<string, number>();
  const byStream = new Map<string, Placed[]>();
  for (const it of placed) {
    if (it.fixedRow) {
      rowOf.set(it.key, 0);
      continue;
    }
    const k = it.stream_id ?? '';
    byStream.set(k, [...(byStream.get(k) ?? []), it]);
  }
  for (const [k, items] of byStream) {
    const rows = packIntervals(
      items.map((it) => ({ id: it.key, x0: it.x0, x1: it.x1 })),
      ITEM_GAP_PX,
    );
    for (const [key, row] of rows) rowOf.set(key, row);
    rowsIn.set(k, rowCount(rows));
  }

  // Full width of each placed stream; ribbons and lanes grow to fit their rows.
  const unitScale = new Map<string, number>();
  const fullPx = new Map<string, number>();
  for (const [id, life] of lives) {
    const s = streamById.get(id)!;
    const maxUnits = Math.max(...life.keyframes.map((k) => k.width));
    const rows = s.kind === 'polity' ? 0 : (rowsIn.get(id) ?? 0);
    const scale = Math.max(1, (rows * ROW_HEIGHT_PX) / (maxUnits * WIDTH_UNIT_PX));
    unitScale.set(id, scale);
    fullPx.set(id, r1(maxUnits * WIDTH_UNIT_PX * scale));
  }

  // Lane groups: each placed stream belongs to its top-level ancestor's lane.
  const rootOf = (s: Stream): Stream => {
    const seen = new Set<string>();
    let cur = s;
    while (cur.parent_stream_id && streamById.has(cur.parent_stream_id) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = streamById.get(cur.parent_stream_id)!;
    }
    return cur;
  };
  const groups = new Map<string, Stream[]>();
  for (const s of streams) {
    if (!lives.has(s.id)) continue;
    const root = rootOf(s);
    groups.set(root.id, [...(groups.get(root.id) ?? []), s]);
  }
  const roots = [...groups.keys()].map((id) => streamById.get(id)!).sort(byOrder);

  const lanes: Lane[] = [];
  const bands: StreamBand[] = [];
  let laneY = 0;
  for (const root of roots) {
    const members = groups.get(root.id)!.sort(byOrder);
    const memberIds = new Set(members.map((m) => m.id));
    const childrenOf = (id: string) => members.filter((m) => m.parent_stream_id === id);

    // A parent whose forked children carry on from its end shares their space instead of
    // taking a slot of its own (Board 5: the United Kingdom between Israel and Judah).
    const continued = (s: Stream): boolean => {
      const life = lives.get(s.id)!;
      const kids = childrenOf(s.id);
      if (life.endYear === undefined || kids.length === 0) return false;
      return kids.every((c) => {
        const f = lives.get(c.id)!.forkYear;
        return f !== undefined && f >= life.endYear! - FORK_YEARS;
      });
    };

    const cy = new Map<string, number>();
    let y = 0;
    for (const m of members) {
      if (continued(m)) continue;
      const h = fullPx.get(m.id)!;
      cy.set(m.id, y + h / 2);
      y += h + SLOT_GAP_PX;
    }
    const depth = (s: Stream): number => {
      let d = 0;
      for (let cur = s; cur.parent_stream_id && memberIds.has(cur.parent_stream_id); d++) {
        cur = streamById.get(cur.parent_stream_id)!;
      }
      return d;
    };
    const overlaid = members.filter(continued).sort((a, b) => depth(b) - depth(a) || byOrder(a, b));
    for (const p of overlaid) {
      const ys = childrenOf(p.id).map((c) => cy.get(c.id)!);
      cy.set(p.id, (Math.min(...ys) + Math.max(...ys)) / 2);
    }
    const top = Math.min(...members.map((m) => cy.get(m.id)! - fullPx.get(m.id)! / 2));
    const bottom = Math.max(...members.map((m) => cy.get(m.id)! + fullPx.get(m.id)! / 2));
    const shift = LANE_PAD_PX - top;
    for (const m of members) cy.set(m.id, r1(cy.get(m.id)! + shift));
    const height = r1(bottom - top + 2 * LANE_PAD_PX);

    for (const m of members) {
      const life = lives.get(m.id)!;
      const parentCy =
        m.parent_stream_id && cy.has(m.parent_stream_id) ? cy.get(m.parent_stream_id)! : undefined;
      bands.push({
        stream_id: m.id,
        lane_id: root.id,
        kind: m.kind,
        d: bandPath(m, life, {
          axis,
          cfg,
          cy: cy.get(m.id)!,
          parentCy,
          scale: unitScale.get(m.id)!,
          taper: life.endYear !== undefined && !continued(m),
        }),
        x0: r1(x(life.start, axis, cfg)),
        x1: r1(x(life.endX, axis, cfg)),
        cy: cy.get(m.id)!,
        height: fullPx.get(m.id)!,
        rows: m.kind === 'polity' ? 0 : (rowsIn.get(m.id) ?? 0),
      });
    }
    lanes.push({ id: root.id, y0: r1(laneY), height, stream_ids: members.map((m) => m.id) });
    laneY += height;
  }

  const out = <T>(kind: 'reigns' | 'events' | 'people', f: (p: Placed, row: number) => T): T[] =>
    placed.filter((p) => p.key.startsWith(`${kind}:`)).map((p) => f(p, rowOf.get(p.key) ?? 0));
  const bandFlag = (p: Placed) => (p.band ? { band: true as const } : {});
  const reignById = new Map(input.reigns.map((r) => [r.id, r]));
  const list = (ids: string[]): Unplaced => ({ count: ids.length, ids: [...ids].sort() });

  return {
    axis,
    height: r1(laneY),
    lanes,
    bands,
    reigns: out('reigns', (p, row) => ({
      reign_id: p.id,
      person_id: reignById.get(p.id)!.person_id,
      stream_id: p.stream_id!,
      x0: p.x0,
      x1: p.x1,
      row,
      dashed: p.dashed,
      ...bandFlag(p),
    })),
    events: out('events', (p, row) => ({
      event_id: p.id,
      stream_id: p.stream_id,
      x0: p.x0,
      x1: p.x1,
      row,
      dashed: p.dashed,
      ...bandFlag(p),
    })),
    people: out('people', (p, row) => ({
      person_id: p.id,
      stream_id: p.stream_id!,
      x0: p.x0,
      x1: p.x1,
      row,
      dashed: p.dashed,
      ...bandFlag(p),
    })),
    unplaced: {
      streams: list(unplacedStreams),
      reigns: list(unplaced.reigns),
      events: list(unplaced.events),
      people: list(unplaced.people),
    },
  };
}

interface BandOpts {
  axis: Axis;
  cfg: TimescaleConfig;
  cy: number;
  parentCy: number | undefined;
  scale: number;
  taper: boolean;
}

const pathOf = line<[number, number]>().curve(curveMonotoneX).digits(1);

/**
 * The band's outline: the top edge left to right, then the bottom edge back, on a monotone curve
 * (no overshoot, so the band stays inside its lane). A forked stream grows from its parent's
 * centre over FORK_YEARS; an ending stream tapers to a point over END_YEARS, unless its forked
 * children carry on from its end.
 */
function bandPath(s: Stream, life: Life, o: BandOpts): string {
  const grows = life.forkYear !== undefined;
  const from = grows ? (o.parentCy ?? o.cy) : o.cy;
  const years = new Set<number>([life.start, life.endX]);
  for (const k of life.keyframes) years.add(k.year);
  for (let i = 1; i <= CURVE_STEPS; i++) {
    if (grows) years.add(life.start + (FORK_YEARS * i) / CURVE_STEPS);
    if (o.taper) years.add(life.endX - (END_YEARS * i) / CURVE_STEPS);
  }
  const ts = [...years].filter((t) => t >= life.start && t <= life.endX).sort((a, b) => a - b);

  const top: [number, number][] = [];
  const bottom: [number, number][] = [];
  for (const t of ts) {
    const f = grows ? smooth((t - life.start) / FORK_YEARS) : 1;
    const g = o.taper ? smooth((life.endX - t) / END_YEARS) : 1;
    const w = widthAt(life.keyframes, t) * WIDTH_UNIT_PX * o.scale * f * g;
    const c = from + (o.cy - from) * f;
    const px = r1(x(t, o.axis, o.cfg));
    const pt: [number, number] = [px, r1(c - w / 2)];
    const pb: [number, number] = [px, r1(c + w / 2)];
    // Rounding can merge samples; keep the first, but always keep the final end point.
    if (top.length > 0 && top[top.length - 1]![0] === px) {
      if (t !== life.endX) continue;
      top.pop();
      bottom.pop();
    }
    top.push(pt);
    bottom.push(pb);
  }
  if (top.length < 2) throw new Error(`bandPath: ${s.id} is narrower than 0.1 px`);
  const upper = pathOf(top)!;
  const lower = pathOf(bottom.reverse())!.replace(/^M/, 'L');
  return `${upper}${lower}Z`;
}
