import { describe, expect, it } from 'vitest';
import type { Lane } from '../../lib/layout/streams';
import { BOTTOM_INSET_PX, LABEL_FONT_PX } from './layers/AxisLayer';
import { AXIS_BAND_PX, AXIS_BOTTOM_PX, placeLanes } from './geometry';

const lane = (id: string, height: number) => ({ id, height }) as unknown as Lane;
const lanes = [lane('a', 100), lane('b', 60), lane('c', 40)];

describe('placeLanes', () => {
  it('stacks the visible lanes under the top axis band', () => {
    const { laneY } = placeLanes(lanes, []);
    expect([...laneY]).toEqual([
      ['a', AXIS_BAND_PX],
      ['b', AXIS_BAND_PX + 100],
      ['c', AXIS_BAND_PX + 160],
    ]);
  });

  it('reserves a bottom axis band below the last lane', () => {
    expect(placeLanes(lanes, []).height).toBe(AXIS_BAND_PX + 200 + AXIS_BOTTOM_PX);
  });

  it('keeps the bottom band when lanes are hidden, last lane included', () => {
    const { laneY, height } = placeLanes(lanes, ['b', 'c']);
    expect([...laneY.keys()]).toEqual(['a']);
    expect(height).toBe(AXIS_BAND_PX + 100 + AXIS_BOTTOM_PX);
  });

  it('is just the two axis bands with no visible lanes', () => {
    expect(placeLanes(lanes, ['a', 'b', 'c']).height).toBe(AXIS_BAND_PX + AXIS_BOTTOM_PX);
    expect(placeLanes([], []).height).toBe(AXIS_BAND_PX + AXIS_BOTTOM_PX);
  });

  it('fits the bottom row (label and inset) inside the bottom band', () => {
    expect(BOTTOM_INSET_PX + LABEL_FONT_PX).toBeLessThan(AXIS_BOTTOM_PX);
  });
});
