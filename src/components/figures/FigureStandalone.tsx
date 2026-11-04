// FigureStandalone: the same figure as Figure, drawn inline with no sprite, for static pages and
// for panels opened outside the chart. Same props, same paths (./parts.ts).
import { toneStyle, type FigureProps } from './Figure';
import FigureParts from './FigureParts';
import { symbolKind, VIEWBOX } from './parts';

export default function FigureStandalone({ kind, tone, size, className }: FigureProps) {
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
      <FigureParts kind={sym} />
    </svg>
  );
}
