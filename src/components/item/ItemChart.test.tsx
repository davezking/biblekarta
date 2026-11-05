// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '../ui/ui.testutil';
import ItemChart, { itemUrl } from './ItemChart';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const loc = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

describe('itemUrl', () => {
  it("adds the item's chart state to a bare item URL", () => {
    expect(itemUrl(loc('/p/ahab/'), '?sel=p:ahab')).toBe('/p/ahab/?sel=p:ahab');
    expect(itemUrl(loc('/p/ahab/', '', '#x'), '?sel=p:ahab')).toBe('/p/ahab/?sel=p:ahab#x');
  });

  it('leaves a URL that already has state (a shared link), or when there is none to add', () => {
    expect(itemUrl(loc('/p/ahab/', '?z=3'), '?sel=p:ahab')).toBeNull();
    expect(itemUrl(loc('/p/ahab/'), '')).toBeNull();
  });
});

describe('ItemChart', () => {
  it('writes the state into the address bar on mount, without a new history entry', async () => {
    // The chart's data fetch never resolves here: the URL is written before the chart loads.
    vi.stubGlobal('fetch', () => new Promise(() => {}));
    window.history.replaceState(null, '', '/p/ahab/');
    const push = vi.spyOn(window.history, 'pushState');
    const length = window.history.length;
    await render(<ItemChart search="?y=-862&z=2.51&sel=p:ahab" />);
    expect(window.location.pathname + window.location.search).toBe(
      '/p/ahab/?y=-862&z=2.51&sel=p:ahab',
    );
    expect(push).not.toHaveBeenCalled();
    expect(window.history.length).toBe(length);
  });
});
