// DetailPanel: the body of the panel for the selected item (FR-21–24, demo step 5).
// - A person (or a reign, which shows its person): figure, Amharic name (the panel title) with
//   the English name small, a date block per reign (or the lifetime, or TBD rows when nothing is
//   dated), "እንዴት ታወቀ?", their refs, and the editor note.
// - An event: title (the panel title) with the English title small, summary, date block,
//   "እንዴት ታወቀ?", refs and the editor note.
// Every date block shows both axes (DateRow). The refs open their verses inline (RefList,
// VerseBlock); the editors' note is a separate red-ink box, never inside a verse block.
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import { useMemo } from 'react';
import type { Anchor, Event, Person, Reign, Source } from '../../lib/core/schema';
import type { T } from '../../lib/i18n';
import Figure from '../figures/Figure';
import type { Selection } from '../chart/state';
import { AXES, DateBlock, type DatePair } from './DateRow';
import HowKnown, { type BookLookup, type KnownDate } from './HowKnown';
import RefList from './RefList';
import './detail.css';
import './verses.css';

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
  /** `books` names the refs; `scriptureBooks` / `scriptureVersion` drive the verse block. */
  index: Pick<IndexFile, 'anchors' | 'streams' | 'books' | 'scriptureBooks' | 'scriptureVersion'>;
  t: T;
}

/** The editors' note (FR-18): team-written, never scripture; its own red-ink box, labelled. */
function EditorNote({ note, t }: { note?: string; t: T }) {
  if (!note) return null;
  return (
    <aside className="note">
      <h3 className="note-label">{t('verse.editor_note')}</h3>
      <p lang="am">{note}</p>
    </aside>
  );
}

export default function DetailPanel({ item, tile, index, t }: DetailPanelProps) {
  const books: BookLookup = new Map(Object.entries(index.books ?? {}));
  const scripture = useMemo(
    () => ({ scriptureBooks: index.scriptureBooks, scriptureVersion: index.scriptureVersion }),
    [index.scriptureBooks, index.scriptureVersion],
  );
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
        books={index.books}
        scripture={scripture}
        t={t}
      />
      <EditorNote note={item.kind === 'person' ? item.person.note_am : item.event.note_am} t={t} />
    </div>
  );
}
