// Layers whose output does not depend on the committed viewport skip the re-render a gesture end
// (or a long gesture's periodic commit) would otherwise cost them: they follow the viewport
// imperatively, from the channel, instead.
import { memo, type ComponentType } from 'react';
import type { LayerProps } from './types';

/** Equal props, except a change between two committed viewports (null ↔ one still counts). */
export function sameIgnoringCommitted(a: LayerProps, b: LayerProps): boolean {
  for (const key of Object.keys(a) as (keyof LayerProps)[]) {
    if (key === 'committed') {
      if ((a.committed === null) !== (b.committed === null)) return false;
      continue;
    }
    if (a[key] !== b[key]) return false;
  }
  return Object.keys(a).length === Object.keys(b).length;
}

export const memoIgnoringCommitted = (layer: ComponentType<LayerProps>) =>
  memo(layer, sameIgnoringCommitted);
