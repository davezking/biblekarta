import { describe, expect, it, vi } from 'vitest';
import { createChartStore, INITIAL_STATE } from './state';

describe('createChartStore', () => {
  it('starts on the scholarly axis with nothing selected, hidden or committed', () => {
    expect(createChartStore().getSnapshot()).toEqual(INITIAL_STATE);
    expect(createChartStore({ axis: 'traditional' }).getSnapshot().axis).toBe('traditional');
  });

  it('notifies subscribers and replaces the snapshot on a real change only', () => {
    const store = createChartStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const first = store.getSnapshot();

    store.setAxis('scholarly');
    store.select(null);
    store.setHiddenLanes([]);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(first);

    store.setAxis('traditional');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(first);
    expect(store.getSnapshot().axis).toBe('traditional');

    unsubscribe();
    store.setAxis('scholarly');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('selects by kind and id, ignoring a repeat of the same selection', () => {
    const store = createChartStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.select({ kind: 'reign', id: 'ahab' });
    store.select({ kind: 'reign', id: 'ahab' });
    expect(listener).toHaveBeenCalledTimes(1);
    store.select({ kind: 'person', id: 'ahab' });
    expect(store.getSnapshot().selection).toEqual({ kind: 'person', id: 'ahab' });
    store.select(null);
    expect(store.getSnapshot().selection).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('keeps hidden lanes sorted and unique', () => {
    const store = createChartStore();
    store.setLaneHidden('sidon', true);
    store.setLaneHidden('aram', true);
    store.setLaneHidden('aram', true);
    expect(store.getSnapshot().hiddenLanes).toEqual(['aram', 'sidon']);
    store.setLaneHidden('aram', false);
    expect(store.getSnapshot().hiddenLanes).toEqual(['sidon']);
    store.setHiddenLanes(['egypt', 'egypt', 'aram']);
    expect(store.getSnapshot().hiddenLanes).toEqual(['aram', 'egypt']);
  });

  it('commits a viewport only when it differs', () => {
    const store = createChartStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.commitViewport({ x: -10, k: 2, width: 800 });
    store.commitViewport({ x: -10, k: 2, width: 800 });
    expect(listener).toHaveBeenCalledTimes(1);
    store.commitViewport({ x: -11, k: 2, width: 800 });
    expect(store.getSnapshot().committedViewport).toEqual({ x: -11, k: 2, width: 800 });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
