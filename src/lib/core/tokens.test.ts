import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, lightness } from './contrast';
import {
  LIGHTNESS_EXCEPTIONS,
  LIGHTNESS_PAIRS,
  MIN_LIGHTNESS_DELTA,
  MIN_TEXT_CONTRAST,
  TEXT_ON_FILL,
  cssVariables,
  figure,
  harag,
  ink,
  pigment,
  streamNameInk,
  vellum,
} from './tokens';

describe('PRD colours are pinned', () => {
  it('inks (DR-3), harag (DR-5) and vellum', () => {
    expect(ink.black).toBe('#1E1712');
    expect(ink.red).toBe('#8A1A12');
    expect(harag).toEqual({ red: '#A52119', green: '#3F6B3A', yellow: '#E2B54F' });
    expect(vellum.base).toBe('#E9D8B4');
  });

  it('stream pigments (DR-6)', () => {
    expect(pigment).toEqual({
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
    });
  });

  it('figure tones (design-reference/figure.html)', () => {
    expect(figure.tones).toEqual(['#C99A3B', '#8E2B1F', '#3E6B4C', '#6B5E52']);
  });

  it('has a pigment for every seed stream', () => {
    for (const id of [
      'prophets',
      'sidon',
      'israel',
      'united',
      'judah',
      'ethiopia',
      'aram',
      'egypt',
      'assyria',
    ]) {
      expect(pigment).toHaveProperty(id);
    }
  });
});

describe('text contrast (DR-13)', () => {
  it.each(TEXT_ON_FILL.map((p) => [p.use, p.text, p.fill] as const))(
    '%s: %s on %s ≥ 4.5:1',
    (_use, text, fill) => {
      expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    },
  );

  it('uses red stream names wherever red passes, black only where it fails', () => {
    for (const [key, inkKey] of Object.entries(streamNameInk)) {
      const redPasses =
        contrastRatio(ink.red, pigment[key as keyof typeof pigment]) >= MIN_TEXT_CONTRAST;
      expect(inkKey, key).toBe(redPasses ? 'red' : 'black');
    }
  });
});

describe('stream lightness (DR-13)', () => {
  it.each(LIGHTNESS_PAIRS)('%s vs %s differ in lightness, or are a recorded exception', (a, b) => {
    const delta = Math.abs(lightness(pigment[a]) - lightness(pigment[b]));
    const exception = LIGHTNESS_EXCEPTIONS[`${a}/${b}`];
    if (exception === undefined) {
      expect(delta).toBeGreaterThanOrEqual(MIN_LIGHTNESS_DELTA);
    } else {
      // A recorded exception must still be below the threshold, with the measured value.
      expect(delta).toBeLessThan(MIN_LIGHTNESS_DELTA);
      expect(delta).toBeCloseTo(exception, 1);
    }
  });

  it('lists no exception for a pair it does not check', () => {
    const checked = new Set(LIGHTNESS_PAIRS.map(([a, b]) => `${a}/${b}`));
    for (const key of Object.keys(LIGHTNESS_EXCEPTIONS)) expect(checked).toContain(key);
  });
});

describe('tokens.css mirrors tokens.ts', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const declared = Object.fromEntries(
    [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );

  // CSS colours are case-insensitive, and Prettier lowercases hex in CSS.
  it('defines every variable with the same value', () => {
    for (const [name, value] of Object.entries(cssVariables())) {
      expect(declared[name]?.toLowerCase(), name).toBe(value.toLowerCase());
    }
  });

  it('defines nothing that tokens.ts does not', () => {
    expect(Object.keys(declared).sort()).toEqual(Object.keys(cssVariables()).sort());
  });
});
