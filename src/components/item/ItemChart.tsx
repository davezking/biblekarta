// The chart on an item page, opened on that item (FR-10, demo step 9). The page has the chart
// state (`search`, from item-pages.ts) but its own path (/p/ahab/), so before the chart reads the
// URL (url-sync.ts, once the chart is loaded and zoom is attached) this writes the state into the
// address bar without a new history entry. It is the same as following the /?… link, and the
// chart then keeps the URL in step as on the home page. A URL that already has a query (a shared
// /p/ahab/?z=3 link) is left as it is.
import { useLayoutEffect } from 'react';
import Chart from '../chart/Chart';
import type { Lang } from '../../lib/i18n';

export interface ItemChartProps {
  search: string;
  lang?: Lang;
}

/** The URL to replace the current one with, or null to leave it. */
export function itemUrl(
  loc: Pick<Location, 'pathname' | 'search' | 'hash'>,
  search: string,
): string | null {
  if (loc.search || !search) return null;
  return `${loc.pathname}${search}${loc.hash}`;
}

export default function ItemChart({ search, lang = 'am' }: ItemChartProps) {
  // A layout effect of this parent runs before the chart's data loads and its URL sync starts.
  useLayoutEffect(() => {
    const url = itemUrl(window.location, search);
    if (url) window.history.replaceState(window.history.state, '', url);
  }, [search]);
  return <Chart lang={lang} syncUrl />;
}
