// RefList: an item's references (FR-15), as buttons named with the Amharic book name
// (formatRef). Tapping one opens its VerseBlock just below it, without leaving the chart (FR-16);
// only one is open at a time, and tapping the open one closes it.
import { useId, useState } from 'react';
import type { IndexBook } from '../../lib/core/datafiles';
import { formatRef } from '../../lib/core/refs';
import type { ScriptureRef } from '../../lib/core/schema';
import type { T } from '../../lib/i18n';
import type { UseBookOptions } from '../scripture/useBook';
import { refText } from './HowKnown';
import VerseBlock from './VerseBlock';
import './verses.css';

export const refKey = (r: ScriptureRef) =>
  `${r.book_id}.${r.chapter}.${r.verse_start}${r.verse_end && r.verse_end !== r.verse_start ? `-${r.verse_end}` : ''}`;

/** The reference with the Amharic book name, or the placeholder form if the name is unknown. */
export function refLabel(
  r: ScriptureRef,
  books: Readonly<Record<string, IndexBook>> | undefined,
  short = false,
): string {
  const book = books?.[r.book_id];
  return book ? formatRef(r, [book], { short }) : refText(r);
}

export interface RefListProps {
  refs: readonly ScriptureRef[];
  books?: Readonly<Record<string, IndexBook>>;
  scripture: UseBookOptions;
  t: T;
}

export default function RefList({ refs, books, scripture, t }: RefListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const base = useId();
  if (refs.length === 0) return null;
  // The same reference twice would open twice; list each once.
  const unique = [...new Map(refs.map((r) => [refKey(r), r])).values()];
  return (
    <section className="ref-list">
      <h3 className="detail-section-label">{t('panel.refs')}</h3>
      <ul className="ref-list-items">
        {unique.map((r) => {
          const key = refKey(r);
          const isOpen = open === key;
          const blockId = `${base}-${key}`;
          return (
            <li key={key} data-ref={key}>
              <button
                type="button"
                className="ui-button ref-button"
                lang="am"
                aria-expanded={isOpen}
                aria-controls={isOpen ? blockId : undefined}
                onClick={() => setOpen(isOpen ? null : key)}
              >
                {refLabel(r, books, true)}
              </button>
              {isOpen && (
                <VerseBlock
                  id={blockId}
                  scriptureRef={r}
                  heading={refLabel(r, books)}
                  scripture={scripture}
                  t={t}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
