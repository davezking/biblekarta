// LaneMenu: shows and hides lanes (FR-9, demo step 8). A menu button opening a list of checkboxes,
// one per lane in lane order, named in Amharic (stream names are always Amharic). Hiding a lane
// moves the lanes below it up (Chart.tsx / geometry.ts); hiding the lane that holds the selection
// clears the selection.
//
// The task names `CheckboxMenu` (P2-S1-T4); that component isn't merged yet, so this draws its
// own, to be swapped for it when it lands.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { IndexFile, TileFile } from '../../../lib/core/datafiles';
import type { Lane } from '../../../lib/layout/streams';
import type { Selection } from '../state';
import type { ControlProps } from './types';

/** The lane holding the selected item (its stream's lane), or undefined (e.g. a streamless event). */
export function selectionLane(
  sel: Selection,
  tile: Pick<TileFile, 'people' | 'reigns' | 'events'>,
  lanes: readonly Lane[],
): string | undefined {
  const streamId =
    sel.kind === 'person'
      ? tile.people.find((p) => p.id === sel.id)?.stream_id
      : sel.kind === 'reign'
        ? tile.reigns.find((r) => r.id === sel.id)?.stream_id
        : tile.events.find((e) => e.id === sel.id)?.stream_id;
  if (!streamId) return undefined;
  return lanes.find((l) => l.stream_ids.includes(streamId))?.id;
}

/** The menu's rows: each lane of the axis, in order, with its top stream's Amharic name. */
export function laneRows(
  index: Pick<IndexFile, 'layout' | 'streams'>,
  axis: 'scholarly' | 'traditional',
) {
  const names = new Map(index.streams.map((s) => [s.id, s.name_am]));
  return (index.layout?.[axis].lanes ?? []).map((l) => ({
    id: l.id,
    name: names.get(l.id) ?? l.id,
  }));
}

const wrapStyle = { position: 'relative', fontFamily: 'var(--font-ui)' } as const;
const buttonStyle = {
  minHeight: 'var(--touch-target)',
  minWidth: 'var(--touch-target)',
  padding: '0 var(--space-lg)',
  border: 'var(--line-outline) solid var(--ink)',
  borderRadius: 'var(--radius-pill)',
  background: 'var(--vellum)',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 'var(--font-size-sm)',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
} as const;
const panelStyle = {
  position: 'absolute',
  insetBlockStart: 'calc(100% + var(--space-xs))',
  insetInlineEnd: 0,
  minWidth: '12rem',
  maxHeight: '70vh',
  overflowY: 'auto',
  padding: 'var(--space-sm)',
  border: 'var(--line-outline) solid var(--ink)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--vellum)',
  color: 'var(--ink)',
  zIndex: 'var(--z-panel)',
} as const;
const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-sm)',
  minHeight: 'var(--touch-target)',
  padding: '0 var(--space-sm)',
  fontFamily: 'var(--font-manuscript)',
  fontSize: 'var(--font-size-md)',
  cursor: 'pointer',
} as const;
const boxStyle = {
  width: '1.25rem',
  height: '1.25rem',
  margin: 0,
  accentColor: 'var(--ink)',
} as const;
const showAllStyle = {
  ...buttonStyle,
  width: '100%',
  marginBlockStart: 'var(--space-xs)',
} as const;

export default function LaneMenu({ store, index, tile, t }: ControlProps) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Close on Escape (focus back to the button) or a press outside the menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  const lanes = index.layout?.[s.axis].lanes ?? [];
  const rows = laneRows(index, s.axis);
  const hidden = new Set(s.hiddenLanes);
  const toggle = (laneId: string) =>
    store.toggleLane(laneId, (sel) => selectionLane(sel, tile, lanes));

  return (
    <div ref={wrapRef} className="lane-menu" style={wrapStyle}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        style={buttonStyle}
        onClick={() => setOpen((o) => !o)}
      >
        {t('lanes.menu')}
      </button>
      {open && (
        <div id={panelId} role="group" aria-label={t('lanes.menu')} style={panelStyle}>
          {rows.map((r) => (
            <label key={r.id} lang="am" style={rowStyle}>
              <input
                type="checkbox"
                data-lane={r.id}
                checked={!hidden.has(r.id)}
                onChange={() => toggle(r.id)}
                style={boxStyle}
              />
              {r.name}
            </label>
          ))}
          <button
            type="button"
            style={showAllStyle}
            disabled={hidden.size === 0}
            onClick={() => store.setHiddenLanes([])}
          >
            {t('lanes.showAll')}
          </button>
        </div>
      )}
    </div>
  );
}
