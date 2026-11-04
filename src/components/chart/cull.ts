// Vertical culling for the x-scaled groups. The chart can be far taller than the window (many
// lanes), and Chrome paints an SVG's whole subtree on every frame of a gesture, so geometry outside
// the window's y band (ViewportChannel.band) is set to display: none. Geometry never moves
// vertically, so this only changes when the page scrolls or the lanes change, never per frame.
//
// Elements opt in with data-y0 / data-y1: their chart y extent.
import { useLayoutEffect, type RefObject } from 'react';
import type { ViewportChannel, YBand } from './viewport';

/** The data attributes that mark an element as cullable over chart y [y0, y1]. */
export const yExtent = (y0: number, y1: number) => ({
  'data-y0': Math.floor(y0),
  'data-y1': Math.ceil(y1),
});

/** Hides the marked elements under `root` that lie outside the band; shows the rest. */
export function cullByBand(root: ParentNode, band: YBand): void {
  for (const el of root.querySelectorAll<SVGElement>('[data-y0][data-y1]')) {
    const off = Number(el.dataset.y1) < band[0] || Number(el.dataset.y0) > band[1];
    if (off) {
      if (el.getAttribute('display') !== 'none') el.setAttribute('display', 'none');
    } else if (el.hasAttribute('display')) el.removeAttribute('display');
  }
}

/** Keeps the groups' marked elements culled to the band: after every render, and on each change. */
export function useBandCull(
  refs: readonly RefObject<SVGGElement | null>[],
  channel: ViewportChannel,
): void {
  useLayoutEffect(() => {
    let last: YBand | null = null;
    const run = () => {
      const band = channel.band();
      if (band === last) return;
      last = band;
      for (const r of refs) if (r.current) cullByBand(r.current, band);
    };
    run();
    return channel.subscribe(run);
  });
}
