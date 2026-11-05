// Test helpers for the UI primitives and the panel (happy-dom): mount a React tree, load the real
// token and component CSS so computed sizes can be checked, and dispatch events.
import { readFileSync } from 'node:fs';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { touchTarget } from '../../lib/core/tokens';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export { touchTarget };

const mounted: { root: Root; container: HTMLElement }[] = [];

/** Puts tokens.css and the given component stylesheets into the document. */
export function loadCss(...paths: string[]) {
  for (const p of ['src/styles/tokens.css', ...paths]) {
    if (document.head.querySelector(`style[data-src="${p}"]`)) continue;
    const style = document.createElement('style');
    style.dataset.src = p;
    style.textContent = readFileSync(p, 'utf8');
    document.head.append(style);
  }
}

export async function render(node: ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(node));
  return {
    container,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
  };
}

export function cleanup() {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  document.body.innerHTML = '';
}

export const click = (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

export const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });

export const pointer = (el: Element, type: string, init: PointerEventInit = {}) =>
  act(async () => {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        button: 0,
        ...init,
      }),
    );
  });

export const focus = (el: HTMLElement) =>
  act(async () => {
    el.focus();
  });

/** The computed hit size, from the CSS min/explicit sizes (happy-dom does no layout). */
export function hitSize(el: Element) {
  const cs = getComputedStyle(el);
  const px = (...vals: string[]) => Math.max(0, ...vals.map((v) => parseFloat(v) || 0));
  return { width: px(cs.minWidth, cs.width), height: px(cs.minHeight, cs.height) };
}

/** Asserts an element's hit area is at least 44 × 44 px (or only the height, for full-width rows). */
export function expectHitArea(el: Element, opts: { heightOnly?: boolean } = {}) {
  const { width, height } = hitSize(el);
  if (height < touchTarget || (!opts.heightOnly && width < touchTarget)) {
    throw new Error(
      `${el.outerHTML.slice(0, 80)}… hit area ${width}×${height} px is under ${touchTarget} px`,
    );
  }
}
