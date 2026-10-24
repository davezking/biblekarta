import { describe, expect, it } from 'vitest';
import { pickSeparatorSamples, type SampleVerse } from './separator-samples';

// Synthetic, non-scriptural verses.
const verses: SampleVerse[] = [];
for (let i = 1; i <= 200; i++)
  verses.push({ key: `aaa.1.${i}`, n: i, t: `ቃል ሌላ ቃል ${i % 2 ? 'ነው።' : 'ነው'}` });
const special: SampleVerse[] = [
  { key: 'bbb.1.1', n: 1, t: 'ቡና። ሻይ' },
  { key: 'bbb.1.2', n: 2, t: 'ቡና፣ ሻይ' },
  { key: 'bbb.1.3', n: 3, t: 'ቡና፤ ሻይ' },
  { key: 'bbb.1.4', n: 4, t: 'ቡና፥ ሻይ' },
  { key: 'bbb.1.5', n: 5, t: 'ቡና? ሻይ' },
  { key: 'bbb.1.6', n: 6, t: 'ቡና! ሻይ' },
  { key: 'bbb.1.7', n: 7, to: 8, t: 'ቡና ሻይ' },
  { key: 'bbb.1.9', n: 9, t: 'ቡና ነው?' },
  { key: 'bbb.1.10', n: 10, t: 'ቡና' },
  { key: 'bbb.1.11', n: 11, t: 'በ3 ቀን' },
];

describe('pickSeparatorSamples', () => {
  const all = [...verses, ...special];

  it('covers every edge case and fills up to the total', () => {
    const picked = pickSeparatorSamples(all);
    expect(picked).toHaveLength(30);
    const reasons = new Set(picked.flatMap((s) => s.reasons));
    for (const r of [
      '። mid-verse',
      '፣ mid-verse',
      '፤ mid-verse',
      '፥ mid-verse',
      '? mid-verse',
      '! mid-verse',
      'verse range',
      'ends with ?',
      'single word',
      'digit',
    ])
      expect(reasons).toContain(r);
    for (const s of special) expect(picked.map((p) => p.key)).toContain(s.key);
  });

  it('is deterministic, unique and in source order', () => {
    const a = pickSeparatorSamples(all);
    expect(pickSeparatorSamples(all)).toEqual(a);
    const keys = a.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const idx = keys.map((k) => all.findIndex((v) => v.key === k));
    expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });

  it('returns everything when there are fewer verses than the total', () => {
    expect(pickSeparatorSamples(special)).toHaveLength(special.length);
  });
});
