// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createT } from '../../lib/i18n';
import CheckboxMenu from '../ui/CheckboxMenu';
import Disclosure from '../ui/Disclosure';
import { cleanup, click, expectHitArea, key, loadCss, pointer, render } from '../ui/ui.testutil';
import Panel, { CLOSE_DISTANCE, snapAfterDrag, snapOffset, SHEET_TOP_GAP } from './Panel';

const VH = 800;

/** A matchMedia stub: `desktop` decides the 1024 px query; reduced motion is off. */
function stubMedia(desktop: boolean) {
  const listeners = new Set<() => void>();
  const state = { desktop };
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width: 1024px') ? state.desktop : false,
    media: q,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return {
    set: (d: boolean) =>
      act(async () => {
        state.desktop = d;
        for (const cb of listeners) cb();
      }),
  };
}

beforeAll(() => loadCss('src/components/ui/ui.css', 'src/components/panel/panel.css'));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" id="opener" onClick={() => setOpen(true)}>
        open
      </button>
      <Panel
        open={open}
        onClose={() => {
          setOpen(false);
          onClose?.();
        }}
        title="ኤልያስ"
        lang="am"
        t={createT('en')}
      >
        <a href="#x">first link</a>
        <button type="button" id="inner">
          inner
        </button>
      </Panel>
    </>
  );
}

async function mountOpen(desktop: boolean) {
  const media = stubMedia(desktop);
  const r = await render(<Harness />);
  const opener = r.container.querySelector<HTMLButtonElement>('#opener')!;
  opener.focus();
  await click(opener);
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  return { ...r, media, opener, dialog };
}

describe('snap points', () => {
  it('half shows the bottom half of the viewport; full is at the top', () => {
    expect(snapOffset('full', VH)).toBe(0);
    expect(snapOffset('half', VH)).toBe(VH - SHEET_TOP_GAP - VH / 2);
  });

  it('decides the snap from where a drag ends', () => {
    const half = snapOffset('half', VH);
    expect(snapAfterDrag('half', -half, VH)).toBe('full');
    expect(snapAfterDrag('half', -half / 2 + 1, VH)).toBe('half');
    expect(snapAfterDrag('half', -half / 2 - 1, VH)).toBe('full');
    expect(snapAfterDrag('half', CLOSE_DISTANCE, VH)).toBe('half');
    expect(snapAfterDrag('half', CLOSE_DISTANCE + 1, VH)).toBe('close');
    expect(snapAfterDrag('full', 50, VH)).toBe('full');
    expect(snapAfterDrag('full', half, VH)).toBe('half');
    expect(snapAfterDrag('full', half + CLOSE_DISTANCE + 1, VH)).toBe('close');
  });
});

describe('Panel layout', () => {
  it('is a side panel at ≥ 1024 px: a non-modal dialog labelled by its title', async () => {
    const { dialog } = await mountOpen(true);
    const d = dialog()!;
    expect(d.dataset.layout).toBe('side');
    expect(d.classList.contains('panel-side')).toBe(true);
    expect(d.hasAttribute('aria-modal')).toBe(false);
    expect(d.querySelector('.panel-handle')).toBeNull();
    const title = document.getElementById(d.getAttribute('aria-labelledby')!)!;
    expect(title.textContent).toBe('ኤልያስ');
    expect(title.getAttribute('lang')).toBe('am');
    expect(getComputedStyle(d).position).toBe('fixed');
    expect(document.querySelector('.panel-backdrop')).toBeNull();
  });

  it('is a bottom sheet below 1024 px, opening at half height', async () => {
    const { dialog } = await mountOpen(false);
    const d = dialog()!;
    expect(d.dataset.layout).toBe('sheet');
    expect(d.dataset.snap).toBe('half');
    expect(d.hasAttribute('aria-modal')).toBe(false);
    const handle = d.querySelector<HTMLButtonElement>('.panel-handle')!;
    expect(handle.getAttribute('aria-label')).toBe('Resize the panel');
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expectHitArea(handle, { heightOnly: true });
  });

  it('switches layout when the viewport crosses 1024 px, keeping focus inside', async () => {
    const { dialog, media } = await mountOpen(true);
    expect(dialog()!.dataset.layout).toBe('side');
    await media.set(false);
    expect(dialog()!.dataset.layout).toBe('sheet');
    expect(dialog()!.contains(document.activeElement)).toBe(true);
  });

  it('has a close button named ui.close with a ≥ 44 px hit area', async () => {
    const { dialog } = await mountOpen(true);
    const close = dialog()!.querySelector<HTMLButtonElement>('.panel-close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    expectHitArea(close);
  });
});

describe('Panel open / close and focus', () => {
  for (const desktop of [true, false]) {
    const name = desktop ? 'side panel' : 'sheet';

    it(`${name}: moves focus in on open, Tab reaches its controls`, async () => {
      const { dialog } = await mountOpen(desktop);
      const d = dialog()!;
      expect(document.activeElement).toBe(d);
      const focusables = d.querySelectorAll('button, a[href]');
      expect(focusables.length).toBeGreaterThan(0);
    });

    it(`${name}: Esc closes it and focus returns to the opener`, async () => {
      const { dialog, opener } = await mountOpen(desktop);
      await key(dialog()!, 'Escape');
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(opener);
    });

    it(`${name}: the close button closes it and focus returns to the opener`, async () => {
      const { dialog, opener } = await mountOpen(desktop);
      await click(dialog()!.querySelector('.panel-close')!);
      expect(dialog()).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  }

  it('renders nothing while closed', async () => {
    stubMedia(true);
    await render(<Harness />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('bottom sheet gestures', () => {
  const handleOf = (d: HTMLElement) => d.querySelector<HTMLButtonElement>('.panel-handle')!;

  async function drag(handle: HTMLElement, dy: number) {
    await pointer(handle, 'pointerdown', { clientY: 600 });
    await pointer(handle, 'pointermove', { clientY: 600 + dy / 2 });
    await pointer(handle, 'pointermove', { clientY: 600 + dy });
    await pointer(handle, 'pointerup', { clientY: 600 + dy });
    // The click a mouse sends after the lift (detail 1); it must not toggle.
    await act(async () => {
      handle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
  }

  it('drags up to full height, where it is modal and traps focus', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
    const { dialog } = await mountOpen(false);
    const d = dialog()!;
    await drag(handleOf(d), -snapOffset('half', VH));
    expect(d.dataset.snap).toBe('full');
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(handleOf(d).getAttribute('aria-expanded')).toBe('true');
    expect(d.style.height).toBe(''); // the drag size is cleared after snapping
    expect(document.querySelector('.panel-backdrop')).not.toBeNull();

    // Focus trap: Tab from the last control wraps to the first, Shift+Tab back again.
    const items = [...d.querySelectorAll<HTMLElement>('button, a[href]')];
    const first = items[0]!;
    const last = items[items.length - 1]!;
    last.focus();
    await key(last, 'Tab');
    expect(document.activeElement).toBe(first);
    await key(first, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('moves with the finger while dragging', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
    const { dialog } = await mountOpen(false);
    const d = dialog()!;
    const handle = handleOf(d);
    await pointer(handle, 'pointerdown', { clientY: 600 });
    await pointer(handle, 'pointermove', { clientY: 500 });
    // The sheet is resized (top edge follows the finger), never moved off screen.
    expect(d.style.height).toBe(`${VH / 2 + 100}px`);
    expect(d.hasAttribute('data-dragging')).toBe(true);
    await pointer(handle, 'pointerup', { clientY: 500 });
    expect(d.hasAttribute('data-dragging')).toBe(false);
  });

  it('a short drag down from full returns to half; a swipe down from half closes', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
    const onClose = vi.fn();
    stubMedia(false);
    const r = await render(<Harness onClose={onClose} />);
    const opener = r.container.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    await click(opener);
    const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
    await drag(handleOf(d), -snapOffset('half', VH));
    expect(d.dataset.snap).toBe('full');
    await drag(handleOf(d), snapOffset('half', VH));
    expect(d.dataset.snap).toBe('half');
    expect(d.hasAttribute('aria-modal')).toBe(false);
    await drag(handleOf(d), CLOSE_DISTANCE + 40);
    expect(onClose).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('the handle works by keyboard: Enter toggles, arrows move, ArrowDown at half closes', async () => {
    const { dialog, opener } = await mountOpen(false);
    const d = dialog()!;
    const handle = handleOf(d);
    await click(handle); // keyboard activation sends a click with no pointer drag
    expect(d.dataset.snap).toBe('full');
    await click(handle);
    expect(d.dataset.snap).toBe('half');
    await key(handle, 'ArrowUp');
    expect(d.dataset.snap).toBe('full');
    await key(handle, 'ArrowDown');
    expect(d.dataset.snap).toBe('half');
    await key(handle, 'ArrowDown');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('review fixes', () => {
  function Rich() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          open
        </button>
        <Panel open={open} onClose={() => setOpen(false)} title="t" t={createT('en')}>
          <button type="button" id="visible">
            v
          </button>
          <CheckboxMenu
            label="m"
            items={[{ id: 'a', label: 'a', checked: true }]}
            onToggle={() => {}}
          />
          <Disclosure summary="how">
            <button type="button" id="hidden-inside">
              h
            </button>
          </Disclosure>
        </Panel>
      </>
    );
  }

  async function openRich() {
    stubMedia(false);
    const r = await render(<Rich />);
    const opener = r.container.querySelector<HTMLButtonElement>('#opener')!;
    opener.focus();
    await click(opener);
    const d = document.querySelector<HTMLElement>('[role="dialog"]')!;
    return { d, opener, handle: d.querySelector<HTMLButtonElement>('.panel-handle')! };
  }

  it('the focus trap skips controls in a closed Disclosure', async () => {
    const { d, handle } = await openRich();
    await click(handle);
    expect(d.dataset.snap).toBe('full');
    const summary = d.querySelector<HTMLElement>('.ui-disclosure-summary')!;
    summary.focus();
    await key(summary, 'Tab');
    expect(document.activeElement).toBe(handle); // wrapped to the first control
    await key(handle, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(summary);
  });

  it('a keyboard activation of the handle toggles even right after a touch drag', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
    const { d, handle } = await openRich();
    await pointer(handle, 'pointerdown', { clientY: 600 });
    await pointer(handle, 'pointermove', { clientY: 620 });
    await pointer(handle, 'pointerup', { clientY: 620 }); // stays at half; no click follows
    expect(d.dataset.snap).toBe('half');
    await act(async () => {
      handle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    expect(d.dataset.snap).toBe('full');
  });

  it('the click a mouse sends right after a drag does not toggle', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(VH);
    const { d, handle } = await openRich();
    await pointer(handle, 'pointerdown', { clientY: 600, pointerType: 'mouse' });
    await pointer(handle, 'pointermove', { clientY: 620, pointerType: 'mouse' });
    await pointer(handle, 'pointerup', { clientY: 620, pointerType: 'mouse' });
    await act(async () => {
      handle.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(d.dataset.snap).toBe('half');
  });

  it('Esc in a menu inside the panel closes the menu, not the panel', async () => {
    const { d } = await openRich();
    const menuButton = d.querySelector<HTMLButtonElement>('.ui-menu > button')!;
    await click(menuButton);
    expect(menuButton.getAttribute('aria-expanded')).toBe('true');
    await key(document.activeElement!, 'Escape');
    expect(menuButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menuButton);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await key(menuButton, 'Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('half height: the sheet is half the viewport tall, so nothing focusable is off screen', () => {
    const css = readFileSync('src/components/panel/panel.css', 'utf8');
    expect(css).toMatch(/\.panel-sheet\[data-snap='half'\] \{\s*height: 50dvh;/);
    expect(css).not.toMatch(/\.panel-sheet[^{]*\{[^}]*translateY/);
  });
});

describe('reduced motion', () => {
  it('turns off every panel and primitive animation under prefers-reduced-motion', () => {
    for (const [file, animated] of [
      ['src/components/panel/panel.css', ['.panel-side', '.panel-sheet']],
      [
        'src/components/ui/ui.css',
        ['.ui-button', '.ui-switch-option', '.ui-disclosure-summary', '.ui-disclosure-marker'],
      ],
    ] as const) {
      const css = readFileSync(file, 'utf8');
      const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
      expect(block.length).toBeGreaterThan(0);
      expect(block).toMatch(/transition:\s*none/);
      expect(block).toMatch(/animation:\s*none/);
      for (const sel of animated) expect(block).toContain(sel);
      // Every rule outside the block that animates uses a motion token.
      const outside = css.slice(0, css.indexOf('@media (prefers-reduced-motion: reduce)'));
      for (const m of outside.matchAll(/(?:transition|animation):([^;]+);/g)) {
        if (m[1]!.trim() === 'none') continue;
        expect(m[1]).toMatch(/var\(--motion-(fast|base|slow)\)/);
      }
    }
  });

  it('computes no transition or animation for the panel when reduced motion is on', async () => {
    const settings = (
      window as unknown as { happyDOM: { settings: { device: { prefersReducedMotion: string } } } }
    ).happyDOM.settings.device;
    const { dialog } = await mountOpen(false);
    const before = getComputedStyle(dialog()!);
    // happy-dom computes the shorthands only.
    expect(before.animation).toContain('panel-rise');
    expect(before.transition).toContain('height');
    settings.prefersReducedMotion = 'reduce';
    try {
      // A fresh style sheet makes happy-dom recompute styles under the new setting.
      document.head.append(document.createElement('style'));
      const cs = getComputedStyle(dialog()!);
      expect(cs.animation).toMatch(/^none/);
      expect(cs.transition).toMatch(/^none/);
    } finally {
      settings.prefersReducedMotion = 'no-preference';
    }
  });
});
