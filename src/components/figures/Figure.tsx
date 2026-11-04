// Figure: one decorative figure (DR-9, DR-10), drawn from the sprite with <use>. It carries no
// text (names are always shown as text beside it) and is hidden from assistive technology.
// Needs FigureSprite mounted once on the page; where it is not, use FigureStandalone.
import type { CSSProperties } from 'react';
import type { Person } from '../../lib/core/schema';
import { DEFAULT_TONE, symbolId, symbolKind, VIEWBOX } from './parts';

export interface FigureProps {
  kind: Person['figure_kind'];
  /** The robe and ring colour; one of tokens.figure.tones. Defaults to the first tone. */
  tone?: string;
  /** Width and height in px. */
  size: number;
  className?: string;
}

/** The root style that sets the tone for the symbol's `var(--fig-tone)`. */
export const toneStyle = (tone: string | undefined) =>
  ({ '--fig-tone': tone ?? DEFAULT_TONE }) as CSSProperties;

export default function Figure({ kind, tone, size, className }: FigureProps) {
  const sym = symbolKind(kind);
  return (
    <svg
      className={className ? `figure ${className}` : 'figure'}
      data-kind={sym}
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox={VIEWBOX}
      style={toneStyle(tone)}
    >
      <use href={`#${symbolId(sym)}`} width="64" height="64" />
    </svg>
  );
}
