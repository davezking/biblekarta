// Disclosure: a button that shows or hides a region (e.g. "እንዴት ታወቀ?" in the detail panel).
// The button has aria-expanded and aria-controls; the region is `hidden` while closed.
// Controlled (`open` + `onOpenChange`) or uncontrolled (`defaultOpen`).
import { useId, useState, type ReactNode } from 'react';
import './ui.css';

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export default function Disclosure({
  summary,
  children,
  open,
  defaultOpen = false,
  onOpenChange,
  className,
}: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const regionId = useId();

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setInner(next);
    onOpenChange?.(next);
  };

  return (
    <div className={className ? `ui-disclosure ${className}` : 'ui-disclosure'}>
      <button
        type="button"
        className="ui-disclosure-summary"
        aria-expanded={isOpen}
        aria-controls={regionId}
        onClick={toggle}
      >
        <span className="ui-disclosure-marker" aria-hidden="true">
          ›
        </span>
        <span>{summary}</span>
      </button>
      <div id={regionId} className="ui-disclosure-body" hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
