// AxisSwitch: the reader's choice of primary axis (FR-20): ታሪካዊ ምርምር (scholarly, BC/AD) or
// ትውፊታዊ (Ethiopian traditional, counted from creation). Switching keeps the view in place
// (axis-switch.ts) and keeps the selection, even when it has no position on the new axis. While
// the traditional axis has items with no traditional date, their count shows next to the switch:
// they are counted, never drawn at an invented position.
//
// A two-option radio group (arrow keys move and select; the current axis is aria-checked). The
// task names `SegmentedSwitch` (P2-S1-T4); that component isn't merged yet, so this draws its own
// segmented control, to be swapped for it when it lands.
import { useRef, useSyncExternalStore, type KeyboardEvent } from 'react';
import type { IndexFile } from '../../../lib/core/datafiles';
import type { Axis } from '../../../lib/layout/timescale';
import { nextView, type Remembered } from '../axis-switch';
import type { ControlProps } from './types';

const AXES: Axis[] = ['scholarly', 'traditional'];

/** Items in the live eras with no position on `axis` (streams, reigns, events, people). */
export function unplacedCount(index: Pick<IndexFile, 'unplaced'>, axis: Axis): number {
  let n = 0;
  for (const perAxis of Object.values(index.unplaced)) {
    const c = perAxis[axis];
    if (c) n += c.streams + c.reigns + c.events + c.people;
  }
  return n;
}

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const groupStyle = {
  display: 'inline-flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 'var(--space-sm)',
  fontFamily: 'var(--font-ui)',
} as const;
const segmentsStyle = {
  display: 'inline-flex',
  border: 'var(--line-outline) solid var(--ink)',
  borderRadius: 'var(--radius-pill)',
  overflow: 'hidden',
  background: 'var(--vellum)',
} as const;
const optionStyle = (checked: boolean) =>
  ({
    minHeight: 'var(--touch-target)',
    minWidth: 'var(--touch-target)',
    padding: '0 var(--space-lg)',
    border: 'none',
    font: 'inherit',
    fontSize: 'var(--font-size-sm)',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    color: checked ? 'var(--vellum)' : 'var(--ink)',
    background: checked ? 'var(--ink)' : 'transparent',
  }) as const;
const countStyle = { fontSize: 'var(--font-size-xs)', color: 'var(--ink)' } as const;

export default function AxisSwitch({ store, controller, index, tile, t }: ControlProps) {
  const axis = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().axis,
    () => store.getSnapshot().axis,
  );
  /** Per axis: the view left there, and where the switch landed on the other axis. */
  const remembered = useRef<Partial<Record<Axis, Remembered>>>({});
  const buttons = useRef<Partial<Record<Axis, HTMLButtonElement | null>>>({});

  const choose = (to: Axis) => {
    const s = store.getSnapshot();
    const from = s.axis;
    if (to === from) return;
    const width = s.committedViewport?.width;
    if (!controller || !width || !index.timescale) {
      store.setAxis(to);
      return;
    }
    const view = controller.getView();
    const next = nextView({
      from,
      to,
      view,
      width,
      selection: s.selection,
      tile,
      cfg: index.timescale,
      remembered: remembered.current,
    });
    remembered.current[from] = { view, landed: next };
    // The axis first, so zoom clamps the new view to the new axis's width.
    store.setAxis(to);
    controller.setView(next, { animate: !prefersReducedMotion() });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const other = axis === 'scholarly' ? 'traditional' : 'scholarly';
    choose(other);
    buttons.current[other]?.focus();
  };

  const count = unplacedCount(index, axis);
  return (
    <div style={groupStyle}>
      <div
        role="radiogroup"
        aria-label={t('axis.switch.label')}
        style={segmentsStyle}
        onKeyDown={onKeyDown}
      >
        {AXES.map((a) => (
          <button
            key={a}
            ref={(el) => {
              buttons.current[a] = el;
            }}
            type="button"
            role="radio"
            aria-checked={a === axis}
            tabIndex={a === axis ? 0 : -1}
            data-axis={a}
            style={optionStyle(a === axis)}
            onClick={() => choose(a)}
          >
            {t(`axis.${a}.name`)}
          </button>
        ))}
      </div>
      {/* Always rendered: screen readers announce changes to a live region that already
          exists, not one inserted with its text. Empty on scholarly or with nothing undated. */}
      <span className="axis-unplaced" role="status" style={countStyle}>
        {axis === 'traditional' && count > 0 ? t('axis.unplaced', { n: count }) : ''}
      </span>
    </div>
  );
}
