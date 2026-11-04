// Viewport culling: layers render only the items near the screen. Pure.

/** Items whose x-span (k = 1) intersects [x0, x1] widened by `marginPx` on each side. */
export function visibleItems<T extends { x0: number; x1: number }>(
  items: readonly T[],
  [x0, x1]: [number, number],
  marginPx: number,
): T[] {
  const lo = Math.min(x0, x1) - marginPx;
  const hi = Math.max(x0, x1) + marginPx;
  return items.filter((it) => it.x1 >= lo && it.x0 <= hi);
}
