// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Disclosure from './Disclosure';
import { cleanup, click, expectHitArea, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

describe('Disclosure', () => {
  it('toggles a region from a button with aria-expanded / aria-controls', async () => {
    const { container } = await render(
      <Disclosure summary="እንዴት ታወቀ?">
        <p>ማብራሪያ</p>
      </Disclosure>,
    );
    const b = container.querySelector('button')!;
    const region = container.querySelector<HTMLElement>('.ui-disclosure-body')!;
    expect(b.textContent).toContain('እንዴት ታወቀ?');
    expect(b.getAttribute('aria-controls')).toBe(region.id);
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(region.hidden).toBe(true);
    expect(b.querySelector('.ui-disclosure-marker')!.getAttribute('aria-hidden')).toBe('true');
    expectHitArea(b);

    await click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(region.hidden).toBe(false);
    await click(b);
    expect(region.hidden).toBe(true);
  });

  it('can start open, and can be controlled', async () => {
    const onOpenChange = vi.fn();
    const { container, rerender } = await render(
      <Disclosure summary="s" open={false} onOpenChange={onOpenChange}>
        x
      </Disclosure>,
    );
    const b = container.querySelector('button')!;
    await click(b);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(b.getAttribute('aria-expanded')).toBe('false'); // the parent decides
    await rerender(
      <Disclosure summary="s" open onOpenChange={onOpenChange}>
        x
      </Disclosure>,
    );
    expect(b.getAttribute('aria-expanded')).toBe('true');

    const second = await render(
      <Disclosure summary="s" defaultOpen>
        x
      </Disclosure>,
    );
    expect(second.container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true');
  });
});
