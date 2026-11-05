// Panel: where an item's details open (DR-11, DR-12).
// - ≥ 1024 px: a side panel on the right. It isn't modal, so the chart behind stays usable.
//   It starts below `--panel-inset-top` (set by the page) so it doesn't cover the chart's toolbar.
// - < 1024 px: a bottom sheet with a drag handle and two snap points, half and full height.
//   Dragging the handle moves it; a swipe down from half height closes it. At full height it is
//   modal and traps focus.
// Both are role="dialog", labelled by the title. Esc or the close button closes it. Focus moves
// into the panel when it opens and returns to the element that opened it when it closes.
// Animations use the motion tokens; panel.css switches them off under prefers-reduced-motion.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createT, type T } from '../../lib/i18n';
import IconButton from '../ui/IconButton';
import './panel.css';

export const DESKTOP_QUERY = '(min-width: 1024px)';

export type Snap = 'half' | 'full';

export interface PanelProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Language of the title (stream and person names are Amharic). */
  lang?: string;
  t?: T;
}

const defaultT = createT('am');

/** Gap kept above the sheet at full height, in px (matches --space-xl in panel.css). */
export const SHEET_TOP_GAP = 24;
/** How far below the half snap point a drag must end to close the sheet, in px. */
export const CLOSE_DISTANCE = 80;
/** Drags shorter than this count as a tap on the handle, in px. */
export const TAP_SLOP = 6;

/** The sheet's offset (translateY, px) at a snap point. The sheet is `viewport − gap` tall. */
export function snapOffset(snap: Snap, viewportHeight: number): number {
  return snap === 'full' ? 0 : Math.max(0, viewportHeight - SHEET_TOP_GAP - viewportHeight / 2);
}

/** Where the sheet goes when a drag of `dy` px (down is positive) from `from` ends. */
export function snapAfterDrag(from: Snap, dy: number, viewportHeight: number): Snap | 'close' {
  const half = snapOffset('half', viewportHeight);
  const pos = snapOffset(from, viewportHeight) + dy;
  if (pos > half + CLOSE_DISTANCE) return 'close';
  return pos < half / 2 ? 'full' : 'half';
}

function subscribeMedia(cb: () => void) {
  if (typeof matchMedia !== 'function') return () => {};
  const mql = matchMedia(DESKTOP_QUERY);
  mql.addEventListener?.('change', cb);
  return () => mql.removeEventListener?.('change', cb);
}
const isDesktop = () => typeof matchMedia === 'function' && matchMedia(DESKTOP_QUERY).matches;

/** True at ≥ 1024 px (side panel), false below (bottom sheet). Server render: desktop. */
export function useDesktop(): boolean {
  return useSyncExternalStore(subscribeMedia, isDesktop, () => true);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Panel({ open, onClose, title, children, lang, t = defaultT }: PanelProps) {
  const desktop = useDesktop();
  const [snap, setSnap] = useState<Snap>('half');
  // Each opening starts at half height (state adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSnap('half');
  }
  const dialogRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const drag = useRef<{ id: number; y0: number; dy: number } | null>(null);
  const dragged = useRef(false);

  // On open: remember the opener and move focus in.
  // On close (or unmount while open): give focus back to the opener.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
    dialogRef.current?.focus();
    return () => {
      const el = opener.current;
      opener.current = null;
      if (el?.isConnected) el.focus();
    };
  }, [open]);

  // Keep focus inside while the panel's container changes (side panel ↔ sheet on resize).
  useEffect(() => {
    if (open && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
  }, [open, desktop]);

  if (!open) return null;

  const modal = !desktop && snap === 'full';
  const viewportHeight = () => window.innerHeight;

  const setOffset = (px: number | null) => {
    const el = dialogRef.current;
    if (!el) return;
    if (px === null) {
      el.style.removeProperty('transform');
      el.removeAttribute('data-dragging');
    } else {
      el.style.transform = `translateY(${px}px)`;
      el.setAttribute('data-dragging', '');
    }
  };

  const onHandleDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0 };
    dragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.dy = e.clientY - d.y0;
    if (Math.abs(d.dy) > TAP_SLOP) dragged.current = true;
    if (dragged.current) setOffset(Math.max(0, snapOffset(snap, viewportHeight()) + d.dy));
  };
  const onHandleUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    setOffset(null);
    if (!dragged.current) return; // a tap: the click handler toggles
    const next = snapAfterDrag(snap, d.dy, viewportHeight());
    if (next === 'close') onClose();
    else setSnap(next);
  };
  const onHandleCancel = () => {
    drag.current = null;
    setOffset(null);
  };
  const onHandleClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setSnap((s) => (s === 'half' ? 'full' : 'half'));
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSnap('full');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (snap === 'full') setSnap('half');
      else onClose();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !modal) return;
    const items = [...dialogRef.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {modal && <div className="panel-backdrop" aria-hidden="true" onClick={onClose} />}
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby={titleId}
        aria-modal={modal ? true : undefined}
        tabIndex={-1}
        className={desktop ? 'panel panel-side' : 'panel panel-sheet'}
        data-layout={desktop ? 'side' : 'sheet'}
        data-snap={desktop ? undefined : snap}
        onKeyDown={onKeyDown}
      >
        {!desktop && (
          <button
            type="button"
            className="panel-handle"
            aria-label={t('panel.handle')}
            aria-expanded={snap === 'full'}
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleCancel}
            onClick={onHandleClick}
            onKeyDown={onHandleKey}
          >
            <span className="panel-handle-bar" aria-hidden="true" />
          </button>
        )}
        <header className="panel-header">
          <h2 id={titleId} className="panel-title" lang={lang}>
            {title}
          </h2>
          <IconButton
            label={t('ui.close')}
            variant="bare"
            className="panel-close"
            onClick={onClose}
          >
            ×
          </IconButton>
        </header>
        <div className="panel-body">{children}</div>
      </div>
    </>
  );
}
