// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { harag, ink } from '../../lib/core/tokens';
import HaragBand, { type HaragHeight } from './HaragBand';
import TitleCartouche from './TitleCartouche';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(el: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(el));
  return container;
}

/** The approved mockup's pattern for a height: hg1 (26), hg2 (18), hg3 (16). */
function mockupPattern(h: HaragHeight): Element {
  const html = readFileSync('design-reference/board5-desktop.html', 'utf8');
  const id = { 26: 'hg1', 18: 'hg2', 16: 'hg3' }[h];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.getElementById(id)!;
}

/** A pattern's children as comparable records, with colours upper-cased. */
function shape(p: Element) {
  return [...p.children].map((c) => ({
    tag: c.tagName.toLowerCase(),
    ...Object.fromEntries(
      ['d', 'width', 'height', 'cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'].flatMap((a) => {
        const v = c.getAttribute(a);
        return v === null ? [] : [[a, /^#/.test(v) ? v.toUpperCase() : v]];
      }),
    ),
  }));
}

describe('HaragBand', () => {
  it.each([26, 18, 16] as const)('matches the mockup pattern at %i px', async (h) => {
    const el = await render(<HaragBand height={h} />);
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('height')).toBe(String(h));
    const p = svg.querySelector('pattern')!;
    const ref = mockupPattern(h);
    expect(p.getAttribute('width')).toBe(ref.getAttribute('width'));
    expect(p.getAttribute('height')).toBe(ref.getAttribute('height'));
    expect(p.getAttribute('patternUnits')).toBe('userSpaceOnUse');
    expect(shape(p)).toEqual(shape(ref));
    // The framed rect inside the band, filled with this pattern.
    const frame = svg.querySelector(':scope > rect')!;
    expect(frame.getAttribute('fill')).toBe(`url(#${p.id})`);
    expect(frame.getAttribute('height')).toBe(String(h - 2));
    expect(frame.getAttribute('stroke')).toBe(ink.black);
  });

  it('uses the token colours', async () => {
    const el = await render(<HaragBand height={26} />);
    const fills = [...el.querySelectorAll('[fill],[stroke]')].flatMap((n) => [
      n.getAttribute('fill'),
      n.getAttribute('stroke'),
    ]);
    const colours = new Set(fills.filter((c): c is string => !!c && c.startsWith('#')));
    expect(colours).toEqual(new Set([harag.yellow, harag.red, harag.green, ink.black]));
  });

  it('gives two bands on one page different pattern ids', async () => {
    const el = await render(
      <>
        <HaragBand height={16} />
        <HaragBand height={16} />
      </>,
    );
    const ids = [...el.querySelectorAll('pattern')].map((p) => p.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z][\w-]*$/);
      expect(el.querySelectorAll(`[fill="url(#${id})"]`)).toHaveLength(1);
    }
  });

  it('is aria-hidden, and renders server-side with no hydration', async () => {
    const el = await render(<HaragBand height={18} className="chart-top" />);
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.classList.contains('chart-top')).toBe(true);
    const html = renderToStaticMarkup(<HaragBand height={18} />);
    expect(html).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(html).toContain('<pattern');
  });
});

describe('TitleCartouche', () => {
  it('puts the title in real text between two bands, in red manuscript ink', async () => {
    const el = await render(<TitleCartouche title="የሙከራ ርዕስ" subtitle="ንዑስ ርዕስ" />);
    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toBe('የሙከራ ርዕስ');
    expect(h1.classList.contains('rubric')).toBe(true);
    expect(h1.closest('svg')).toBeNull();
    expect(el.querySelector('.title-cartouche-subtitle')!.textContent).toBe('ንዑስ ርዕስ');
    const bands = [...el.querySelectorAll('svg.harag-band')];
    expect(bands.map((b) => b.getAttribute('height'))).toEqual(['26', '18']);
    // The bands frame the title: one before it and one after.
    expect(bands[0]!.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bands[1]!.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('leaves out the subtitle when none is given, and never sets bold', async () => {
    const el = await render(<TitleCartouche title="ርዕስ" />);
    expect(el.querySelector('.title-cartouche-subtitle')).toBeNull();
    const css = readFileSync('src/components/ornament/ornament.css', 'utf8');
    expect(css).not.toMatch(/font-weight:\s*(bold|[6-9]00)/);
  });
});
