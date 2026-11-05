// HowKnown: "እንዴት ታወቀ?" (FR-22, FR-23). A Disclosure that says in plain language how each date
// shown in the panel is known, one sentence per date, by its method:
// - anchor: the anchor's label and the external source that attests it (e.g. the Kurkh Monolith);
// - derived: the anchor it was calculated from and the anchor value used, the derivation refs,
//   and the anchor's external source;
// - traditional: the source's citation;
// - relative: the relative text (or "not determined yet" for TBD).
// The wording lives in am.json / en.json (how.*), pending the reviewer's approval (R13).
// Nothing here is invented: a missing anchor or source says so instead of guessing.
import { formatScholarly } from '../../lib/core/dates';
import { toGeez } from '../../lib/core/geez';
import { formatRef } from '../../lib/core/refs';
import type { Book, DateValue, ScriptureRef, Source } from '../../lib/core/schema';
import type { T } from '../../lib/i18n';
import type { Axis } from '../../lib/layout/timescale';
import Disclosure from '../ui/Disclosure';
import type { AnchorLookup } from './DateRow';
import './detail.css';

export type SourceLookup = ReadonlyMap<string, Source>;
export type BookLookup = Map<string, Pick<Book, 'id' | 'name_am' | 'abbr_am'>>;

/** One date to explain: its axis, its value, and what it dates (e.g. "reign start"). */
export interface KnownDate {
  axis: Axis;
  dv: DateValue;
  /** Shown before the sentence when the panel has more than one date block. */
  context?: string;
}

/**
 * A reference as text. With book names (P2-S4-T2 passes them) it is the edition's own form
 * ("1 ነገሥት ፲፮፥፳፱"); without, the book id with Ge'ez numbers, as a placeholder.
 */
export function refText(ref: ScriptureRef, books?: BookLookup): string {
  if (books?.has(ref.book_id)) return formatRef(ref, books, { short: true });
  const end =
    ref.verse_end !== undefined && ref.verse_end !== ref.verse_start
      ? `–${toGeez(ref.verse_end)}`
      : '';
  return `${ref.book_id} ${toGeez(ref.chapter)}፥${toGeez(ref.verse_start)}${end}`;
}

/** The sentence explaining how one date is known. */
export function explainDate(
  dv: DateValue,
  t: T,
  anchors: AnchorLookup,
  sources: SourceLookup,
  books?: BookLookup,
): string {
  const anchor = dv.anchor_id !== undefined ? anchors.get(dv.anchor_id) : undefined;
  const source = dv.source_id !== undefined ? sources.get(dv.source_id) : undefined;
  const parts: string[] = [];
  switch (dv.method) {
    case 'anchor':
      if (anchor)
        parts.push(t('how.anchor', { label: anchor.label_am, source: anchor.external_source }));
      else if (source) parts.push(t('how.source', { citation: source.citation }));
      else parts.push(t('how.missing'));
      break;
    case 'derived': {
      if (anchor && dv.anchor_value_used !== undefined) {
        const value = formatScholarly(
          { start: dv.anchor_value_used, certainty: 'exact', method: 'anchor' },
          t,
        );
        parts.push(
          t('how.derived', { label: anchor.label_am, value, source: anchor.external_source }),
        );
      } else parts.push(t('how.missing'));
      if (dv.derivation_refs?.length) {
        const refs = dv.derivation_refs.map((r) => refText(r, books)).join('፤ ');
        parts.push(t('how.derived.refs', { refs }));
      }
      if (source) parts.push(t('how.calculation', { citation: source.citation }));
      break;
    }
    case 'traditional':
      parts.push(source ? t('how.traditional', { citation: source.citation }) : t('how.missing'));
      break;
    case 'relative': {
      const text = dv.relative_text_am;
      parts.push(text && text !== 'TBD' ? t('how.relative', { text }) : t('how.relative.tbd'));
      break;
    }
  }
  return parts.join(' ');
}

export interface HowKnownProps {
  dates: readonly KnownDate[];
  anchors: AnchorLookup;
  sources: SourceLookup;
  books?: BookLookup;
  t: T;
}

export default function HowKnown({ dates, anchors, sources, books, t }: HowKnownProps) {
  // One line per distinct explanation: a reign's start and end usually share theirs.
  const lines: { key: string; axis: Axis; text: string }[] = [];
  const seen = new Set<string>();
  for (const { axis, dv, context } of dates) {
    const sentence = explainDate(dv, t, anchors, sources, books);
    const label = context
      ? t('how.context', { axis: t(`axis.${axis}.name`), context })
      : t(`axis.${axis}.name`);
    const text = t('how.line', { label, text: sentence });
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push({ key: text, axis, text });
  }
  if (lines.length === 0) {
    lines.push({ key: 'none', axis: 'scholarly', text: t('how.relative.tbd') });
  }
  return (
    <Disclosure summary={t('how.title')} className="how-known">
      <ul className="how-known-list">
        {lines.map((l) => (
          <li key={l.key} data-axis={l.axis}>
            {l.text}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
