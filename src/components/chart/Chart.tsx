// The chart island: four SVG layer groups (grid → geometry → labels → overlay), the stream bands,
// and the stubs that Sprint 3 fills in. Pan and zoom never re-render React (zoom.ts writes the
// transform to the DOM); the store re-renders once per gesture, at its end.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
} from 'react';
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import { createT, type Lang } from '../../lib/i18n';
import { VIEWPORT_PX } from '../../lib/layout/timescale';
import FigureSpriteMount from './FigureSpriteMount';
import PanelSlot from './PanelSlot';
import { MinimapBar, Toolbar } from './Toolbar';
import { useChartData, type ChartData } from './data/useChartData';
import { placeLanes } from './geometry';
import AnchorLayer from './layers/AnchorLayer';
import AxisLayer from './layers/AxisLayer';
import BandLayer from './layers/BandLayer';
import EventLayer from './layers/EventLayer';
import FigureLayer from './layers/FigureLayer';
import GridLayer from './layers/GridLayer';
import LabelLayer from './layers/LabelLayer';
import OverlayLayer from './layers/OverlayLayer';
import ProphetLayer from './layers/ProphetLayer';
import ReignLayer from './layers/ReignLayer';
import type { LayerProps } from './layers/types';
import { createChartStore, type ChartStore, type SelectionKind } from './state';
import { createViewportChannel, type ViewportChannel } from './viewport';
import { attachZoom, type ChartController, type ZoomHandle } from './zoom';
import './chart.css';

export interface ChartProps {
  lang?: Lang;
  /** Where /data/ is served. */
  dataBase?: string;
  /** Pre-loaded data (tests); skips fetching. */
  data?: ChartData;
  /** An external store (tests, or a page that drives the chart). */
  store?: ChartStore;
  /** Called once zoom is attached, with the only handle that moves the view. */
  onController?: (controller: ChartController) => void;
}

export default function Chart({ lang = 'am', dataBase, data, store, onController }: ChartProps) {
  const t = useMemo(() => createT(lang), [lang]);
  const state = useChartData(dataBase, data);
  const ownStore = useMemo(() => store ?? createChartStore(), [store]);
  const channel = useMemo(() => createViewportChannel(), []);
  if (state.status === 'loading') return <p className="chart-status">{t('chart.loading')}</p>;
  if (state.status === 'error') return <p className="chart-status">{t('chart.error')}</p>;
  return (
    <ChartView
      index={state.index}
      tile={state.tile}
      store={ownStore}
      channel={channel}
      t={t}
      onController={onController}
    />
  );
}

const SELECT_KINDS = new Set<SelectionKind>(['reign', 'person', 'event']);

interface ChartViewProps {
  index: IndexFile;
  tile: TileFile;
  store: ChartStore;
  channel: ViewportChannel;
  t: ReturnType<typeof createT>;
  onController?: (controller: ChartController) => void;
}

function ChartView({ index, tile, store, channel, t, onController }: ChartViewProps) {
  const s = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const cfg = index.timescale!;
  const lanes = index.layout![s.axis].lanes;
  const { laneY, height } = useMemo(() => placeLanes(lanes, s.hiddenLanes), [lanes, s.hiddenLanes]);
  const fill = useMemo(() => new Map(index.streams.map((st) => [st.id, st.fill_color])), [index]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const geometryRef = useRef<SVGGElement>(null);
  const overlayRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomHandle | null>(null);
  const [width, setWidth] = useState(0);
  const [controller, setController] = useState<ChartController | null>(null);

  // Measure the width (and follow resizes).
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const measure = () => setWidth(Math.round(el.clientWidth) || VIEWPORT_PX);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Attach zoom once the width is known; later size changes only resize it.
  useLayoutEffect(() => {
    if (!width || zoomRef.current) return;
    const handle = attachZoom({
      svg: svgRef.current!,
      targets: () => [geometryRef.current!, overlayRef.current!],
      cfg,
      getAxis: () => store.getSnapshot().axis,
      store,
      channel,
      width,
      height,
    });
    zoomRef.current = handle;
    setController(handle);
    onController?.(handle);
  }, [width, height, cfg, store, channel, onController]);
  useEffect(() => zoomRef.current?.resize(width, height), [width, height]);
  useEffect(
    () => () => {
      zoomRef.current?.destroy();
      zoomRef.current = null;
    },
    [],
  );

  // Taps select a reign, person or event (any element with data-select="kind:id").
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const hit = (e.target as Element).closest?.('[data-select]');
    const [kind, id] = (hit?.getAttribute('data-select') ?? '').split(':');
    store.select(
      kind && id && SELECT_KINDS.has(kind as SelectionKind)
        ? { kind: kind as SelectionKind, id }
        : null,
    );
  };

  const layer: LayerProps = {
    index,
    tile,
    axis: s.axis,
    cfg,
    viewport: channel,
    committed: s.committedViewport,
    laneY,
    height,
    selection: s.selection,
    t,
  };
  const bands = tile.axes[s.axis].bands;
  const controls = { store, controller, index, tile, t };

  return (
    <div className="chart">
      <Toolbar {...controls} />
      <div className="chart-frame" ref={wrapRef}>
        <svg
          ref={svgRef}
          className="chart-svg"
          width={width || undefined}
          height={height}
          role="group"
          aria-label={t('chart.aria')}
          onClick={onClick}
        >
          <FigureSpriteMount />
          <g className="chart-grid">
            <GridLayer {...layer} />
          </g>
          <g className="chart-geometry" ref={geometryRef}>
            <BandLayer {...layer} />
            {lanes.map((lane) => {
              const y = laneY.get(lane.id);
              if (y === undefined) return null;
              return (
                <g key={lane.id} data-lane={lane.id} transform={`translate(0,${y})`}>
                  {bands
                    .filter((b) => b.lane_id === lane.id)
                    .map((b) => (
                      <path
                        key={b.stream_id}
                        className="chart-band"
                        data-stream={b.stream_id}
                        d={b.d}
                        fill={fill.get(b.stream_id)}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ))}
                </g>
              );
            })}
            <AnchorLayer {...layer} />
            <ReignLayer {...layer} />
            <ProphetLayer {...layer} />
            <EventLayer {...layer} />
          </g>
          <g className="chart-labels">
            <AxisLayer {...layer} />
            <LabelLayer {...layer} />
            <FigureLayer {...layer} />
          </g>
          <g className="chart-overlay" ref={overlayRef}>
            <OverlayLayer {...layer} />
          </g>
        </svg>
      </div>
      <MinimapBar {...controls} />
      <PanelSlot selection={s.selection} tile={tile} index={index} store={store} t={t} />
    </div>
  );
}
