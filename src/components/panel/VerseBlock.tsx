// VerseBlock: the text of one reference, in the panel (FR-16): the reference as a heading, the
// verses through VerseText (stored text + wordSeparators(), plain text nodes, lang="am"), then the
// credit line (FR-19). Nothing here touches the verse text.
// - not-ready (the book isn't published): "ይህ መጽሐፍ በዝግጅት ላይ ነው", and no request is made;
// - loading: a skeleton with no text;
// - error: a retry button.
// Footnotes (R6) are not shown: R6 isn't recorded as approved, so VerseText keeps its TODO(R6).
import { useId } from 'react';
import type { ScriptureRef } from '../../lib/core/schema';
import { selectVerses } from '../../lib/core/verse-select';
import type { T } from '../../lib/i18n';
import { useBook, type UseBookOptions } from '../scripture/useBook';
import VerseText, { verseNumber } from '../scripture/VerseText';
import Button from '../ui/Button';
import './verses.css';

export interface VerseBlockProps {
  scriptureRef: ScriptureRef;
  /** The reference as text (formatRef), shown as the heading. */
  heading: string;
  scripture: UseBookOptions;
  t: T;
  id?: string;
}

export default function VerseBlock({ scriptureRef, heading, scripture, t, id }: VerseBlockProps) {
  const { status, book, retry } = useBook(scriptureRef.book_id, scripture);
  const headingId = useId();

  let body;
  if (status === 'not-ready') {
    body = <p className="verse-status">{t('verse.not_ready')}</p>;
  } else if (status === 'loading') {
    body = (
      <div className="verse-skeleton" role="status" aria-label={t('verse.loading')}>
        <span />
        <span />
        <span />
      </div>
    );
  } else if (status === 'error' || !book) {
    body = (
      <div className="verse-error">
        <p className="verse-status">{t('verse.error')}</p>
        <Button onClick={retry}>{t('verse.retry')}</Button>
      </div>
    );
  } else {
    const { verses, missing } = selectVerses(book, scriptureRef);
    body = (
      <>
        <div className="verse-text">
          <VerseText verses={verses} />
        </div>
        {missing.length > 0 && (
          <p className="verse-status">
            {t('verse.missing', { verses: missing.map((n) => verseNumber({ n })).join('፣ ') })}
          </p>
        )}
      </>
    );
  }

  return (
    <section
      id={id}
      className="verse-block"
      aria-labelledby={headingId}
      aria-busy={status === 'loading' || undefined}
      data-status={status}
    >
      <h4 id={headingId} className="verse-ref" lang="am">
        {heading}
      </h4>
      {body}
      <p className="verse-credit">{t('verse.credit')}</p>
    </section>
  );
}
