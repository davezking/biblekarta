// DateRow: one axis's date for an item (FR-21): the axis name, the date as text, and a certainty
// chip. A start/end pair (a reign, a lifetime) shows as one span. A `relative` date has no calendar
// year, so it shows its relative text, or "TBD" (date.tbd); no year is ever made up for it.
// A derived date whose anchor has since changed (isStale, FR-24) gets a red-ink warning line.
// DateBlock always shows both rows, scholarly then traditional, even when one is TBD.
import { formatScholarly, formatTraditional, isStale } from '../../lib/core/dates';
import type { Anchor, DateValue } from '../../lib/core/schema';
import type { T } from '../../lib/i18n';
import type { Axis } from '../../lib/layout/timescale';
import Chip, { type ChipTone } from '../ui/Chip';
import './detail.css';

export type Certainty = DateValue['certainty'];
export type AnchorLookup = ReadonlyMap<string, Anchor>;

export const AXES: readonly Axis[] = ['scholarly', 'traditional'];

/** Least certain last: a span is only as certain as its weaker end. */
const CERTAINTY_RANK: Record<Certainty, number> = {
  exact: 0,
  range: 1,
  approximate: 2,
  disputed: 3,
  tradition_only: 4,
};

export const CERTAINTY_TONE: Record<Certainty, ChipTone> = {
  exact: 'green',
  range: 'neutral',
  approximate: 'neutral',
  disputed: 'red',
  tradition_only: 'yellow',
};

const weaker = (a: Certainty, b: Certainty) => (CERTAINTY_RANK[a] >= CERTAINTY_RANK[b] ? a : b);

/** The certainty of a start/end pair (the weaker of the two), or undefined with no date. */
export function certaintyOf(start?: DateValue, end?: DateValue): Certainty | undefined {
  if (start && end) return weaker(start.certainty, end.certainty);
  return (start ?? end)?.certainty;
}

/** The text of a start/end pair on one axis, e.g. "874–853 ዓ.ዓ.", "ያልተወሰነ", "966 ዓ.ዓ.–ያልተወሰነ". */
export function dateText(axis: Axis, t: T, start?: DateValue, end?: DateValue): string {
  const format = axis === 'scholarly' ? formatScholarly : formatTraditional;
  const a = start ?? end;
  const b = start && end ? end : undefined;
  if (!a) return t('date.tbd');
  if (!b || a === b) return format(a, t);
  if (a.start !== undefined && b.start !== undefined) {
    // Both have years: one span, formatted once (so the era suffix isn't repeated).
    return format(
      {
        start: a.start,
        end: b.end ?? b.start,
        certainty: weaker(a.certainty, b.certainty),
        method: a.method,
      },
      t,
    );
  }
  const left = format(a, t);
  const right = format(b, t);
  return left === right ? left : `${left}–${right}`;
}

export interface DateRowProps {
  axis: Axis;
  start?: DateValue;
  end?: DateValue;
  anchors: AnchorLookup;
  t: T;
}

export default function DateRow({ axis, start, end, anchors, t }: DateRowProps) {
  const certainty = certaintyOf(start, end);
  const stale = [start, end].some((dv) => dv !== undefined && isStale(dv, anchors));
  return (
    <div className="date-row" data-axis={axis}>
      <dt className="date-row-axis">{t(`axis.${axis}.name`)}</dt>
      <dd className="date-row-value">
        <span className="date-row-text">{dateText(axis, t, start, end)}</span>
        {certainty && (
          // Read as "<certainty>: <value>"; the chip alone has no context for a screen reader.
          <span className="visually-hidden">{t('certainty.label')}</span>
        )}
        {certainty && (
          <Chip tone={CERTAINTY_TONE[certainty]} title={t('certainty.label')}>
            {t(`certainty.${certainty}`)}
          </Chip>
        )}
      </dd>
      {stale && <dd className="date-row-stale">{t('date.stale')}</dd>}
    </div>
  );
}

/** The dates of one thing (a reign, a lifetime, an event) on both axes. */
export interface DatePair {
  start_scholarly?: DateValue;
  end_scholarly?: DateValue;
  start_traditional?: DateValue;
  end_traditional?: DateValue;
}

export interface DateBlockProps {
  dates: DatePair;
  anchors: AnchorLookup;
  t: T;
  /** A heading for the block (e.g. the reign), when an item has more than one. */
  label?: string;
  /** The block of the reign that was tapped. */
  selected?: boolean;
}

/** Both axes' rows, always both. */
export function DateBlock({ dates, anchors, t, label, selected }: DateBlockProps) {
  return (
    <div className="date-block" data-selected={selected || undefined}>
      {label && <h3 className="date-block-label">{label}</h3>}
      <dl className="date-block-rows">
        {AXES.map((axis) => (
          <DateRow
            key={axis}
            axis={axis}
            start={dates[`start_${axis}`]}
            end={dates[`end_${axis}`]}
            anchors={anchors}
            t={t}
          />
        ))}
      </dl>
    </div>
  );
}
