// Keeps the page URL in step with the chart (FR-10, demo step 9), both ways.
//
// - On start: the URL's state is applied in order: the axis first (zoom clamps to the axis's
//   width), then the view through the ChartController, then the selection and hidden lanes.
// - After each committed change the URL is rewritten with history.replaceState. A new selection
//   pushes a history entry instead, so Back closes it. Back (popstate) restores only the selection
//   of the entry it lands on: the view stays where the reader left it.
// - Gesture rule: the URL is never written during a gesture. The store's committed viewport also
//   changes every 150 ms in a long (inertia) gesture, so viewport changes are written only once
//   the viewport has been still for URL_SETTLE_MS: once, at the gesture's end.
//
// Defaults are omitted (viewstate.ts): the fitted view has no y or z, so a fresh chart is `/`.
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import {
  parseViewState,
  serializeViewState,
  type ViewSelKind,
  type ViewState,
  type ViewStateLimits,
} from '../../lib/core/viewstate';
import {
  totalWidth,
  x as yearToX,
  type Axis,
  type TimescaleConfig,
} from '../../lib/layout/timescale';
import { clampView, sameView } from './axis-switch';
import type { ChartState, ChartStore, Selection } from './state';
import type { ChartController, View } from './zoom';

/** A viewport change is written once it has been still this long (> COMMIT_EVERY_MS). */
export const URL_SETTLE_MS = 400;

/** The parts of `window` this uses (a fake one in tests). */
export interface UrlWindow {
  location: Pick<Location, 'pathname' | 'search' | 'hash'>;
  history: Pick<History, 'replaceState' | 'pushState' | 'state'>;
  addEventListener: (type: 'popstate', listener: () => void) => void;
  removeEventListener: (type: 'popstate', listener: () => void) => void;
}

export interface UrlSyncOptions {
  store: ChartStore;
  controller: ChartController;
  index: IndexFile;
  /** The current view model (it changes as tiles load); used to map slugs to ids and back. */
  getTile: () => TileFile;
  win?: UrlWindow;
  settleMs?: number;
}

/**
 * The fractional year at base x `px`, on the axis's own linear scale (timescale.x is linear for
 * any year), so the centre is exact on the tradition-only band too.
 */
function yearAtPx(px: number, axis: Axis, cfg: TimescaleConfig): number {
  const x0 = yearToX(0, axis, cfg);
  return (px - x0) / (yearToX(1, axis, cfg) - x0);
}

/** The view that the zoom fits on load: the whole axis across the width. */
export function fitView(axis: Axis, cfg: TimescaleConfig, width: number): View {
  return clampView({ x: 0, k: width / totalWidth(axis, cfg) }, axis, cfg, width);
}

/** The y and z a URL may hold: years on the chart's width, zooms within the zoom range. */
export function viewLimits(cfg: TimescaleConfig): ViewStateLimits {
  const range = (axis: Axis) =>
    [
      Math.floor(yearAtPx(0, axis, cfg)),
      Math.ceil(yearAtPx(totalWidth(axis, cfg), axis, cfg)),
    ] as const;
  const z = [Math.floor(cfg.zoom.kMin * 100) / 100, Math.ceil(cfg.zoom.kMax * 100) / 100] as const;
  return { y: { scholarly: range('scholarly'), traditional: range('traditional') }, z };
}

const sameSel = (a: Selection | null, b: Selection | null) =>
  a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

export function startUrlSync(o: UrlSyncOptions): () => void {
  const { store, controller, index } = o;
  const cfg = index.timescale!;
  const win = o.win ?? (window as unknown as UrlWindow);
  const settleMs = o.settleMs ?? URL_SETTLE_MS;
  const limits = viewLimits(cfg);

  const streamById = new Map(index.streams.map((s) => [s.id, s]));
  const streamBySlug = new Map(index.streams.map((s) => [s.slug, s]));
  const laneIds = new Set(
    (['scholarly', 'traditional'] as const).flatMap(
      (a) => index.layout?.[a].lanes.map((l) => l.id) ?? [],
    ),
  );
  /** Slugs learned from tiles seen so far, so a selection scrolled out of the window keeps one. */
  const slugOf = new Map<string, string>();
  const key = (kind: ViewSelKind, id: string) => `${kind}:${id}`;

  const selectionSlug = (sel: Selection): string | undefined => {
    if (sel.kind === 'reign') return sel.id;
    const tile = o.getTile();
    const item =
      sel.kind === 'person'
        ? tile.people.find((p) => p.id === sel.id)
        : tile.events.find((e) => e.id === sel.id);
    if (item) slugOf.set(key(sel.kind, sel.id), item.slug);
    return slugOf.get(key(sel.kind, sel.id));
  };
  const selectionFor = (sel: ViewState['sel']): Selection | null => {
    if (!sel) return null;
    const tile = o.getTile();
    const id =
      sel.kind === 'reign'
        ? tile.reigns.find((r) => r.id === sel.slug)?.id
        : sel.kind === 'person'
          ? tile.people.find((p) => p.slug === sel.slug)?.id
          : tile.events.find((e) => e.slug === sel.slug)?.id;
    if (!id) return null;
    slugOf.set(key(sel.kind, id), sel.slug);
    return { kind: sel.kind, id };
  };

  /** The URL state of a store snapshot. */
  const viewStateOf = (s: ChartState): ViewState => {
    const out: ViewState = {
      axis: s.axis,
      hide: s.hiddenLanes.flatMap((id) => streamById.get(id)?.slug ?? []),
    };
    const v = s.committedViewport;
    if (v && !sameView(v, fitView(s.axis, cfg, v.width))) {
      out.y = Math.round(yearAtPx((v.width / 2 - v.x) / v.k, s.axis, cfg));
      out.z = Math.round(v.k * 100) / 100;
    }
    const slug = s.selection ? selectionSlug(s.selection) : undefined;
    if (s.selection && slug) out.sel = { kind: s.selection.kind, slug };
    return out;
  };

  const urlFor = (s: ChartState) =>
    `${win.location.pathname}${serializeViewState(viewStateOf(s))}${win.location.hash}`;
  const current = () => `${win.location.pathname}${win.location.search}${win.location.hash}`;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const write = (push: boolean) => {
    cancel();
    const url = urlFor(store.getSnapshot());
    if (push) win.history.pushState(null, '', url);
    else if (url !== current()) win.history.replaceState(win.history.state, '', url);
  };

  // 1. Hydrate from the URL.
  const parsed = parseViewState(win.location.search, limits);
  store.setAxis(parsed.axis);
  const width = store.getSnapshot().committedViewport?.width;
  if (width) {
    if (parsed.y !== undefined || parsed.z !== undefined) {
      const now = controller.getView();
      const k = parsed.z ?? now.k;
      const centre =
        parsed.y !== undefined ? yearToX(parsed.y, parsed.axis, cfg) : (width / 2 - now.x) / now.k;
      controller.setView({ x: width / 2 - centre * k, k });
    } else if (parsed.axis !== 'scholarly') {
      controller.setView(fitView(parsed.axis, cfg, width));
    }
  }
  store.hydrate({
    selection: selectionFor(parsed.sel),
    hiddenLanes: parsed.hide.flatMap((slug) => {
      const id = streamBySlug.get(slug)?.id;
      return id && laneIds.has(id) ? [id] : [];
    }),
  });
  // Normalize the URL (junk dropped) without adding an entry.
  write(false);

  // 2. Write committed changes.
  let prev = store.getSnapshot();
  let restoring = false;
  const unsubscribe = store.subscribe(() => {
    const s = store.getSnapshot();
    const before = prev;
    prev = s;
    if (restoring) return;
    if (!sameSel(s.selection, before.selection)) {
      write(s.selection !== null);
    } else if (s.axis !== before.axis || s.hiddenLanes !== before.hiddenLanes) {
      write(false);
    } else if (s.committedViewport !== before.committedViewport) {
      cancel();
      timer = setTimeout(() => write(false), settleMs);
    }
  });

  // 3. Back and Forward: restore the entry's selection, keep the view, then rewrite the URL.
  const onPop = () => {
    const sel = selectionFor(parseViewState(win.location.search, limits).sel);
    restoring = true;
    try {
      store.setSelection(sel);
    } finally {
      restoring = false;
    }
    write(false);
  };
  win.addEventListener('popstate', onPop);

  return () => {
    cancel();
    unsubscribe();
    win.removeEventListener('popstate', onPop);
  };
}
