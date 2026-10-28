// Where the detail panel opens for the selection. Stub until P2-S4-T1 fills it in.
import type { IndexFile, TileFile } from '../../lib/core/datafiles';
import type { T } from '../../lib/i18n';
import type { ChartStore, Selection } from './state';

export interface PanelSlotProps {
  selection: Selection | null;
  tile: TileFile;
  index: IndexFile;
  store: ChartStore;
  t: T;
}

export default function PanelSlot(props: PanelSlotProps) {
  void props;
  return null;
}
