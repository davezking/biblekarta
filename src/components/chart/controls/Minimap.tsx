// Minimap (FR-7, Board 5): the strip of all eras under the chart, "መላው ሰንጠረዥ — ከፍጥረት እስከ
// ሐዋርያት". It shows the visible window and moves it.
//
// - Every era from the index, in `order`, sized by minimap_weight (lib/layout/minimap.ts). Live eras
//   are in ink and tapping one focuses its span; coming-soon eras are faded, show "coming soon" on
//   hover or focus, and do nothing.
// - The window rectangle follows the chart: it is placed imperatively from the viewport channel
//   (during gestures) and the committed viewport, never through React state.
// - Dragging the window pans the chart with live setViews (no store commit, so no React commit),
//   and the release commits once. The window is a slider for the keyboard: arrows pan by a tenth
//   of the view, Page Up / Page Down by a whole view, Home / End go to the ends.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  boxSpan,
  dragView,
  minimapLayout,
  viewCentreToMinimap,
  viewToMinimap,
  type MinimapLayout,
} from '../../../lib/layout/minimap';
import type { Axis } from '../../../lib/layout/timescale';
import type { Viewport } from '../state';
import type { ControlProps } from './types';
import './minimap.css';

/** Arrow keys pan by this share of the visible width. */
export const KEY_STEP = 0.1;
/** The window is drawn at least this wide, so it can be seen and grabbed at deep zoom. */
const MIN_WINDOW_PX = 12;

/** The era box under strip px `px` (its Amharic name), for the slider's value text. */
function eraAt(layout: MinimapLayout, px: number): string | undefined {
  return (
    layout.boxes.find((b) => px >= b.left && px < b.left + b.width)?.name_am ??
    layout.boxes.at(-1)?.name_am
  );
}

/** Writes the window's position and slider values straight onto its element. */
function placeWindow(el: HTMLElement, layout: MinimapLayout, axis: Axis, v: Viewport | null) {
  const rect = v && v.width > 0 ? viewToMinimap(v, layout, axis) : null;
  if (!rect) {
    el.style.display = 'none';
    return;
  }
  const w = Math.max(rect.width, MIN_WINDOW_PX);
  const left = Math.min(
    Math.max(rect.left - (w - rect.width) / 2, 0),
    Math.max(layout.width - w, 0),
  );
  el.style.display = '';
  el.style.left = `${left}px`;
  el.style.width = `${w}px`;
  const centre = viewCentreToMinimap(v!, layout, axis);
  el.setAttribute(
    'aria-valuenow',
    String(layout.width > 0 ? Math.round((centre / layout.width) * 100) : 0),
  );
  el.setAttribute('aria-valuetext', eraAt(layout, centre) ?? '');
}

export default function Minimap({ store, controller, viewport, index, t }: ControlProps) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const stripRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const [stripWidth, setStripWidth] = useState(0);
  const layout = useMemo(
    () => minimapLayout(index.eras, stripWidth, index.timescale),
    [index, stripWidth],
  );

  // Measure the strip (and follow resizes).
  useLayoutEffect(() => {
    const el = stripRef.current!;
    const measure = () => setStripWidth(Math.round(el.clientWidth));
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentViewport = (): Viewport | null => {
    const v = viewport.get() ?? store.getSnapshot().committedViewport;
    if (!v) return null;
    // A setView updates the controller before the throttled channel notifies.
    const now = controller?.getView();
    return now ? { ...v, x: now.x, k: now.k } : v;
  };
  const place = () => {
    if (windowRef.current) {
      placeWindow(windowRef.current, layout, s.axis, currentViewport());
    }
  };

  // Follow the chart: on every throttled viewport during gestures, and after each render. The
  // listener is re-bound each render, so it always places with the current layout and axis.
  useEffect(() => viewport.subscribe(() => place()));
  useLayoutEffect(place);

  // Dragging the window.
  const drag = useRef<{ id: number; startX: number; lastX: number; start: Viewport } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const v = currentViewport();
    if (!controller || !v || e.button > 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // No capture (an unknown pointer): the drag still follows moves over the window.
    }
    drag.current = {
      id: e.pointerId,
      startX: e.clientX,
      lastX: e.clientX,
      start: v,
    };
  };
  const moveTo = (clientX: number, commit: boolean) => {
    const d = drag.current;
    if (!d || !controller) return;
    d.lastX = clientX;
    const next = dragView(d.start, clientX - d.startX, layout, s.axis);
    if (next) controller.setView(next, { live: !commit });
    place();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) moveTo(e.clientX, false);
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    // A cancelled pointer has no useful position: commit where the drag last was.
    moveTo(e.type === 'pointercancel' ? drag.current.lastX : e.clientX, true);
    drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const v = currentViewport();
    if (!controller || !v) return;
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp'
        ? KEY_STEP
        : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
          ? -KEY_STEP
          : e.key === 'PageDown'
            ? 1
            : e.key === 'PageUp'
              ? -1
              : e.key === 'End'
                ? Infinity
                : e.key === 'Home'
                  ? -Infinity
                  : 0;
    if (!step) return;
    e.preventDefault();
    // setView clamps the infinite ends to the content.
    const x = Number.isFinite(step) ? v.x - step * v.width : step > 0 ? -1e12 : 1e12;
    controller.setView({ x, k: v.k });
    place();
  };

  const focusEra = (span: { x0: number; x1: number } | null) => {
    if (span && controller) controller.focusOn(span.x0, span.x1);
  };

  return (
    <div className="minimap">
      <p className="minimap-title">{t('minimap.label')}</p>
      <div className="minimap-strip" ref={stripRef}>
        {layout.boxes.map((b) => {
          const span = boxSpan(layout, b, s.axis);
          const clickable = b.live && span !== null;
          return (
            <button
              key={b.id}
              type="button"
              className={`minimap-era ${b.live ? 'is-live' : 'is-soon'}`}
              data-era={b.slug}
              style={{ left: `${b.left}px`, width: `${b.width}px` }}
              aria-disabled={clickable ? undefined : true}
              onClick={clickable ? () => focusEra(span) : undefined}
            >
              <span className="minimap-era-name" lang="am">
                {b.name_am}
              </span>
              {!b.live && <span className="minimap-soon">{t('minimap.comingSoon')}</span>}
            </button>
          );
        })}
        <div
          ref={windowRef}
          className="minimap-window"
          role="slider"
          tabIndex={0}
          aria-label={t('minimap.label')}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
