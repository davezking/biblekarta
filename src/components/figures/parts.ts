// The figure drawing (DR-9), copied exactly from design-reference/figure.html: a 64×64 viewBox,
// with parts switched on by kind. Both FigureSprite (one <symbol> per kind) and FigureStandalone
// (inline SVG) render from this list, so the two always draw the same paths.
//
// Colours are the figure tokens (tokens.figure.parts, the same hex values as figure.html). The
// tone (the ring and the robe) is `var(--fig-tone)`, set on each figure's root, so one symbol
// serves every tone.
import { figure } from '../../lib/core/tokens';
import type { Person } from '../../lib/core/schema';

const p = figure.parts;

/** The kinds that have a drawing of their own. */
export type DrawnKind = 'king' | 'queen' | 'prophet';
/** A symbol in the sprite: the drawn kinds, plus the neutral base. */
export type SymbolKind = DrawnKind | 'base';

export const TONE = 'var(--fig-tone)';
export const VIEWBOX = '0 0 64 64';
export const DEFAULT_TONE: string = figure.tones[0];

export type PartTag = 'circle' | 'ellipse' | 'path' | 'rect';
export interface Part {
  /** A name for the part, for tests and readers; not rendered. */
  name: string;
  tag: PartTag;
  attrs: Record<string, string>;
  /** The kinds that show this part; absent = every kind, including the base. */
  kinds?: readonly DrawnKind[];
}

/** The parts in figure.html's paint order. */
export const PARTS: readonly Part[] = [
  {
    name: 'ground',
    tag: 'circle',
    attrs: { cx: '32', cy: '32', r: '30.5', fill: p.ground, stroke: TONE, 'stroke-width': '3' },
  },
  {
    name: 'halo',
    tag: 'circle',
    attrs: {
      cx: '32',
      cy: '24',
      r: '17.5',
      fill: p.halo,
      stroke: p.outline,
      'stroke-width': '1.3',
    },
    kinds: ['prophet'],
  },
  {
    name: 'hood',
    tag: 'path',
    attrs: {
      d: 'M20 33 C17 15 47 15 44 33 L47 47 L17 47 Z',
      fill: p.hood,
      stroke: p.hoodLine,
      'stroke-width': '1',
    },
    kinds: ['prophet'],
  },
  {
    name: 'veil',
    tag: 'path',
    attrs: { d: 'M20 31 C18 14 46 14 44 31 L48 50 L16 50 Z', fill: p.veil },
    kinds: ['queen'],
  },
  {
    name: 'robe',
    tag: 'path',
    attrs: {
      d: 'M11 58 C13 45 21 41 32 41 C43 41 51 45 53 58 C47 62 40 63.5 32 63.5 C24 63.5 17 62 11 58 Z',
      fill: TONE,
      stroke: p.outline,
      'stroke-width': '1.3',
    },
  },
  {
    name: 'collar',
    tag: 'path',
    attrs: {
      d: 'M24 45 L28 49 L32 45 L36 49 L40 45',
      fill: 'none',
      stroke: p.collar,
      'stroke-width': '1.6',
      'stroke-linejoin': 'round',
    },
  },
  {
    name: 'neck',
    tag: 'rect',
    attrs: { x: '28.5', y: '35', width: '7', height: '7', fill: p.neck },
  },
  {
    name: 'hair',
    tag: 'path',
    attrs: { d: 'M21.5 22 C22 13 42 13 42.5 22 L42 26 L22 26 Z', fill: p.hair },
    kinds: ['king'],
  },
  {
    name: 'face',
    tag: 'ellipse',
    attrs: {
      cx: '32',
      cy: '27',
      rx: '10',
      ry: '12',
      fill: p.face,
      stroke: p.outline,
      'stroke-width': '1.2',
    },
  },
  {
    name: 'beard',
    tag: 'path',
    attrs: {
      d: 'M22.6 31 C23 40 28 43 32 43 C36 43 41 40 41.4 31 C38 34 35 35 32 35 C29 35 26 34 22.6 31 Z',
      fill: p.beard,
    },
    kinds: ['king'],
  },
  {
    name: 'beard-light',
    tag: 'path',
    attrs: {
      d: 'M22.6 31 C23 40 28 43 32 43 C36 43 41 40 41.4 31 C38 34 35 35 32 35 C29 35 26 34 22.6 31 Z',
      fill: p.prophetBeard,
    },
    kinds: ['prophet'],
  },
  {
    name: 'eye-white-left',
    tag: 'ellipse',
    attrs: { cx: '27.6', cy: '26', rx: '3.4', ry: '2.1', fill: p.eyeWhite },
  },
  {
    name: 'eye-white-right',
    tag: 'ellipse',
    attrs: { cx: '36.4', cy: '26', rx: '3.4', ry: '2.1', fill: p.eyeWhite },
  },
  { name: 'pupil-left', tag: 'circle', attrs: { cx: '27.8', cy: '26', r: '1.5', fill: p.pupil } },
  { name: 'pupil-right', tag: 'circle', attrs: { cx: '36.2', cy: '26', r: '1.5', fill: p.pupil } },
  {
    name: 'brows',
    tag: 'path',
    attrs: {
      d: 'M24 22.6 C25.5 21.6 29 21.6 30.5 22.6 M33.5 22.6 C35 21.6 38.5 21.6 40 22.6',
      fill: 'none',
      stroke: p.pupil,
      'stroke-width': '1.1',
      'stroke-linecap': 'round',
    },
  },
  {
    name: 'nose',
    tag: 'path',
    attrs: {
      d: 'M32 27 L31 31.5 L33 31.5',
      fill: 'none',
      stroke: p.nose,
      'stroke-width': '0.9',
      'stroke-linecap': 'round',
    },
  },
  {
    name: 'crown',
    tag: 'path',
    attrs: {
      d: 'M21 16 L23.5 7.5 L27.5 12.5 L32 5 L36.5 12.5 L40.5 7.5 L43 16 Z',
      fill: p.crown,
      stroke: p.crownLine,
      'stroke-width': '1',
      'stroke-linejoin': 'round',
    },
    kinds: ['king', 'queen'],
  },
  {
    name: 'jewel',
    tag: 'circle',
    attrs: { cx: '32', cy: '12.5', r: '1.4', fill: p.jewel },
    kinds: ['king', 'queen'],
  },
];

/** The parts drawn for one symbol, in paint order. The base shows only the shared parts. */
export function partsFor(kind: SymbolKind): Part[] {
  return PARTS.filter((part) => (part.kinds ? kind !== 'base' && part.kinds.includes(kind) : true));
}

/**
 * The symbol a person's figure_kind uses. Christ and apostle figures need the church reviewer's
 * approval before they are drawn, so they (and `other`) use the neutral base for now.
 */
export function symbolKind(kind: Person['figure_kind']): SymbolKind {
  // TODO(P5-S1-T2): draw christ and apostle once the church reviewer has approved them.
  return kind === 'king' || kind === 'queen' || kind === 'prophet' ? kind : 'base';
}

export const symbolId = (kind: SymbolKind) => `fig-${kind}`;
export const SYMBOL_KINDS: readonly SymbolKind[] = ['king', 'queen', 'prophet', 'base'];

const CAMEL: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-linecap': 'strokeLinecap',
};
/** SVG attribute names → React prop names. */
export function reactProps(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) out[CAMEL[k] ?? k] = v;
  return out;
}
