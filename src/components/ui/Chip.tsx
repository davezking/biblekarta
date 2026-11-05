// Chip: a small labelled pill (e.g. a date's certainty). Static by default; with `onClick` it is
// a button whose hit area is ≥ 44 px while the pill itself stays small.
import type { ReactNode } from 'react';
import './ui.css';

export type ChipTone = 'neutral' | 'red' | 'green' | 'yellow';

export interface ChipProps {
  children: ReactNode;
  tone?: ChipTone;
  onClick?: () => void;
  /** Accessible name when the visible text isn't enough (interactive chips only). */
  label?: string;
  /** Hover / long-press text for the chip (rendered as `title`). */
  title?: string;
  lang?: string;
  className?: string;
}

export default function Chip({
  children,
  tone = 'neutral',
  onClick,
  label,
  title,
  lang,
  className,
}: ChipProps) {
  const pill = (
    <span
      className={className && !onClick ? `ui-chip ${className}` : 'ui-chip'}
      data-tone={tone}
      lang={onClick ? undefined : lang}
      title={onClick ? undefined : title}
    >
      {children}
    </span>
  );
  if (!onClick) return pill;
  return (
    <button
      type="button"
      className={className ? `ui-chip-button ${className}` : 'ui-chip-button'}
      aria-label={label}
      title={title}
      lang={lang}
      onClick={onClick}
    >
      {pill}
    </button>
  );
}
