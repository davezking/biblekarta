import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { BookFile } from '../../build/verify-scripture';
import {
  SEPARATOR,
  SEPARATOR_PUNCTUATION,
  SEPARATOR_RULE_STATUS,
  SEPARATOR_RULE_VERSION,
  wordSeparators,
} from './separators';

// Non-scriptural sample words only (the repo never holds Bible text). The first case is the
// task's own constructed acceptance example.
const GOLDEN: [string, string][] = [
  ['እግዚአብሔርም አለ ብርሃን ይሁን፤ ብርሃንም ሆነ።', 'እግዚአብሔርም፡አለ፡ብርሃን፡ይሁን፤ ብርሃንም፡ሆነ።'],
  ['ቡና', 'ቡና'],
  ['ቡና።', 'ቡና።'],
  ['ቡና ሻይ', 'ቡና፡ሻይ'],
  ['ቡና ሻይ ውሃ', 'ቡና፡ሻይ፡ውሃ'],
  ['ቡና። ሻይ', 'ቡና። ሻይ'],
  ['ቡና፣ ሻይ እና ውሃ', 'ቡና፣ ሻይ፡እና፡ውሃ'],
  ['ቡና፤ ሻይ', 'ቡና፤ ሻይ'],
  ['ቡና፥ ሻይ', 'ቡና፥ ሻይ'],
  ['ቡና? ሻይ', 'ቡና? ሻይ'],
  ['ቡና! ሻይ', 'ቡና! ሻይ'],
  ['ዛሬ ቀን ነው?', 'ዛሬ፡ቀን፡ነው?'],
  // the mark as the first character of the right-hand token
  ['ቡና ። ሻይ', 'ቡና ። ሻይ'],
  ['ቡና ፣ሻይ', 'ቡና ፣ሻይ'],
  ['ቡና ፤ሻይ', 'ቡና ፤ሻይ'],
  ['ቡና ፥ሻይ', 'ቡና ፥ሻይ'],
  ['ቡና ?ሻይ', 'ቡና ?ሻይ'],
  ['ቡና !ሻይ', 'ቡና !ሻይ'],
  // a mark inside a word doesn't stop the ፡ at the word's edges
  ['ቡና፣ሻይ ውሃ', 'ቡና፣ሻይ፡ውሃ'],
  ['በ12 ቀን', 'በ12፡ቀን'],
  ['', ''],
];

const unseparate = (s: string) => s.replaceAll(SEPARATOR, ' ');

function hasSeparatorNextToPunct(s: string): boolean {
  return SEPARATOR_PUNCTUATION.some((p) => s.includes(SEPARATOR + p) || s.includes(p + SEPARATOR));
}

describe('wordSeparators', () => {
  it.each(GOLDEN)('%j → %j', (input, expected) => {
    expect(wordSeparators(input)).toBe(expected);
    expect(hasSeparatorNextToPunct(wordSeparators(input))).toBe(false);
  });

  it('is lossless and never puts ፡ next to punctuation, over every fixture verse', async () => {
    const book = JSON.parse(
      await readFile('scripture-fixtures/books/fixture.json', 'utf8'),
    ) as BookFile;
    const texts = book.chapters.flatMap((c) => c.verses.map((v) => v.t));
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      const out = wordSeparators(t);
      expect(unseparate(out)).toBe(t);
      expect(hasSeparatorNextToPunct(out)).toBe(false);
      expect(out.length).toBe(t.length);
    }
  });

  it('is lossless over the golden inputs', () => {
    for (const [input] of GOLDEN) expect(unseparate(wordSeparators(input))).toBe(input);
  });

  it('is idempotent on text without ፡', () => {
    for (const [input] of GOLDEN) {
      const once = wordSeparators(input);
      expect(wordSeparators(once)).toBe(once);
    }
  });

  it('exports the rule version and review status', () => {
    expect(SEPARATOR_RULE_VERSION).toBe(1);
    expect(['pending-review', 'approved']).toContain(SEPARATOR_RULE_STATUS);
  });
});
