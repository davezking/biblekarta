// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import IconButton from './IconButton';
import Tooltip, { LONG_PRESS_MS } from './Tooltip';
import { cleanup, click, expectHitArea, focus, key, loadCss, pointer, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount(onClick = vi.fn()) {
  const r = await render(
    <Tooltip content="አጉላ">
      <IconButton label="zoom" onClick={onClick}>
        +
      </IconButton>
    </Tooltip>,
  );
  const trigger = r.container.querySelector('button')!;
  const tip = r.container.querySelector<HTMLElement>('[role="tooltip"]')!;
  const wrap = r.container.querySelector('.ui-tooltip')!;
  return { trigger, tip, wrap, onClick };
}

describe('Tooltip', () => {
  it('describes its trigger and starts hidden', async () => {
    const { trigger, tip } = await mount();
    expect(trigger.getAttribute('aria-describedby')).toBe(tip.id);
    expect(tip.textContent).toBe('አጉላ');
    expect(tip.hidden).toBe(true);
    expectHitArea(trigger);
  });

  it('shows on keyboard focus, hides on blur and on Esc', async () => {
    const { trigger, tip } = await mount();
    await focus(trigger);
    expect(tip.hidden).toBe(false);
    await key(trigger, 'Escape');
    expect(tip.hidden).toBe(true);
    await act(async () => trigger.blur());
    await focus(trigger);
    expect(tip.hidden).toBe(false);
    await act(async () => trigger.blur());
    expect(tip.hidden).toBe(true);
  });

  it('does not show on a focus that is not :focus-visible (a tap on Android)', async () => {
    const { trigger, tip } = await mount();
    const matches = trigger.matches.bind(trigger);
    vi.spyOn(trigger, 'matches').mockImplementation((sel: string) =>
      sel === ':focus-visible' ? false : matches(sel),
    );
    await focus(trigger);
    expect(tip.hidden).toBe(true);
  });

  it('shows on mouse hover and hides when the mouse leaves', async () => {
    // React derives enter/leave from pointerover/pointerout and their relatedTarget.
    const { trigger, tip } = await mount();
    await pointer(trigger, 'pointerover', { pointerType: 'mouse', relatedTarget: document.body });
    expect(tip.hidden).toBe(false);
    await pointer(trigger, 'pointerout', { pointerType: 'mouse', relatedTarget: document.body });
    expect(tip.hidden).toBe(true);
  });

  it('shows after a long-press on touch, swallowing that tap; a short tap just clicks', async () => {
    vi.useFakeTimers();
    const { trigger, tip, onClick } = await mount();
    // Short tap: no tooltip, the click goes through.
    await pointer(trigger, 'pointerdown');
    await pointer(trigger, 'pointerup');
    await act(async () => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(tip.hidden).toBe(true);
    await click(trigger);
    expect(onClick).toHaveBeenCalledOnce();

    // Long press: the tooltip shows, and the click that follows the lift is swallowed.
    await pointer(trigger, 'pointerdown');
    await act(async () => vi.advanceTimersByTime(LONG_PRESS_MS));
    expect(tip.hidden).toBe(false);
    await pointer(trigger, 'pointerup');
    await click(trigger);
    expect(onClick).toHaveBeenCalledOnce();
    expect(tip.hidden).toBe(false);

    // A press elsewhere hides it.
    await pointer(document.body, 'pointerdown');
    expect(tip.hidden).toBe(true);
  });
});
