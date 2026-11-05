import { describe, expect, it } from 'vitest';
import { sameIgnoringCommitted } from './memo';
import type { LayerProps } from './types';

const base = { axis: 'scholarly', committed: { x: 0, k: 1, width: 400 }, t: () => '' };
const props = (p: object) => ({ ...base, ...p }) as unknown as LayerProps;

describe('sameIgnoringCommitted', () => {
  it('ignores a move between committed viewports', () => {
    expect(
      sameIgnoringCommitted(props({}), props({ committed: { x: -50, k: 2, width: 400 } })),
    ).toBe(true);
  });
  it('re-renders on the first commit, and on any other prop change', () => {
    expect(sameIgnoringCommitted(props({ committed: null }), props({}))).toBe(false);
    expect(sameIgnoringCommitted(props({}), props({ axis: 'traditional' }))).toBe(false);
  });
});
