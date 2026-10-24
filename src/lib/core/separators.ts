// The ፡ (Ethiopic wordspace) rule. Stored verse text separates words with single spaces and
// never contains ፡; the separator is added here, at display time only (PRD v5.4, FR-17).
// Between two adjacent words one ፡ is written, except next to ። ፣ ፤ ፥ ? ! — there the
// single space stays, as printed. Nothing else is changed, so the rule is lossless:
// replacing every ፡ in the output with a space gives back the stored text.

export const SEPARATOR = '፡';
export const SEPARATOR_PUNCTUATION: readonly string[] = ['።', '፣', '፤', '፥', '?', '!'];

/** Bumped whenever the rule changes; the reviewer approves a specific version. */
export const SEPARATOR_RULE_VERSION = 1;
/** 'pending-review' until the reviewer approves the rule against the scan; then 'approved'. */
export const SEPARATOR_RULE_STATUS: 'pending-review' | 'approved' = 'pending-review';

const PUNCT = new Set(SEPARATOR_PUNCTUATION);

export function wordSeparators(t: string): string {
  const tokens = t.split(' ');
  let out = tokens[0]!;
  for (let i = 1; i < tokens.length; i++) {
    const left = tokens[i - 1]!;
    const right = tokens[i]!;
    const nextToPunct = PUNCT.has(left.slice(-1)) || PUNCT.has(right.slice(0, 1));
    out += (nextToPunct ? ' ' : SEPARATOR) + right;
  }
  return out;
}
