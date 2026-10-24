// Year systems. Pure: no globals, clock or locale; words come from the `t` passed in.
// - traditional: AA (Amete Alem) integers, creation = AA 1
// - scholarly: astronomical years, 1 BC = 0, 2 BC = −1
// - Amete Mihret (AM) = AA − 5500; AM year n runs from September of Gregorian n+7 to n+8
import type { Anchor, DateValue } from './schema';

/** Looks up a UI string; templates use {year} and {date}. */
export type Translate = (key: string) => string;

export type Era = 'BC' | 'AD';

const AA_AT_CHRIST = 5500;
const DASH = '–';

function assertInt(n: number, name: string): void {
  if (!Number.isInteger(n)) throw new RangeError(`${name}: expected an integer, got ${n}`);
}

export function astroToBcAd(y: number): { year: number; era: Era } {
  assertInt(y, 'astroToBcAd');
  return y <= 0 ? { year: 1 - y, era: 'BC' } : { year: y, era: 'AD' };
}

export function bcAdToAstro(year: number, era: Era): number {
  assertInt(year, 'bcAdToAstro');
  if (year < 1) throw new RangeError(`bcAdToAstro: there is no year ${year} ${era}`);
  return era === 'BC' ? 1 - year : year;
}

export function aaToAmeteMihret(aa: number): number {
  assertInt(aa, 'aaToAmeteMihret');
  return aa - AA_AT_CHRIST;
}

export function ameteMihretToAa(am: number): number {
  assertInt(am, 'ameteMihretToAa');
  return am + AA_AT_CHRIST;
}

/** The two (astronomical) Gregorian years an AM year overlaps; it changes in September. */
export function ameteMihretToGregorianRange(am: number): [number, number] {
  assertInt(am, 'ameteMihretToGregorianRange');
  return [am + 7, am + 8];
}

/** [start, end] of a dated value (end defaults to start); null for relative-only dates. */
export function spanOf(dv: DateValue): [number, number] | null {
  if (dv.start === undefined) return null;
  return [dv.start, dv.end ?? dv.start];
}

/** True when a derived date was computed from an anchor value that has since changed (FR-24). */
export function isStale(
  dv: DateValue,
  anchorsById: ReadonlyMap<string, Anchor> | Readonly<Record<string, Anchor>>,
): boolean {
  if (dv.method !== 'derived' || dv.anchor_id === undefined) return false;
  const anchor =
    anchorsById instanceof Map
      ? anchorsById.get(dv.anchor_id)
      : (anchorsById as Readonly<Record<string, Anchor>>)[dv.anchor_id];
  // A missing anchor can't vouch for the value either, so flag it for review.
  return anchor === undefined || anchor.date.start !== dv.anchor_value_used;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

function withCertainty(date: string, dv: DateValue, t: Translate): string {
  if (dv.certainty === 'approximate') return fill(t('date.approx'), { date });
  if (dv.certainty === 'disputed') return fill(t('date.disputed'), { date });
  return date;
}

/** Text for a date with no calendar year: its relative text, or "TBD". */
function undated(dv: DateValue, t: Translate): string {
  const text = dv.relative_text_am;
  return text && text !== 'TBD' ? text : t('date.tbd');
}

/** e.g. "874–853 ዓ.ዓ." / "874–853 BC", "በግምት 966 ዓ.ዓ." / "c. 966 BC", "30 ዓ.ም." / "AD 30". */
export function formatScholarly(dv: DateValue, t: Translate): string {
  const span = spanOf(dv);
  if (!span) return undated(dv, t);
  const [a, b] = span.map(astroToBcAd);
  const key = (era: Era) => (era === 'BC' ? 'date.bc' : 'date.ad');
  let date: string;
  if (span[0] === span[1]) date = fill(t(key(a.era)), { year: String(a.year) });
  else if (a.era === b.era) date = fill(t(key(a.era)), { year: `${a.year}${DASH}${b.year}` });
  else {
    date =
      fill(t(key(a.era)), { year: String(a.year) }) +
      DASH +
      fill(t(key(b.era)), { year: String(b.year) });
  }
  return withCertainty(date, dv, t);
}

/** e.g. "ከፍጥረት 3388". */
export function formatTraditional(dv: DateValue, t: Translate): string {
  const span = spanOf(dv);
  if (!span) return undated(dv, t);
  const years = span[0] === span[1] ? String(span[0]) : `${span[0]}${DASH}${span[1]}`;
  return withCertainty(`${t('axis.traditional.prefix')} ${years}`, dv, t);
}
