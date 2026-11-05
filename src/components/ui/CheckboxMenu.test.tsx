// @vitest-environment happy-dom
import { act, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createT } from '../../lib/i18n';
import CheckboxMenu from './CheckboxMenu';
import { cleanup, click, expectHitArea, key, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

function Harness({ onToggle }: { onToggle?: (id: string, on: boolean) => void }) {
  const [on, setOn] = useState<Record<string, boolean>>({ a: true, b: true });
  return (
    <CheckboxMenu
      label="መስመሮች"
      items={[
        { id: 'a', label: 'ሀ', checked: on.a!, lang: 'am' },
        { id: 'b', label: 'ለ', checked: on.b!, lang: 'am' },
      ]}
      onToggle={(id, v) => {
        setOn((o) => ({ ...o, [id]: v }));
        onToggle?.(id, v);
      }}
    />
  );
}

describe('CheckboxMenu', () => {
  it('opens a labelled group of checkboxes from an expanded button, focusing the first', async () => {
    const { container } = await render(<Harness />);
    const button = container.querySelector<HTMLButtonElement>('.ui-menu > button')!;
    expect(button.textContent).toBe('መስመሮች');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expectHitArea(button);
    expect(container.querySelector('input')).toBeNull();

    await click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const group = container.querySelector('[role="group"]')!;
    expect(button.getAttribute('aria-controls')).toBe(group.id);
    expect(group.getAttribute('aria-label')).toBe('መስመሮች');
    const boxes = [...group.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(boxes.map((b) => b.dataset.id)).toEqual(['a', 'b']);
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(document.activeElement).toBe(boxes[0]);
    // Each checkbox is named by its label row, which is the ≥ 44 px hit area.
    for (const b of boxes) {
      const row = b.closest('label')!;
      expect(row.textContent).toBe(b.dataset.id === 'a' ? 'ሀ' : 'ለ');
      expect(row.getAttribute('lang')).toBe('am');
      expectHitArea(row, { heightOnly: true });
    }
  });

  it('toggles a checkbox', async () => {
    const onToggle = vi.fn();
    const { container } = await render(<Harness onToggle={onToggle} />);
    await click(container.querySelector('.ui-menu > button')!);
    const b = container.querySelector<HTMLInputElement>('input[data-id="b"]')!;
    await click(b);
    expect(onToggle).toHaveBeenCalledWith('b', false);
    expect(container.querySelector<HTMLInputElement>('input[data-id="b"]')!.checked).toBe(false);
  });

  it('closes on Esc and returns focus to the button', async () => {
    const { container } = await render(<Harness />);
    const button = container.querySelector<HTMLButtonElement>('.ui-menu > button')!;
    await click(button);
    await key(document.activeElement!, 'Escape');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('closes on a press outside, not inside', async () => {
    const { container } = await render(<Harness />);
    const button = container.querySelector<HTMLButtonElement>('.ui-menu > button')!;
    await click(button);
    await act(async () => {
      container
        .querySelector('input')!
        .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await act(async () => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when focus moves out of it, not when it moves inside', async () => {
    const { container } = await render(
      <>
        <Harness />
        <button type="button" id="after">
          after
        </button>
      </>,
    );
    const button = container.querySelector<HTMLButtonElement>('.ui-menu > button')!;
    await click(button);
    const [a, b] = [...container.querySelectorAll<HTMLInputElement>('input')];
    await act(async () => b!.focus());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(a).toBeDefined();
    await act(async () => container.querySelector<HTMLButtonElement>('#after')!.focus());
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('defaults its name to ui.open_menu', async () => {
    const t = createT('en');
    const { container } = await render(<CheckboxMenu items={[]} onToggle={() => {}} t={t} />);
    expect(container.querySelector('button')!.textContent).toBe('Open menu');
  });
});
