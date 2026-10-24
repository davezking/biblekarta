// Picks about 30 verses for /dev/scripture/separator-samples that cover the ፡ rule's edge
// cases, so the reviewer can compare the rendered text with the scan. Deterministic: in each
// category the picks are spread evenly over the verses (so over many books), never random.
import { SEPARATOR_PUNCTUATION } from './separators';

export interface SampleVerse {
  key: string; // e.g. "1ki.16.29" (scan numbering)
  n: number;
  to?: number;
  t: string;
}

export interface Sample extends SampleVerse {
  reasons: string[];
}

const PER_CATEGORY = 3;

/** Category label → test. Mid-verse means the mark is followed by more text. */
export const SAMPLE_CATEGORIES: [string, (v: SampleVerse) => boolean][] = [
  ...SEPARATOR_PUNCTUATION.map((p): [string, (v: SampleVerse) => boolean] => [
    `${p} mid-verse`,
    (v) => v.t.slice(0, -1).includes(p),
  ]),
  ['verse range', (v) => v.to !== undefined],
  ['ends with ?', (v) => v.t.endsWith('?')],
  ['single word', (v) => v.t !== '' && !v.t.includes(' ')],
  ['digit', (v) => /[0-9]/.test(v.t)],
];

function spread<T>(items: T[], k: number): T[] {
  if (items.length <= k) return items;
  return Array.from({ length: k }, (_, i) => items[Math.floor((i * items.length) / k)]!);
}

export function pickSeparatorSamples(verses: SampleVerse[], total = 30): Sample[] {
  const picked = new Map<string, Sample>();
  const add = (v: SampleVerse, reason: string) => {
    const s = picked.get(v.key);
    if (s) s.reasons.push(reason);
    else picked.set(v.key, { ...v, reasons: [reason] });
  };
  for (const [label, test] of SAMPLE_CATEGORIES) {
    const matching = verses.filter(test);
    const fresh = matching.filter((v) => !picked.has(v.key));
    for (const v of spread(fresh.length ? fresh : matching, PER_CATEGORY)) add(v, label);
  }
  const rest = verses.filter((v) => !picked.has(v.key));
  for (const v of spread(rest, Math.max(0, total - picked.size))) add(v, 'ordinary');
  const order = new Map(verses.map((v, i) => [v.key, i]));
  return [...picked.values()].sort((a, b) => order.get(a.key)! - order.get(b.key)!);
}
