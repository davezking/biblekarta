import { describe, expect, it } from 'vitest';
import am from '../../i18n/am.json';
import en from '../../i18n/en.json';
import {
  aaToAmeteMihret,
  ameteMihretToAa,
  ameteMihretToGregorianRange,
  astroToBcAd,
  bcAdToAstro,
  formatScholarly,
  formatTraditional,
  isStale,
  spanOf,
  type Translate,
} from './dates';
import type { Anchor, DateValue } from './schema';

const translator =
  (dict: Record<string, string>): Translate =>
  (key) => {
    const v = dict[key];
    if (v === undefined) throw new Error(`missing i18n key ${key}`);
    return v;
  };
const tAm = translator(am);
const tEn = translator(en);

const dv = (fields: Partial<DateValue>): DateValue => ({
  certainty: 'exact',
  method: 'anchor',
  ...fields,
});

describe('BC/AD ⇄ astronomical', () => {
  it.each([
    [0, 1, 'BC'],
    [1, 1, 'AD'],
    [-930, 931, 'BC'],
    [-852, 853, 'BC'],
    [30, 30, 'AD'],
  ] as const)('%i ⇄ %i %s', (astro, year, era) => {
    expect(astroToBcAd(astro)).toEqual({ year, era });
    expect(bcAdToAstro(year, era)).toBe(astro);
  });

  it('rejects year 0 and fractions', () => {
    expect(() => bcAdToAstro(0, 'BC')).toThrow(RangeError);
    expect(() => astroToBcAd(1.5)).toThrow(RangeError);
  });
});

describe('Amete Alem / Amete Mihret / Gregorian', () => {
  it('AA 5500 → AM 0, AA 5501 → AM 1', () => {
    expect(aaToAmeteMihret(5500)).toBe(0);
    expect(aaToAmeteMihret(5501)).toBe(1);
    expect(ameteMihretToAa(0)).toBe(5500);
    expect(ameteMihretToAa(2019)).toBe(7519);
  });

  it('an AM year spans two Gregorian years', () => {
    expect(ameteMihretToGregorianRange(2019)).toEqual([2026, 2027]);
    expect(ameteMihretToGregorianRange(1)).toEqual([8, 9]);
  });

  it('round-trips', () => {
    for (let aa = 1; aa <= 8000; aa += 37) expect(ameteMihretToAa(aaToAmeteMihret(aa))).toBe(aa);
  });
});

describe('spanOf', () => {
  it('defaults end to start; null when undated', () => {
    expect(spanOf(dv({ start: -874, end: -853 }))).toEqual([-874, -853]);
    expect(spanOf(dv({ start: 30 }))).toEqual([30, 30]);
    expect(
      spanOf(dv({ method: 'relative', certainty: 'tradition_only', relative_text_am: 'TBD' })),
    ).toBeNull();
  });
});

describe('formatScholarly', () => {
  it.each<[string, Partial<DateValue>, string, string]>([
    ['range BC', { start: -873, end: -852, certainty: 'range' }, '874–853 ዓ.ዓ.', '874–853 BC'],
    ['approximate', { start: -965, certainty: 'approximate' }, 'በግምት 966 ዓ.ዓ.', 'c. 966 BC'],
    ['exact AD', { start: 30 }, '30 ዓ.ም.', 'AD 30'],
    ['exact BC', { start: -852 }, '853 ዓ.ዓ.', '853 BC'],
    ['range AD', { start: 26, end: 36, certainty: 'range' }, '26–36 ዓ.ም.', 'AD 26–36'],
    ['across the era', { start: -5, end: 30, certainty: 'range' }, '6 ዓ.ዓ.–30 ዓ.ም.', '6 BC–AD 30'],
    [
      'disputed',
      { start: -1445, certainty: 'disputed' },
      '1446 ዓ.ዓ. (አከራካሪ)',
      '1446 BC (disputed)',
    ],
    ['tradition_only', { start: -2000, certainty: 'tradition_only' }, '2001 ዓ.ዓ.', '2001 BC'],
    [
      'derived',
      { start: -900, method: 'derived', anchor_id: 'a', anchor_value_used: -852 },
      '901 ዓ.ዓ.',
      '901 BC',
    ],
    ['traditional', { start: -900, method: 'traditional', source_id: 's' }, '901 ዓ.ዓ.', '901 BC'],
  ])('%s', (_name, fields, amText, enText) => {
    expect(formatScholarly(dv(fields), tAm)).toBe(amText);
    expect(formatScholarly(dv(fields), tEn)).toBe(enText);
  });

  it('relative dates show their text, or TBD', () => {
    const tbd = dv({ method: 'relative', certainty: 'tradition_only', relative_text_am: 'TBD' });
    expect(formatScholarly(tbd, tAm)).toBe('ያልተወሰነ');
    expect(formatScholarly(tbd, tEn)).toBe('TBD');
    const rel = dv({ method: 'relative', certainty: 'approximate', relative_text_am: 'የሙከራ ጽሑፍ' });
    expect(formatScholarly(rel, tEn)).toBe('የሙከራ ጽሑፍ');
  });
});

describe('formatTraditional', () => {
  const trad = (fields: Partial<DateValue>) =>
    dv({ method: 'traditional', source_id: 'scan', ...fields });

  it('formats the PRD Genesis results (Flood AA 2256, Abram AA 3388)', () => {
    expect(formatTraditional(trad({ start: 2256 }), tAm)).toBe('ከፍጥረት 2256');
    expect(formatTraditional(trad({ start: 3388 }), tAm)).toBe('ከፍጥረት 3388');
    expect(formatTraditional(trad({ start: 3388 }), tEn)).toBe('AA 3388');
  });

  it.each<[Partial<DateValue>, string, string]>([
    [{ start: 4500, end: 4540, certainty: 'range' }, 'ከፍጥረት 4500–4540', 'AA 4500–4540'],
    [{ start: 4500, certainty: 'approximate' }, 'በግምት ከፍጥረት 4500', 'c. AA 4500'],
    [{ start: 4500, certainty: 'disputed' }, 'ከፍጥረት 4500 (አከራካሪ)', 'AA 4500 (disputed)'],
    [{ start: 4500, certainty: 'tradition_only' }, 'ከፍጥረት 4500', 'AA 4500'],
    [{ start: 4500, method: 'anchor' }, 'ከፍጥረት 4500', 'AA 4500'],
  ])('%j', (fields, amText, enText) => {
    expect(formatTraditional(trad(fields), tAm)).toBe(amText);
    expect(formatTraditional(trad(fields), tEn)).toBe(enText);
  });

  it('relative TBD dates show the TBD word', () => {
    const tbd = dv({ method: 'relative', certainty: 'tradition_only', relative_text_am: 'TBD' });
    expect(formatTraditional(tbd, tAm)).toBe('ያልተወሰነ');
  });
});

describe('isStale', () => {
  const anchor: Anchor = {
    id: 'qarqar',
    label_am: 'ሀ',
    label_en: 'Test anchor',
    date: { start: -852 },
    external_source: 'test',
    confidence: 'high',
    canon: 'shared',
  };
  const derived = (used: number) =>
    dv({ method: 'derived', start: -900, anchor_id: 'qarqar', anchor_value_used: used });

  it('false while the anchor value is unchanged', () => {
    expect(isStale(derived(-852), new Map([['qarqar', anchor]]))).toBe(false);
    expect(isStale(derived(-852), { qarqar: anchor })).toBe(false);
  });

  it('true when the anchor moved', () => {
    expect(isStale(derived(-853), { qarqar: anchor })).toBe(true);
  });

  it('true when the anchor is missing', () => {
    expect(isStale(derived(-852), {})).toBe(true);
  });

  it('false for non-derived dates', () => {
    expect(isStale(dv({ start: -852, anchor_id: 'qarqar' }), {})).toBe(false);
  });
});

describe('i18n', () => {
  it('am and en have the same keys', () => {
    expect(Object.keys(am).sort()).toEqual(Object.keys(en).sort());
  });

  it('the traditional prefix is ከፍጥረት', () => {
    expect(am['axis.traditional.prefix']).toBe('ከፍጥረት');
  });
});
