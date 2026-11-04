// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createWriter } from './dom-writer';

describe('createWriter', () => {
  it('writes an attribute only when its value changes', () => {
    const el = document.createElement('div');
    const set = vi.spyOn(el, 'setAttribute');
    const remove = vi.spyOn(el, 'removeAttribute');
    const write = createWriter();
    write(el, 'x', '1');
    write(el, 'x', '1');
    expect(set).toHaveBeenCalledTimes(1);
    write(el, 'x', '2');
    expect(el.getAttribute('x')).toBe('2');
    write(el, 'x', null);
    write(el, 'x', null);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(el.hasAttribute('x')).toBe(false);
  });

  it('removes an attribute the first time it is asked to, even if never written', () => {
    const el = document.createElement('div');
    el.setAttribute('visibility', 'hidden');
    createWriter()(el, 'visibility', null);
    expect(el.hasAttribute('visibility')).toBe(false);
  });

  it('keeps separate memories per writer (one per render)', () => {
    const el = document.createElement('div');
    createWriter()(el, 'x', '1');
    el.setAttribute('x', '9'); // React re-rendered it
    createWriter()(el, 'x', '1');
    expect(el.getAttribute('x')).toBe('1');
  });
});
