// AnchorLayer: anchor dates (FR-23, DR-8), as red dashed vertical lines down the chart. Anchors are
// external evidence dated on the scholarly axis only, so on the traditional axis nothing is drawn
// (they are never converted).
//
// Mounted in the x-scaled geometry group: the lines are in base (k = 1) coordinates with a
// non-scaling stroke. Each anchor's tap target is a transparent line with a 44 px non-scaling
// stroke, so it stays 44 px wide on screen at every zoom. The anchor is a focusable button; tap,
// click, Enter or Space opens a small popover (label — source, and confidence), and Esc or a tap
// elsewhere closes it.
//
// The task names `ui/Tooltip` (P2-S1-T4) for the popover; that component isn't merged yet, so this
// layer draws a small HTML popover of its own, rendered into document.body with position: fixed.
// While it is open it follows the live viewport imperatively (no React render during a gesture).
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { Anchor } from '../../../lib/core/schema';
import { touchTarget } from '../../../lib/core/tokens';
import type { T } from '../../../lib/i18n';
import { x, type Axis, type TimescaleConfig } from '../../../lib/layout/timescale';
import { AXIS_BAND_PX } from '../geometry';
import type { Viewport } from '../state';
import type { LayerProps } from './types';
import './anchors.css';

/** The lines start where the grid lines do, a little above the first lane. */
export const LINE_TOP_PX = AXIS_BAND_PX - 6;
/**
 * The handle: a touch-sized tap target at the top of each line (0 to HANDLE_PX, in the axis band),
 * drawn in the overlay group above the streams. Inside the streams, the reign targets are drawn
 * after this layer and take the taps there, so the handle is the one target always in reach.
 */
export const HANDLE_PX = touchTarget;
/** Space between the popover and the handle / the frame's sides. */
const POPOVER_MARGIN_PX = 8;

/** The anchors drawn on this axis: all of them on the scholarly axis, none on the traditional. */
export function anchorsOn(axis: Axis, anchors: readonly Anchor[]): readonly Anchor[] {
  return axis === 'scholarly' ? anchors : [];
}

/** The line's x at k = 1: the middle of the anchor's year (or of its span of years). */
export function anchorX(a: Anchor, cfg: TimescaleConfig): number {
  const end = a.date.end ?? a.date.start;
  return (x(a.date.start, 'scholarly', cfg) + x(end + 1, 'scholarly', cfg)) / 2;
}

/** The anchor's label in the UI language. */
export const anchorLabel = (a: Anchor, t: T) =>
  t('anchor.label', { am: a.label_am, en: a.label_en });

/** "label — source": the popover's heading and the button's accessible name. */
export const anchorTitle = (a: Anchor, t: T) =>
  t('anchor.title', { label: anchorLabel(a, t), source: a.external_source });

export const anchorConfidence = (a: Anchor, t: T) =>
  t('anchor.confidence', { level: t(`anchor.confidence.${a.confidence}`) });

/** The popover's left edge on the page: centred on the line, kept inside the chart frame. */
export function popoverLeft(lineX: number, width: number, frame: { left: number; width: number }) {
  const min = frame.left + POPOVER_MARGIN_PX;
  const max = frame.left + frame.width - width - POPOVER_MARGIN_PX;
  return Math.max(min, Math.min(max, frame.left + lineX - width / 2));
}

export default function AnchorLayer({
  index,
  axis,
  cfg,
  viewport,
  committed,
  height,
  t,
}: LayerProps) {
  const anchors = anchorsOn(axis, index.anchors);
  const [openId, setOpenId] = useState<string | null>(null);
  // Switching axis closes the popover (the traditional axis has no anchors), and switching back
  // does not reopen it. Adjusted during render, React's pattern for state that follows a prop.
  const [openAxis, setOpenAxis] = useState(axis);
  if (openAxis !== axis) {
    setOpenAxis(axis);
    setOpenId(null);
  }
  const groupRef = useRef<SVGGElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  // The overlay group (above the streams) holds the handles; found once after mount.
  const [overlay, setOverlay] = useState<SVGGElement | null>(null);
  useLayoutEffect(() => {
    setOverlay(
      groupRef.current?.ownerSVGElement?.querySelector<SVGGElement>('g.chart-overlay') ?? null,
    );
  }, []);
  const open = anchors.find((a) => a.id === openId) ?? null;

  // While open: follow the viewport, and close on Esc, a tap elsewhere, scroll or resize.
  useLayoutEffect(() => {
    if (!open) return;
    const el = popoverRef.current!;
    const svg = groupRef.current!.ownerSVGElement!;
    const ax = anchorX(open, cfg);
    const button = groupRef.current!.querySelector<SVGGElement>(`[data-anchor="${open.id}"]`);
    const close = (refocus: boolean) => {
      if (refocus) button?.focus();
      setOpenId(null);
    };
    let width = el.offsetWidth;
    const place = (v: Viewport) => {
      const rect = svg.getBoundingClientRect();
      const sx = v.k * ax + v.x;
      el.style.left = `${popoverLeft(sx, width, { left: rect.left, width: rect.width || v.width })}px`;
      el.style.top = `${rect.top + HANDLE_PX + POPOVER_MARGIN_PX}px`;
      el.hidden = sx < 0 || sx > v.width;
    };
    const v = viewport.get() ?? committed;
    if (v) {
      place(v);
      width = el.offsetWidth;
      place(v);
    }
    const unsubscribe = viewport.subscribe(place);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (el.contains(target)) return;
      // A press on this anchor's own button or handle toggles it through onClick instead.
      if (button?.contains(target)) return;
      if ((target as Element).closest?.(`[data-anchor-handle="${open.id}"]`)) return;
      close(false);
    };
    const onMove = () => close(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      unsubscribe();
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, cfg, viewport, committed]);

  if (anchors.length === 0) return <g ref={groupRef} className="chart-anchors" />;

  const toggle = (id: string) => setOpenId(openId === id ? null : id);
  const onClick = (e: MouseEvent, id: string) => {
    // Not a selection: keep Chart's tap handler from clearing the current one.
    e.stopPropagation();
    toggle(id);
  };
  const onKeyDown = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };

  return (
    <g ref={groupRef} className="chart-anchors">
      {anchors.map((a) => {
        const ax = anchorX(a, cfg);
        const isOpen = a.id === openId;
        return (
          <g
            key={a.id}
            className="anchor"
            data-anchor={a.id}
            data-year={a.date.start}
            role="button"
            tabIndex={0}
            aria-label={anchorTitle(a, t)}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            aria-controls={isOpen ? popoverId : undefined}
            onClick={(e) => onClick(e, a.id)}
            onKeyDown={(e) => onKeyDown(e, a.id)}
          >
            <line
              className="anchor-line"
              x1={ax}
              x2={ax}
              y1={LINE_TOP_PX}
              y2={height}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="anchor-hit"
              x1={ax}
              x2={ax}
              y1={LINE_TOP_PX}
              y2={height}
              strokeWidth={touchTarget}
              vectorEffect="non-scaling-stroke"
            />
            {overlay &&
              createPortal(
                // Clicks on the handle bubble (through React) to this button's onClick.
                <line
                  className="anchor-hit anchor-handle"
                  data-anchor-handle={a.id}
                  // A press must not move focus to the overlay group (it would get a focus ring).
                  onMouseDown={(e) => e.preventDefault()}
                  x1={ax}
                  x2={ax}
                  y1={0}
                  y2={HANDLE_PX}
                  strokeWidth={touchTarget}
                  vectorEffect="non-scaling-stroke"
                />,
                overlay,
              )}
          </g>
        );
      })}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            className="anchor-popover"
            role="dialog"
            aria-label={anchorTitle(open, t)}
            data-anchor={open.id}
          >
            <p className="anchor-popover-title">{anchorTitle(open, t)}</p>
            <p className="anchor-popover-confidence">{anchorConfidence(open, t)}</p>
          </div>,
          document.body,
        )}
    </g>
  );
}
