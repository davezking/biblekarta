// Design tokens: the single source for every colour, size and timing the site uses.
// src/styles/tokens.css mirrors cssVariables() below; tokens.test.ts keeps the two in step.
// Colours come from the PRD (DR-3, DR-5, DR-6) and the approved mockups in design-reference/.
// Never change a PRD colour to pass a contrast test: change which ink the label uses instead.

/** Inks (DR-3). brown and axis are the mockup's secondary inks for reign years and Arabic numerals. */
export const ink = {
  black: '#1E1712',
  red: '#8A1A12',
  brown: '#3A2A1A',
  axis: '#4A3A28',
} as const;

/** Harag ornament (DR-5). */
export const harag = {
  red: '#A52119',
  green: '#3F6B3A',
  yellow: '#E2B54F',
} as const;

/** Vellum surface (DR-1): the base tone plus the aging gradients of board5-desktop.html. */
export const vellum = {
  base: '#E9D8B4',
  highlight: 'rgba(255, 248, 228, 0.7)',
  stain: 'rgba(150, 105, 45, 0.18)',
  shade: 'rgba(120, 80, 35, 0.22)',
  wash: 'rgba(170, 130, 70, 0.1)',
  edge: 'rgba(110, 70, 30, 0.35)',
} as const;

/** Stream pigments (DR-6), keyed by stream id. */
export const pigment = {
  united: '#9DB28A',
  israel: '#E2B54F',
  judah: '#DE9479',
  ethiopia: '#8FB0C4',
  egypt: '#DCC08A',
  assyria: '#93A487',
  aram: '#B7B9C9',
  sidon: '#D9C39A',
  prophets: '#D8DFC0',
  prophetsDark: '#B4C795',
} as const;
export type PigmentKey = keyof typeof pigment;

/** Figure colours, from design-reference/figure.html (DR-9). */
export const figure = {
  tones: ['#C99A3B', '#8E2B1F', '#3E6B4C', '#6B5E52'],
  parts: {
    ground: '#F3E6C8',
    outline: '#1E1712',
    halo: '#E2B54F',
    hood: '#E9E1CF',
    hoodLine: '#BFB39B',
    veil: '#3D2F22',
    collar: '#E2B44A',
    neck: '#6E4127',
    hair: '#21140C',
    face: '#7A4B2E',
    eyeWhite: '#FFFFFF',
    pupil: '#1A0F08',
    nose: '#4E2E1B',
    beard: '#21140C',
    prophetBeard: '#D6CDBB',
    crown: '#D9A93A',
    crownLine: '#8A6418',
    jewel: '#8E2B1F',
  },
} as const;

/** Spacing scale in px, from the mockup's gaps and paddings. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 9, lg: 12, pill: 22 } as const;

/** Stroke widths in px: hairlines (grid, dividers), ink outlines (streams, controls). */
export const line = { hairline: 1, outline: 1.5, strong: 2 } as const;

export const fontSize = { xs: 13, sm: 14, md: 18, lg: 20, title: 44 } as const;

/** Stacking order of the chart page's layers. */
export const z = { chart: 0, toolbar: 10, panel: 20, sheet: 30, tooltip: 40 } as const;

/** Motion durations in ms. CSS sets them all to 0 under prefers-reduced-motion. */
export const motion = { fast: 120, base: 200, slow: 320 } as const;

export const breakpoint = { desktop: 1024 } as const;

/** Minimum touch target, px. */
export const touchTarget = 44;

/** WCAG AA for normal text (DR-13). */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Ink for each stream's name. Stream names are red (DR-3) where red meets 4.5:1 on the fill;
 * otherwise black. Red measures 4.10 on United, 3.85 on Judah and 3.53 on Assyria. Ethiopia's
 * name is already black in board5-desktop.html (red would be 4.10).
 */
export const streamNameInk: Record<PigmentKey, keyof typeof ink> = {
  prophets: 'red',
  prophetsDark: 'red',
  sidon: 'red',
  united: 'black',
  israel: 'red',
  judah: 'black',
  ethiopia: 'black',
  aram: 'red',
  egypt: 'red',
  assyria: 'black',
};

export interface TextOnFill {
  text: string;
  fill: string;
  use: string;
}

const onPigments = (color: string, use: string): TextOnFill[] =>
  Object.values(pigment).map((fill) => ({ text: color, fill, use }));

/** Every text colour × background pair the design uses; each must meet MIN_TEXT_CONTRAST. */
export const TEXT_ON_FILL: TextOnFill[] = [
  { text: ink.black, fill: vellum.base, use: 'body and UI text on vellum' },
  { text: ink.red, fill: vellum.base, use: 'titles, captions, half-century numerals on vellum' },
  { text: ink.axis, fill: vellum.base, use: 'Arabic axis numerals' },
  { text: ink.black, fill: harag.yellow, use: 'text over the harag ground' },
  ...onPigments(ink.black, 'names and labels on stream fills'),
  ...onPigments(ink.brown, 'reign years on stream fills'),
  ...Object.entries(streamNameInk).map(([key, inkKey]) => ({
    text: ink[inkKey],
    fill: pigment[key as PigmentKey],
    use: `stream name on ${key}`,
  })),
];

/**
 * Smallest CIELAB L* difference we accept between stream fills that must be told apart (DR-13:
 * "differ in lightness, not only hue"). WCAG has no number for this; 5 is a chosen working value,
 * roughly where a lightness step is still visible in greyscale.
 */
export const MIN_LIGHTNESS_DELTA = 5;

/** Neighbouring stream pairs that must be told apart: the forks, then each lane and the next. */
export const LIGHTNESS_PAIRS: [PigmentKey, PigmentKey][] = [
  ['israel', 'judah'],
  ['united', 'israel'],
  ['united', 'judah'],
  ['prophets', 'sidon'],
  ['sidon', 'israel'],
  ['judah', 'ethiopia'],
  ['ethiopia', 'aram'],
  ['aram', 'egypt'],
  ['egypt', 'assyria'],
];

/**
 * Pairs whose PRD colours (DR-6) fall below MIN_LIGHTNESS_DELTA, with their measured ΔL*.
 * The colours can't change here; the black ink outlines separate them. Pending a design decision
 * by the owner and the church reviewer (P2-S1-T1 PR).
 */
export const LIGHTNESS_EXCEPTIONS: Partial<Record<string, number>> = {
  'united/judah': 2.0,
  'sidon/israel': 3.7,
  'judah/ethiopia': 2.0,
  'aram/egypt': 3.5,
};

/** The CSS custom properties tokens.css must define, name → value. */
export function cssVariables(): Record<string, string> {
  const vars: Record<string, string> = {
    '--ink': ink.black,
    '--ink-red': ink.red,
    '--ink-brown': ink.brown,
    '--ink-axis': ink.axis,
    '--harag-red': harag.red,
    '--harag-green': harag.green,
    '--harag-yellow': harag.yellow,
    '--vellum': vellum.base,
    '--vellum-highlight': vellum.highlight,
    '--vellum-stain': vellum.stain,
    '--vellum-shade': vellum.shade,
    '--vellum-wash': vellum.wash,
    '--vellum-edge': vellum.edge,
    '--touch-target': `${touchTarget}px`,
  };
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [k, v] of Object.entries(pigment)) vars[`--pigment-${kebab(k)}`] = v;
  figure.tones.forEach((v, i) => (vars[`--fig-tone-${i + 1}`] = v));
  for (const [k, v] of Object.entries(figure.parts)) vars[`--fig-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(space)) vars[`--space-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(radius)) vars[`--radius-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(line)) vars[`--line-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(fontSize)) vars[`--font-size-${k}`] = `${v}px`;
  for (const [k, v] of Object.entries(z)) vars[`--z-${k}`] = String(v);
  for (const [k, v] of Object.entries(motion)) vars[`--motion-${k}`] = `${v}ms`;
  return vars;
}
