// Where the detail panel opens for the selection (DR-11, DR-12): a side panel at ≥ 1024 px, a
// bottom sheet below. Closing it clears the selection (the URL follows through url-sync.ts) and
// focus goes back to the chart. The side panel starts below the chart's toolbar, so it never
// covers it (--panel-inset-top, kept in step with scrolling and resizes).
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import type { T } from '../../lib/i18n';
import DetailPanel, { detailTitle, resolveSelection } from '../panel/DetailPanel';
import Panel from '../panel/Panel';
import type { ChartStore, Selection } from './state';

export interface PanelSlotProps {
  selection: Selection | null;
  tile: TileFile;
  index: IndexFile;
  store: ChartStore;
  t: T;
}

const slotStyle = { display: 'contents' } as CSSProperties;

export default function PanelSlot({ selection, tile, index, store, t }: PanelSlotProps) {
  const item = selection ? resolveSelection(selection, tile) : null;
  const open = item !== null;
  const slotRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);
  const itemKey = selection ? `${selection.kind}:${selection.id}` : '';

  // A new selection in an open panel starts at the top of the panel's body.
  useLayoutEffect(() => {
    const body = slotRef.current?.querySelector('.panel-body');
    if (body) body.scrollTop = 0;
  }, [itemKey]);

  const chartOf = () => slotRef.current?.closest('.chart') ?? null;

  // Keep the side panel's top under the toolbar while it's open.
  useLayoutEffect(() => {
    if (!open) return;
    const slot = slotRef.current;
    const toolbar = chartOf()?.querySelector('.chart-toolbar');
    if (!slot || !toolbar) return;
    let frame = 0;
    const place = () => {
      frame = 0;
      const bottom = Math.max(0, Math.round(toolbar.getBoundingClientRect().bottom));
      slot.style.setProperty('--panel-inset-top', `${bottom}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [open]);

  // On close, Panel gives focus back to the element that opened it. A tap on the chart's SVG
  // leaves no such element (focus was on the page), so focus goes to the chart itself.
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (!closed) return;
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
    const svg = chartOf()?.querySelector<SVGSVGElement>('svg.chart-svg');
    if (!svg) return;
    if (!svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '-1');
    svg.focus({ preventScroll: true });
  }, [open]);

  return (
    <div ref={slotRef} className="panel-slot" style={slotStyle}>
      <Panel
        open={open}
        onClose={() => store.select(null)}
        title={item ? detailTitle(item) : ''}
        lang="am"
        t={t}
      >
        {/* Keyed by item: a new selection starts with "እንዴት ታወቀ?" closed. */}
        {item && <DetailPanel key={itemKey} item={item} tile={tile} index={index} t={t} />}
      </Panel>
    </div>
  );
}
