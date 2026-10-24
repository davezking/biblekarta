// Ge'ez numerals. There is no zero; the number is written in base-100 pairs from the
// most significant, joined alternately by ፻ (100) and ፼ (10,000): 12345 = ፼፳፫፻፵፭.
// A ፩ is dropped before ፻ always, and before ፼ when it leads the number (100 = ፻, 10000 = ፼).

const ONES = ['', '፩', '፪', '፫', '፬', '፭', '፮', '፯', '፰', '፱'];
const TENS = ['', '፲', '፳', '፴', '፵', '፶', '፷', '፸', '፹', '፺'];
const HUNDRED = '፻';
const TEN_THOUSAND = '፼';
const MAX = 99_999_999;

export class GeezParseError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid Ge'ez numeral "${input}": ${reason}`);
    this.name = 'GeezParseError';
  }
}

function pair(n: number): string {
  return TENS[Math.floor(n / 10)] + ONES[n % 10];
}

export function toGeez(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > MAX) {
    throw new RangeError(`toGeez: expected an integer 1..${MAX}, got ${n}`);
  }
  // pairs[i] is the digit pair worth 100^i
  const pairs: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 100)) pairs.push(rest % 100);

  let out = '';
  for (let i = pairs.length - 1; i >= 0; i--) {
    const p = pairs[i];
    const leading = out === '';
    if (i === 0) {
      out += pair(p);
    } else if (i % 2 === 1) {
      // ×100 position (inside a ፼ group)
      if (p > 0) out += (p === 1 ? '' : pair(p)) + HUNDRED;
    } else {
      // ×10,000 position: the ፼ is written if anything at or above it is non-zero
      const drop = p === 1 && leading;
      if (p > 0) out += drop ? '' : pair(p);
      if (p > 0 || !leading) out += TEN_THOUSAND;
    }
  }
  return out;
}

const DIGIT_VALUES = new Map<string, number>([
  ...ONES.slice(1).map((c, i) => [c, i + 1] as [string, number]),
  ...TENS.slice(1).map((c, i) => [c, (i + 1) * 10] as [string, number]),
]);

export function fromGeez(s: string): number {
  if (typeof s !== 'string' || s.length === 0) throw new GeezParseError(String(s), 'empty');
  let value = 0; // completed ፼ groups
  let seg = 0; // value inside the current ፼ group, before the last ፻
  let cur = 0; // digits since the last separator
  for (const ch of s) {
    const d = DIGIT_VALUES.get(ch);
    if (d !== undefined) {
      cur += d;
    } else if (ch === HUNDRED) {
      seg = (seg + (cur || 1)) * 100;
      cur = 0;
    } else if (ch === TEN_THOUSAND) {
      value = (value + (seg + cur || 1)) * 10_000;
      seg = 0;
      cur = 0;
    } else {
      throw new GeezParseError(s, `unexpected character "${ch}"`);
    }
  }
  const n = value + seg + cur;
  // Only the canonical spelling is accepted (rejects ፻፻, ፩፻, ፩፲, misordered digits…)
  if (n < 1 || n > MAX || toGeez(n) !== s) throw new GeezParseError(s, 'not a canonical numeral');
  return n;
}
