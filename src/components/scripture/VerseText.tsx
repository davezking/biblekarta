// Verse text exactly as stored, plus the display-time ፡ (FR-17): the only transform is
// wordSeparators(), and the result is a plain React text node — never HTML.
import { toGeez } from '../../lib/core/geez';
import { wordSeparators } from '../../lib/core/separators';

export interface Verse {
  n: number;
  to?: number;
  t: string;
  footnote?: string;
}

/** "፲፬", or "፲፬–፲፭" for a range. */
export function verseNumber(v: Pick<Verse, 'n' | 'to'>): string {
  return v.to !== undefined && v.to !== v.n ? `${toGeez(v.n)}–${toGeez(v.to)}` : toGeez(v.n);
}

export default function VerseText({ verses }: { verses: Verse[] }) {
  return (
    <>
      {verses.map((v) => (
        // TODO(R6): footnotes aren't shown until the reviewer decides R6.
        <p key={v.n} lang="am" className="ms verse" data-verse={v.n}>
          <span className="ms-red verse-n">{verseNumber(v)}</span>
          <span className="verse-t">{wordSeparators(v.t)}</span>
        </p>
      ))}
    </>
  );
}
