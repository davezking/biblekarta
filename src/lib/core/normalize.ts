// Search-key normalization (FR-25). For search keys ONLY: never apply it to stored or
// displayed text, and never to scripture.

/**
 * Labialized forms folded to a plain syllable with the same sound. Applied before the
 * series folding below, so it wins over it. Reviewer-editable: add a pair here and the
 * tests in normalize.test.ts.
 */
export const LABIALIZED_MAP: Readonly<Record<string, string>> = {
  ኍ: 'ሁ', // ḫʷə → hu
  ቍ: 'ቁ', // qʷə → qu
  ኵ: 'ኩ', // kʷə → ku
  ጕ: 'ጉ', // gʷə → gu
};

// Each Ethiopic series is 8 consecutive code points: orders 1–7 at offsets 0–6, plus a
// labialized ("-wa"/"-oa") form at offset 7.
const SERIES_FOLDS: [from: number, to: number][] = [
  [0x1210, 0x1200], // ሐ → ሀ
  [0x1280, 0x1200], // ኀ → ሀ
  [0x1220, 0x1230], // ሠ → ሰ
  [0x12d0, 0x12a0], // ዐ → አ
  [0x1340, 0x1338], // ፀ → ጸ
];

// The labialized ኀ forms (ኈ ኊ ኋ ኌ ኍ) sit at offsets 8 and 10–13 after ኀ, one per vowel
// order (ä, i, a, e, ə). Each folds to the ሀ form with the same vowel. ኍ is overridden by
// LABIALIZED_MAP (→ ሁ).
const KHWA_BASE = 0x1288;
const KHWA_VOWEL_ORDER: Record<number, number> = { 0: 0, 2: 2, 3: 3, 4: 4, 5: 5 };

function buildFoldMap(): Map<string, string> {
  const map = new Map<string, string>();
  const isAssigned = (cp: number) => /\p{L}/u.test(String.fromCodePoint(cp));
  for (const [from, to] of SERIES_FOLDS) {
    for (let order = 0; order < 8; order++) {
      if (isAssigned(from + order) && isAssigned(to + order)) {
        map.set(String.fromCodePoint(from + order), String.fromCodePoint(to + order));
      }
    }
  }
  for (const [offset, order] of Object.entries(KHWA_VOWEL_ORDER)) {
    map.set(String.fromCodePoint(KHWA_BASE + Number(offset)), String.fromCodePoint(0x1200 + order));
  }
  for (const [from, to] of Object.entries(LABIALIZED_MAP)) map.set(from, to);
  return map;
}

const FOLD = buildFoldMap();

// ፡ ። ፣ ፤ ፥ ፦ ፧ ፨ and ASCII punctuation become spaces, then whitespace is collapsed.
const PUNCTUATION = /[፡-፨!-/:-@[-`{-~]/g;

export function normalizeAm(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) out += FOLD.get(ch) ?? ch;
  return out.replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeEn(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
