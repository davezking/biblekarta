// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import Button from './Button';
import { cleanup, click, expectHitArea, key, loadCss, render } from './ui.testutil';

beforeAll(() => loadCss('src/components/ui/ui.css'));
afterEach(cleanup);

describe('Button', () => {
  it('is a native type="button" named by its text, with a ≥ 44 px hit area', async () => {
    const onClick = vi.fn();
    const { container } = await render(<Button onClick={onClick}>ክፈት</Button>);
    const b = container.querySelector('button')!;
    expect(b.getAttribute('type')).toBe('button');
    expect(b.textContent).toBe('ክፈት');
    expect(b.className).toBe('ui-button');
    expectHitArea(b);
    await click(b);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is reachable by keyboard (a native button in the tab order)', async () => {
    const { container } = await render(<Button>ክፈት</Button>);
    const b = container.querySelector('button')!;
    expect(b.tabIndex).toBe(0);
    b.focus();
    expect(document.activeElement).toBe(b);
    await key(b, 'Enter'); // native activation; nothing to throw
  });

  it('passes through variant, class, disabled and a ref', async () => {
    let ref: HTMLButtonElement | null = null;
    const { container } = await render(
      <Button
        variant="primary"
        className="extra"
        disabled
        ref={(el) => {
          ref = el;
        }}
      >
        x
      </Button>,
    );
    const b = container.querySelector('button')!;
    expect(b.dataset.variant).toBe('primary');
    expect(b.className).toBe('ui-button extra');
    expect(b.disabled).toBe(true);
    expect(ref).toBe(b);
  });
});
