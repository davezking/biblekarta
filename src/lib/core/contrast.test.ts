import { describe, expect, it } from 'vitest';
import { contrastRatio, lightness, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('accepts lower and upper case', () => {
    expect(relativeLuminance('#8a1a12')).toBe(relativeLuminance('#8A1A12'));
  });

  it('rejects anything but #RRGGBB', () => {
    expect(() => relativeLuminance('#FFF')).toThrow();
    expect(() => relativeLuminance('red')).toThrow();
  });
});

describe('contrastRatio (WCAG reference values)', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
  });

  it('is 1 for a colour on itself', () => {
    expect(contrastRatio('#E9D8B4', '#E9D8B4')).toBe(1);
  });

  it('puts #777777 on white just under 4.5', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#8A1A12', '#E9D8B4')).toBe(contrastRatio('#E9D8B4', '#8A1A12'));
  });
});

describe('lightness (CIELAB L*)', () => {
  it('runs from 0 (black) to 100 (white)', () => {
    expect(lightness('#000000')).toBe(0);
    expect(lightness('#FFFFFF')).toBeCloseTo(100, 6);
  });

  it('gives mid grey about 53.6', () => {
    expect(lightness('#808080')).toBeCloseTo(53.59, 1);
  });

  it('orders by lightness, not hue', () => {
    expect(lightness('#E2B54F')).toBeGreaterThan(lightness('#DE9479'));
  });
});
