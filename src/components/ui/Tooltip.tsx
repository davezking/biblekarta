// Tooltip: a short text for its trigger, shown on mouse hover, on keyboard focus, or after a
// long-press on touch. Esc hides it. The bubble is always in the DOM (hidden while not shown) and
// the wrapper points the trigger's description at it, so a screen reader reads it on focus.
// The trigger (the child) brings its own ≥ 44 px hit area; the bubble takes no pointer events.
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import './ui.css';

export const LONG_PRESS_MS = 500;

export interface TooltipProps {
  content: string;
  /** The trigger: one focusable element. It gets `aria-describedby` pointing at the bubble. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  lang?: string;
}

export default function Tooltip({ content, children, lang }: TooltipProps) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Set when a long-press opened it, so the following click/contextmenu is swallowed. */
  const longPressed = useRef(false);

  const cancelPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
  };

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShown(false);
    };
    // A touch-opened tooltip stays until the next press elsewhere.
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setShown(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [shown]);

  useEffect(() => cancelPress, []);

  const trigger = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': [children.props['aria-describedby'], id].filter(Boolean).join(' '),
      })
    : children;

  return (
    <span
      ref={wrapRef}
      className="ui-tooltip"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setShown(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setShown(false);
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return;
        longPressed.current = false;
        cancelPress();
        pressTimer.current = setTimeout(() => {
          longPressed.current = true;
          setShown(true);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(e) => {
        if (!longPressed.current) return;
        longPressed.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      onContextMenu={(e) => {
        if (longPressed.current || pressTimer.current) e.preventDefault();
      }}
      onFocus={() => setShown(true)}
      onBlur={() => setShown(false)}
    >
      {trigger}
      <span id={id} role="tooltip" className="ui-tooltip-bubble" lang={lang} hidden={!shown}>
        {content}
      </span>
    </span>
  );
}
