// HaragBand: the interlaced harag ornament (DR-5) that frames the page title and the top and bottom
// of the chart. The geometry is ported from the approved mockup, design-reference/board5-desktop.html
// (patterns hg1…hg4): a 44 px tile with a red and a green strand crossing on a yellow ground, each
// strand drawn over a wider black outline, with black knots where they cross. The mockup's 16 px
// bands (hg3 and hg4) are the same drawing.
//
// Pure markup, no behaviour: it renders server-side in Astro without hydration, and inside the chart
// island. Each instance gets its own pattern id (useId), so several bands on one page don't collide.
import { useId } from 'react';
import { harag, ink } from '../../lib/core/tokens';

export type HaragHeight = 16 | 18 | 26;

/** The tile width of every band, in px (the mockup's pattern width). */
export const HARAG_TILE_PX = 44;

export interface HaragGeometry {
  /** The two strands, each drawn first in black at `outline`, then in its colour at `strand`. */
  strands: { d: string; color: string }[];
  outline: number;
  strand: number;
  knots: { cx: number; cy: string }[];
  knotR: number;
}

/** The mockup's pattern for a band of height `h`: the strands swing between y = 1 and y = h − 1. */
export function haragGeometry(h: HaragHeight): HaragGeometry {
  const w = HARAG_TILE_PX;
  const mid = (h / 2).toFixed(1);
  const lo = 1;
  const hi = h - 1;
  const curve = (a: number, b: number) =>
    `M0,${mid} C${w / 4},${a} ${(3 * w) / 4},${b} ${w},${mid}`;
  return {
    strands: [
      { d: curve(lo, hi), color: harag.red },
      { d: curve(hi, lo), color: harag.green },
    ],
    outline: 7,
    strand: 3.6,
    // The mockup's order: the crossing first, then the tile's two ends.
    knots: [w / 2, 0, w].map((cx) => ({ cx, cy: mid })),
    knotR: 2.6,
  };
}

/** A pattern id that is safe inside `url(#…)` (React's ids may contain colons or guillemets). */
const safeId = (id: string) => `harag-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;

export interface HaragBandProps {
  height: HaragHeight;
  className?: string;
}

export default function HaragBand({ height, className }: HaragBandProps) {
  const id = safeId(useId());
  const g = haragGeometry(height);
  return (
    <svg
      className={className ? `harag-band ${className}` : 'harag-band'}
      width="100%"
      height={height}
      aria-hidden="true"
      focusable="false"
      data-harag={height}
      style={{ display: 'block' }}
    >
      <defs>
        <pattern id={id} width={HARAG_TILE_PX} height={height} patternUnits="userSpaceOnUse">
          <rect width={HARAG_TILE_PX} height={height} fill={harag.yellow} />
          {g.strands.map((s) => [
            <path
              key={`${s.color}-o`}
              d={s.d}
              fill="none"
              stroke={ink.black}
              strokeWidth={g.outline}
            />,
            <path key={s.color} d={s.d} fill="none" stroke={s.color} strokeWidth={g.strand} />,
          ])}
          {g.knots.map((k) => (
            <circle key={k.cx} cx={k.cx} cy={k.cy} r={g.knotR} fill={ink.black} />
          ))}
        </pattern>
      </defs>
      <rect
        x={1}
        y={1}
        width="99.8%"
        height={height - 2}
        fill={`url(#${id})`}
        stroke={ink.black}
        strokeWidth={2}
      />
    </svg>
  );
}
