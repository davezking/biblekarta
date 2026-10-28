// The contract every chart control gets. Controls move the view only through the controller.
import type { IndexFile, TileFile } from '../../../lib/core/datafiles';
import type { T } from '../../../lib/i18n';
import type { ChartStore } from '../state';
import type { ChartController } from '../zoom';

export interface ControlProps {
  store: ChartStore;
  /** Null until the chart has measured itself and attached zoom. */
  controller: ChartController | null;
  index: IndexFile;
  tile: TileFile;
  t: T;
}
