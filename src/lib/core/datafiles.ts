// The static data contract between the compiler (src/build/compile-data.ts) and the browser:
// /data/index.json and /data/tiles/<era>.json. Bump DATA_VERSION on any breaking change.
// Years follow schema.ts; x positions are at zoom k = 1 (timescale.ts).
import type { Anchor, Era, Event, Person, Reign, Source, Stream } from './schema';
import type { Axis, TimescaleConfig } from '../layout/timescale';
import type {
  EventMark,
  Lane,
  PersonSpan,
  ReignSegment,
  StreamBand,
  Unplaced,
} from '../layout/streams';

export const DATA_VERSION = 1;

export const INDEX_FILE = 'index.json';
export const tileFile = (eraSlug: string) => `tiles/${eraSlug}.json`;

/** An era as the minimap and tile loader need it. `x` is null on an axis the era has no years on. */
export interface IndexEra {
  id: string;
  slug: string;
  name_am: string;
  name_en: string;
  start?: Era['start'];
  end?: Era['end'];
  certainty: Era['certainty'];
  status: Era['status'];
  order: number;
  gap?: boolean;
  /** Minimap share; defaults to 1. */
  minimap_weight: number;
  x: Record<Axis, { x0: number; x1: number } | null>;
  /** Tile path under /data/, for live eras only. */
  tile: string | null;
}

export type IndexStream = Pick<
  Stream,
  'id' | 'slug' | 'name_am' | 'name_en' | 'kind' | 'fill_color' | 'lane_order' | 'parent_stream_id'
>;

export interface UnplacedCounts {
  streams: number;
  reigns: number;
  events: number;
  people: number;
}

export interface IndexFile {
  version: typeof DATA_VERSION;
  /** The git SHA of the build, or a timestamp; keys browser caches. */
  buildId: string;
  /** Contents of scripture.lock. */
  scriptureVersion: string;
  /** Ids of the verified books published to /data/scripture/. */
  scriptureBooks: string[];
  /** Null when no era is live (nothing to chart yet). */
  timescale: TimescaleConfig | null;
  /** Lane geometry per axis; lanes are global, the bands live in the tiles. */
  layout: Record<Axis, { height: number; lanes: Lane[] }> | null;
  /** All eras (live and coming soon), in `order`: also the minimap's data. */
  eras: IndexEra[];
  streams: IndexStream[];
  anchors: Anchor[];
  /** Per live era id, per axis: how many items have no position (counted, not shown). */
  unplaced: Record<string, Record<Axis, UnplacedCounts>>;
  /** Items that belong to no live era, so are in no tile (e.g. a streamless event with TBD dates). */
  unassigned: Unassigned;
}

/** Items that belong to no live era, by kind. */
export type Unassigned = Record<keyof UnplacedCounts, Unplaced>;

export interface TileAxis {
  bands: StreamBand[];
  reigns: ReignSegment[];
  events: EventMark[];
  people: PersonSpan[];
  /** Ids of this tile's items with no position on this axis. */
  unplaced: { streams: Unplaced; reigns: Unplaced; events: Unplaced; people: Unplaced };
}

/** One live era: geometry for both axes plus everything the detail panel needs. */
export interface TileFile {
  version: typeof DATA_VERSION;
  buildId: string;
  era: string;
  axes: Record<Axis, TileAxis>;
  people: Person[];
  reigns: Reign[];
  events: Event[];
  /** The sources and anchors this tile's dates cite. */
  sources: Source[];
  anchors: Anchor[];
}
