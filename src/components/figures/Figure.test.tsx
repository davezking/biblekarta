// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { figure } from '../../lib/core/tokens';
import Figure from './Figure';
import FigureSprite from './FigureSprite';
import FigureStandalone from './FigureStandalone';
import { DEFAULT_TONE, PARTS, partsFor, symbolKind, TONE, type SymbolKind } from './parts';

function dom(el: ReactElement): Element {
  const host = document.createElement('div');
  host.innerHTML = renderToStaticMarkup(el);
  return host.firstElementChild!;
}

/** The names of the parts drawn, matched back from the rendered elements' geometry. */
function partNames(root: Element): string[] {
  const shapes = [...root.querySelectorAll('circle, ellipse, path, rect')];
  return shapes.map((el) => {
    const part = PARTS.find(
      (p) =>
        p.tag === el.tagName.toLowerCase() &&
        Object.entries(p.attrs).every(([k, v]) => el.getAttribute(k) === v),
    );
    expect(part, el.outerHTML).toBeDefined();
    return part!.name;
  });
}

/** Each shape as tag + attributes, for comparing the sprite and the standalone figure. */
const shapes = (root: Element) =>
  [...root.querySelectorAll('circle, ellipse, path, rect')].map((el) => el.outerHTML);

const symbol = (kind: SymbolKind) => dom(<FigureSprite />).querySelector(`symbol#fig-${kind}`)!;

const KIND_PARTS = ['crown', 'jewel', 'hair', 'beard', 'beard-light', 'veil', 'hood', 'halo'];
const kindParts = (root: Element) => partNames(root).filter((n) => KIND_PARTS.includes(n));

describe('figure parts per kind (design-reference/figure.html)', () => {
  it('king = crown + hair + dark beard', () => {
    expect(kindParts(symbol('king')).sort()).toEqual(['beard', 'crown', 'hair', 'jewel']);
  });
  it('queen = crown + veil, no beard', () => {
    expect(kindParts(symbol('queen')).sort()).toEqual(['crown', 'jewel', 'veil']);
  });
  it('prophet = hood + halo + light beard', () => {
    expect(kindParts(symbol('prophet')).sort()).toEqual(['beard-light', 'halo', 'hood']);
    const beard = PARTS.find((p) => p.name === 'beard-light')!;
    expect(beard.attrs.fill).toBe(figure.parts.prophetBeard);
  });
  it('base has no crown, hood, halo or veil', () => {
    expect(kindParts(symbol('base'))).toEqual([]);
  });
  it('keeps figure.html paint order', () => {
    const order = PARTS.map((p) => p.name);
    for (const kind of ['king', 'queen', 'prophet', 'base'] as const) {
      const names = partNames(symbol(kind));
      expect(names).toEqual(order.filter((n) => names.includes(n)));
    }
  });
});

describe('Figure', () => {
  it('is aria-hidden, unfocusable and has no text', () => {
    for (const el of [
      dom(<Figure kind="king" size={40} />),
      dom(<FigureStandalone kind="prophet" size={40} />),
      dom(<FigureSprite />),
    ]) {
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.getAttribute('focusable')).toBe('false');
      expect(el.textContent).toBe('');
      expect(el.querySelector('text, title, desc')).toBeNull();
    }
  });

  it('draws from the sprite with <use>, at the given size', () => {
    const el = dom(<Figure kind="queen" size={32} />);
    expect(el.getAttribute('width')).toBe('32');
    expect(el.getAttribute('height')).toBe('32');
    expect(el.getAttribute('viewBox')).toBe('0 0 64 64');
    expect(el.querySelector('use')!.getAttribute('href')).toBe('#fig-queen');
    expect(el.querySelector('path, circle, ellipse, rect')).toBeNull();
  });

  it('sets the tone variable, defaulting to the first figure tone', () => {
    expect(dom(<Figure kind="king" size={40} />).getAttribute('style')).toContain(
      `--fig-tone:${DEFAULT_TONE}`,
    );
    expect(DEFAULT_TONE).toBe(figure.tones[0]);
    const tone = figure.tones[2];
    expect(dom(<Figure kind="king" size={40} tone={tone} />).getAttribute('style')).toContain(
      `--fig-tone:${tone}`,
    );
  });

  it('applies the tone only to the ring and the robe', () => {
    const toned = PARTS.filter((p) => Object.values(p.attrs).includes(TONE)).map((p) => p.name);
    expect(toned.sort()).toEqual(['ground', 'robe']);
    // The sprite's paths hold no literal tone, so one symbol serves every tone.
    const html = dom(<FigureSprite />).outerHTML.toLowerCase();
    for (const t of figure.tones) {
      // Tone 2 is also the jewel colour; check it is used only by the jewel.
      const hits = html.split(t.toLowerCase()).length - 1;
      expect(hits).toBe(t === figure.parts.jewel ? 2 : 0);
    }
  });

  it('falls back to the base for the NT and other kinds', () => {
    for (const kind of ['christ', 'apostle', 'other'] as const) {
      expect(symbolKind(kind)).toBe('base');
      expect(
        dom(<Figure kind={kind} size={40} />)
          .querySelector('use')!
          .getAttribute('href'),
      ).toBe('#fig-base');
      expect(kindParts(dom(<FigureStandalone kind={kind} size={40} />))).toEqual([]);
    }
  });

  it('draws the same paths in the sprite and the standalone figure', () => {
    for (const kind of ['king', 'queen', 'prophet', 'christ'] as const) {
      const sym = symbolKind(kind);
      expect(shapes(dom(<FigureStandalone kind={kind} size={40} />))).toEqual(shapes(symbol(sym)));
      expect(shapes(symbol(sym))).toHaveLength(partsFor(sym).length);
    }
  });

  it('renders 200 sprite figures with one set of symbols', () => {
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(
      <div>
        <FigureSprite />
        {Array.from({ length: 200 }, (_, i) => (
          <Figure key={i} kind={(['king', 'queen', 'prophet'] as const)[i % 3]!} size={24} />
        ))}
      </div>,
    );
    expect(host.querySelectorAll('symbol')).toHaveLength(4);
    expect(host.querySelectorAll('use')).toHaveLength(200);
    const inSprite = host.querySelector('svg.figure-sprite')!.querySelectorAll('path').length;
    expect(host.querySelectorAll('path')).toHaveLength(inSprite);
  });
});
