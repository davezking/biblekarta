// CheckboxMenu: a button that opens a popover of checkboxes (e.g. the lane toggles). It follows
// the disclosure pattern (aria-expanded / aria-controls on the button, a labelled group of native
// checkboxes) rather than role="menu", so Tab and Space work as they do everywhere else.
// Opening moves focus to the first checkbox; Esc closes it and returns focus to the button (and
// goes no further, so a panel around the menu stays open); a press outside, or focus leaving the
// menu, closes it.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createT, type T } from '../../lib/i18n';
import './ui.css';

export interface CheckboxMenuItem {
  id: string;
  label: string;
  checked: boolean;
  /** e.g. "am" for a stream name inside an English UI. */
  lang?: string;
}

export interface CheckboxMenuProps {
  /** The button's text, also the popover's accessible name. Defaults to `ui.open_menu`. */
  label?: string;
  items: readonly CheckboxMenuItem[];
  onToggle: (id: string, checked: boolean) => void;
  /** Extra content under the checkboxes (e.g. a "show all" button). */
  footer?: ReactNode;
  t?: T;
  className?: string;
}

const defaultT = createT('am');

export default function CheckboxMenu({
  label,
  items,
  onToggle,
  footer,
  t = defaultT,
  className,
}: CheckboxMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const name = label ?? t('ui.open_menu');

  useEffect(() => {
    if (!open) return;
    popoverRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    // Esc with focus outside the menu (e.g. after a click on the page) still closes it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={className ? `ui-menu ${className}` : 'ui-menu'}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (open && to && !wrapRef.current?.contains(to)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="ui-button"
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        {name}
      </button>
      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="group"
          aria-label={name}
          className="ui-menu-popover"
        >
          {items.map((item) => (
            <label key={item.id} className="ui-menu-row" lang={item.lang}>
              <input
                type="checkbox"
                data-id={item.id}
                checked={item.checked}
                onChange={(e) => onToggle(item.id, e.currentTarget.checked)}
              />
              {item.label}
            </label>
          ))}
          {footer}
        </div>
      )}
    </div>
  );
}
