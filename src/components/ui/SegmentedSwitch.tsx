// SegmentedSwitch: one choice out of two or more, with radio-group semantics. Only the checked
// option is in the tab order (roving tabindex); the arrow keys move to the next or previous option
// and select it (wrapping around), and Home/End go to the first/last.
import { useRef, type KeyboardEvent } from 'react';
import './ui.css';

export interface SwitchOption<V extends string> {
  value: V;
  label: string;
  /** Set when the label is Amharic inside an English UI (or the reverse). */
  lang?: string;
}

export interface SegmentedSwitchProps<V extends string> {
  /** The group's accessible name. */
  label: string;
  options: readonly SwitchOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

const PREV = ['ArrowLeft', 'ArrowUp'];
const NEXT = ['ArrowRight', 'ArrowDown'];

export default function SegmentedSwitch<V extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedSwitchProps<V>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = options.length;
    let to: number;
    if (PREV.includes(e.key)) to = (current - 1 + n) % n;
    else if (NEXT.includes(e.key)) to = (current + 1) % n;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    else return;
    e.preventDefault();
    if (to !== current) onChange(options[to]!.value);
    buttons.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={className ? `ui-switch ${className}` : 'ui-switch'}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          lang={o.lang}
          data-value={o.value}
          className="ui-switch-option"
          onClick={() => {
            if (o.value !== value) onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
