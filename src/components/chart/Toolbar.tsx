// The chart's controls, under the title cartouche (DR-11), and the minimap strip under the chart
// (Board 5). Each control is a stub that its Sprint 3 task fills in.
import AxisSwitch from './controls/AxisSwitch';
import LaneMenu from './controls/LaneMenu';
import Minimap from './controls/Minimap';
import type { ControlProps } from './controls/types';

export function Toolbar(props: ControlProps) {
  return (
    <div className="chart-toolbar" role="toolbar" aria-label={props.t('chart.toolbar')}>
      <AxisSwitch {...props} />
      <LaneMenu {...props} />
    </div>
  );
}

export function MinimapBar(props: ControlProps) {
  return (
    <div className="chart-minimap">
      <Minimap {...props} />
    </div>
  );
}
