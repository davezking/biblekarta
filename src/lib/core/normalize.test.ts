import { describe, expect, it } from 'vitest';
import { LABIALIZED_MAP, normalizeAm, normalizeEn } from './normalize';

describe('normalizeAm', () => {
  it.each([
    ['ሐዋርያት', 'ሀዋርያት'],
    ['ሠራ', 'ሰራ'],
    ['ዐመት', 'አመት'],
    ['ጸሎት', 'ፀሎት'],
    ['ዳዊት፡', 'ዳዊት'],
    ['ዘኍልቍ', 'ዘሁልቁ'],
  ])('%s = %s', (a, b) => {
    expect(normalizeAm(a)).toBe(normalizeAm(b));
  });

  it('folds every order of ሐ and ኀ to ሀ', () => {
    expect(normalizeAm('ሐሑሒሓሔሕሖ')).toBe('ሀሁሂሃሄህሆ');
    expect(normalizeAm('ኀኁኂኃኄኅኆ')).toBe('ሀሁሂሃሄህሆ');
    expect(normalizeAm('ሗ')).toBe('ሇ');
  });

  it('folds the labialized ኀ forms by vowel', () => {
    expect(normalizeAm('ኈ ኊ ኋ ኌ ኍ')).toBe('ሀ ሂ ሃ ሄ ሁ');
  });

  it('folds the ሠ, ዐ and ፀ series', () => {
    expect(normalizeAm('ሠሡሢሣሤሥሦሧ')).toBe('ሰሱሲሳሴስሶሷ');
    expect(normalizeAm('ዐዑዒዓዔዕዖ')).toBe('አኡኢኣኤእኦ');
    expect(normalizeAm('ፀፁፂፃፄፅፆፇ')).toBe('ጸጹጺጻጼጽጾጿ');
  });

  it('applies LABIALIZED_MAP', () => {
    for (const [from, to] of Object.entries(LABIALIZED_MAP)) expect(normalizeAm(from)).toBe(to);
  });

  it('keeps ኸ and ሀ distinct', () => {
    expect(normalizeAm('ኸ')).not.toBe(normalizeAm('ሀ'));
    expect(normalizeAm('ኸ')).toBe('ኸ');
  });

  it('strips Ethiopic and ASCII punctuation and collapses whitespace', () => {
    expect(normalizeAm('  ዳዊት፡ንጉሥ።  ኤልያስ፣ "ሙሴ"?  ')).toBe('ዳዊት ንጉስ ኤልያስ ሙሴ');
    expect(normalizeAm('፤፥፦፧፨')).toBe('');
  });

  it('lowercases Latin text', () => {
    expect(normalizeAm('David ዳዊት')).toBe('david ዳዊት');
  });

  it('is idempotent over 200 Ethiopic strings', () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const extra = [' ', '፡', '።', '፣', '፤', '?', 'A'];
    for (let i = 0; i < 200; i++) {
      let s = '';
      const len = 1 + Math.floor(rand() * 20);
      for (let j = 0; j < len; j++) {
        s +=
          rand() < 0.15
            ? extra[Math.floor(rand() * extra.length)]
            : String.fromCodePoint(0x1200 + Math.floor(rand() * 0x180));
      }
      const once = normalizeAm(s);
      expect(normalizeAm(once), JSON.stringify(s)).toBe(once);
    }
  });
});

describe('normalizeEn', () => {
  it('lowercases and strips diacritics and punctuation', () => {
    expect(normalizeEn('  Élijah, the Tishbite!  ')).toBe('elijah the tishbite');
    expect(normalizeEn("Ge'ez")).toBe('ge ez');
  });

  it('is idempotent', () => {
    const once = normalizeEn('Nebuchadnezzar II (Babylon)');
    expect(normalizeEn(once)).toBe(once);
  });
});
