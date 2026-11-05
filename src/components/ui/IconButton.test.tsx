// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import IconButton from './IconButton';
import { cleanup, click, expectHitArea, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

describe('IconButton', () => {
  it('is named by its label, hides the icon, and has a ≥ 44 × 44 px hit area', async () => {
    const onClick = vi.fn();
    const { container } = await render(
      <IconButton label="ዝጋ" onClick={onClick}>
        ×
      </IconButton>,
    );
    const b = container.querySelector('button')!;
    expect(b.getAttribute('aria-label')).toBe('ዝጋ');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.querySelector('[aria-hidden="true"]')!.textContent).toBe('×');
    expectHitArea(b);
    await click(b);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the hit area in the bare variant', async () => {
    const { container } = await render(
      <IconButton label="x" variant="bare">
        ×
      </IconButton>,
    );
    expectHitArea(container.querySelector('button')!);
  });
});
