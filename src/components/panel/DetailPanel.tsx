// DetailPanel: the body of the panel for the selected item (FR-21–24, demo step 5).
// - A person (or a reign, which shows its person): figure, Amharic name (the panel title) with
//   the English name small, a date block per reign (or the lifetime, or TBD rows when nothing is
//   dated), "እንዴት ታወቀ?", their refs, and the editor note.
// - An event: title (the panel title) with the English title small, summary, date block,
//   "እንዴት ታወቀ?", refs and the editor note.
// Every date block shows both axes (DateRow). The refs are a placeholder list that P2-S4-T2
// replaces with the verse block. Scripture is never rendered here.
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import type { Anchor, Event, Person, Reign, ScriptureRef, Source } from '../../lib/core/schema';
import type { T } from '../../lib/i18n';
import Figure from '../figures/Figure';
import type { Selection } from '../chart/state';
import { AXES, DateBlock, type DatePair } from './DateRow';
import HowKnown, { refText, type BookLookup, type KnownDate } from './HowKnown';
import './detail.css';

export type DetailItem =
  | { kind: 'person'; person: Person; reigns: Reign[]; selectedReignId?: string }
  | { kind: 'event'; event: Event };

/** The tile's person or event for a selection (a reign resolves to its person); null if absent. */
export function resolveSelection(
  sel: Selection,
  tile: Pick<TileFile, 'people' | 'reigns' | 'events'>,
): DetailItem | null {
  if (sel.kind === 'event') {
    const event = tile.events.find((e) => e.id === sel.id);
    return event ? { kind: 'event', event } : null;
  }
  const reign = sel.kind === 'reign' ? tile.reigns.find((r) => r.id === sel.id) : undefined;
  const personId = sel.kind === 'reign' ? reign?.person_id : sel.id;
  const person = personId ? tile.people.find((p) => p.id === personId) : undefined;
  if (!person) return null;
  return {
    kind: 'person',
    person,
    reigns: tile.reigns.filter((r) => r.person_id === person.id),
    selectedReignId: reign?.id,
  };
}

/** The panel title (Amharic). */
export function detailTitle(item: DetailItem): string {
  return item.kind === 'person' ? item.person.name_am : item.event.title_am;
}

const lifeDates = (p: Person): DatePair => ({
  start_scholarly: p.birth_scholarly,
  end_scholarly: p.death_scholarly,
  start_traditional: p.birth_traditional,
  end_traditional: p.death_traditional,
});
const eventDates = (e: Event): DatePair => ({
  start_scholarly: e.date_scholarly,
  start_traditional: e.date_traditional,
});
const hasAny = (d: DatePair) => Object.values(d).some((v) => v !== undefined);

export interface Block {
  key: string;
  label?: string;
  dates: DatePair;
  /** The reign that was tapped (listed first). */
  selected?: boolean;
}

/** The date blocks of an item: always at least one, so both axis rows always show. */
export function dateBlocks(item: DetailItem, streamName: (id: string) => string, t: T): Block[] {
  if (item.kind === 'event') return [{ key: 'event', dates: eventDates(item.event) }];
  // The tapped reign first, then the others in their order.
  const reigns = [...item.reigns].sort(
    (a, b) => Number(b.id === item.selectedReignId) - Number(a.id === item.selectedReignId),
  );
  const blocks: Block[] = reigns.map((r) => ({
    key: `reign:${r.id}`,
    label: t('panel.reign', { stream: streamName(r.stream_id) }),
    dates: r,
    selected: r.id === item.selectedReignId && reigns.length > 1,
  }));
  const life = lifeDates(item.person);
  if (hasAny(life) || blocks.length === 0) {
    blocks.push({ key: 'life', label: t('panel.life'), dates: life });
  }
  // A single block needs no heading.
  if (blocks.length === 1) blocks[0] = { ...blocks[0]!, label: undefined };
  return blocks;
}

/** Every date value in the blocks, for "እንዴት ታወቀ?". */
function knownDates(blocks: Block[]): KnownDate[] {
  const out: KnownDate[] = [];
  for (const b of blocks) {
    for (const axis of AXES) {
      for (const dv of [b.dates[`start_${axis}`], b.dates[`end_${axis}`]]) {
        if (dv) out.push({ axis, dv, context: b.label });
      }
    }
  }
  return out;
}

export interface DetailPanelProps {
  item: DetailItem;
  tile: Pick<TileFile, 'anchors' | 'sources'>;
  index: Pick<IndexFile, 'anchors' | 'streams'>;
  t: T;
  /** Book names for the refs, when loaded (P2-S4-T2). */
  books?: BookLookup;
}

/** The placeholder refs list (P2-S4-T2 replaces it with the verse block). */
function RefList({ refs, books, t }: { refs: ScriptureRef[]; books?: BookLookup; t: T }) {
  if (refs.length === 0) return null;
  return (
    <section className="detail-refs">
      <h3 className="detail-section-label">{t('panel.refs')}</h3>
      <ul className="detail-refs-list" lang="am">
        {refs.map((r) => {
          const key = `${r.book_id}.${r.chapter}.${r.verse_start}${r.verse_end ? `-${r.verse_end}` : ''}`;
          return (
            <li key={key} data-ref={key}>
              {refText(r, books)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The editor note slot (FR-18): team-written, never scripture. */
function EditorNote({ note, t }: { note?: string; t: T }) {
  if (!note) return null;
  return (
    <section className="detail-note">
      <h3 className="detail-section-label">{t('verse.editor_note')}</h3>
      <p lang="am">{note}</p>
    </section>
  );
}

export default function DetailPanel({ item, tile, index, t, books }: DetailPanelProps) {
  const anchors = new Map<string, Anchor>(
    [...index.anchors, ...tile.anchors].map((a) => [a.id, a]),
  );
  const sources = new Map<string, Source>(tile.sources.map((s) => [s.id, s]));
  const streams = new Map(index.streams.map((s) => [s.id, s.name_am]));
  const blocks = dateBlocks(item, (id) => streams.get(id) ?? id, t);

  return (
    <div className="detail" data-kind={item.kind}>
      {item.kind === 'person' ? (
        <div className="detail-head">
          <Figure
            kind={item.person.figure_kind}
            tone={item.person.figure_tone}
            size={64}
            className="detail-figure"
          />
          <p className="detail-name-en" lang="en">
            {item.person.name_en}
          </p>
        </div>
      ) : (
        <div className="detail-head">
          <p className="detail-name-en" lang="en">
            {item.event.title_en}
          </p>
          {item.event.summary_am && (
            <p className="detail-summary" lang="am">
              {item.event.summary_am}
            </p>
          )}
        </div>
      )}
      {blocks.map((b) => (
        <DateBlock
          key={b.key}
          dates={b.dates}
          anchors={anchors}
          t={t}
          label={b.label}
          selected={b.selected}
        />
      ))}
      <HowKnown
        dates={knownDates(blocks)}
        anchors={anchors}
        sources={sources}
        books={books}
        t={t}
      />
      <RefList
        refs={item.kind === 'person' ? item.person.refs : item.event.refs}
        books={books}
        t={t}
      />
      <EditorNote note={item.kind === 'person' ? item.person.note_am : item.event.note_am} t={t} />
    </div>
  );
}
