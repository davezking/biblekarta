// @vitest-environment happy-dom
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SegmentedSwitch from './SegmentedSwitch';
import { cleanup, click, expectHitArea, key, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

const OPTIONS = [
  { value: 'a', label: 'ሀ' },
  { value: 'b', label: 'ለ' },
  { value: 'c', label: 'ሐ' },
] as const;
type V = (typeof OPTIONS)[number]['value'];

function Harness({ onChange }: { onChange?: (v: V) => void }) {
  const [v, setV] = useState<V>('a');
  return (
    <SegmentedSwitch
      label="ምርጫ"
      options={OPTIONS}
      value={v}
      onChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
    />
  );
}

const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
const checked = (c: HTMLElement) =>
  radios(c).find((r) => r.getAttribute('aria-checked') === 'true')!.dataset.value;

describe('SegmentedSwitch', () => {
  it('is a labelled radio group with one checked, tabbable option', async () => {
    const { container } = await render(<Harness />);
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('ምርጫ');
    const rs = radios(container);
    expect(rs.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(rs.map((r) => r.tabIndex)).toEqual([0, -1, -1]);
    expect(rs.map((r) => r.textContent)).toEqual(['ሀ', 'ለ', 'ሐ']);
    for (const r of rs) expectHitArea(r);
  });

  it('moves and selects with the arrow keys, wrapping, and Home/End', async () => {
    const onChange = vi.fn();
    const { container } = await render(<Harness onChange={onChange} />);
    const first = radios(container)[0]!;
    first.focus();
    await key(first, 'ArrowRight');
    expect(checked(container)).toBe('b');
    expect(document.activeElement).toBe(radios(container)[1]);
    await key(document.activeElement!, 'ArrowDown');
    expect(checked(container)).toBe('c');
    await key(document.activeElement!, 'ArrowRight'); // wraps
    expect(checked(container)).toBe('a');
    await key(document.activeElement!, 'ArrowLeft'); // wraps back
    expect(checked(container)).toBe('c');
    await key(document.activeElement!, 'Home');
    expect(checked(container)).toBe('a');
    await key(document.activeElement!, 'End');
    expect(checked(container)).toBe('c');
    expect(document.activeElement).toBe(radios(container)[2]);
    expect(radios(container).map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(['b', 'c', 'a', 'c', 'a', 'c']);
  });

  it('selects on click, and ignores a click on the checked option', async () => {
    const onChange = vi.fn();
    const { container } = await render(<Harness onChange={onChange} />);
    await click(radios(container)[0]!);
    expect(onChange).not.toHaveBeenCalled();
    await click(radios(container)[1]!);
    expect(onChange).toHaveBeenCalledWith('b');
    expect(checked(container)).toBe('b');
  });
});
