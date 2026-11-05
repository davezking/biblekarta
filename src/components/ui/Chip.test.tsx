// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Chip from './Chip';
import { cleanup, click, expectHitArea, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

describe('Chip', () => {
  it('is static text, not focusable, without onClick', async () => {
    const { container } = await render(
      <Chip tone="red" lang="am" title="ግምት">
        ግምታዊ
      </Chip>,
    );
    const chip = container.querySelector('.ui-chip')!;
    expect(chip.tagName).toBe('SPAN');
    expect(chip.getAttribute('data-tone')).toBe('red');
    expect(chip.getAttribute('lang')).toBe('am');
    expect(chip.getAttribute('title')).toBe('ግምት');
    expect(chip.textContent).toBe('ግምታዊ');
    expect(container.querySelector('button, [tabindex]')).toBeNull();
  });

  it('is a named button with a ≥ 44 px hit area around a small pill when clickable', async () => {
    const onClick = vi.fn();
    const { container } = await render(
      <Chip onClick={onClick} label="ስለ እርግጠኝነት">
        እርግጠኛ
      </Chip>,
    );
    const b = container.querySelector('button')!;
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('ስለ እርግጠኝነት');
    expect(b.querySelector('.ui-chip')!.textContent).toBe('እርግጠኛ');
    expectHitArea(b);
    await click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
