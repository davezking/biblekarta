// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { BookFile } from '../../build/verify-scripture';
import { wordSeparators } from '../../lib/core/separators';
import VerseText, { type Verse } from './VerseText';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
afterEach(() => container?.remove());

async function render(verses: Verse[]): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<VerseText verses={verses} />));
  return container;
}

describe('VerseText', () => {
  it('renders each fixture verse as wordSeparators(t), exactly, in a plain text node', async () => {
    const book = JSON.parse(
      await readFile('scripture-fixtures/books/fixture.json', 'utf8'),
    ) as BookFile;
    for (const ch of book.chapters) {
      const el = await render(ch.verses);
      const ps = [...el.querySelectorAll('p')];
      expect(ps).toHaveLength(ch.verses.length);
      ch.verses.forEach((v, i) => {
        const p = ps[i]!;
        expect(p.getAttribute('lang')).toBe('am');
        expect(p.classList.contains('ms')).toBe(true);
        const t = p.querySelector('.verse-t')!;
        expect(t.textContent).toBe(wordSeparators(v.t));
        expect(t.childNodes).toHaveLength(1);
        expect(t.firstChild!.nodeType).toBe(3); // Node.TEXT_NODE
      });
      container.remove();
    }
  });

  it("shows a red Ge'ez number, both ends for a range, and no footnote", async () => {
    const el = await render([
      { n: 3, t: 'ቡና ሻይ' },
      { n: 14, to: 15, t: 'ቡና፤ ሻይ', footnote: 'ማስታወሻ' },
    ]);
    const nums = [...el.querySelectorAll('.verse-n')];
    expect(nums.map((n) => n.textContent)).toEqual(['፫', '፲፬–፲፭']);
    expect(nums.every((n) => n.classList.contains('ms-red'))).toBe(true);
    expect(el.textContent).not.toContain('ማስታወሻ');
  });

  it('never interprets the text as HTML', async () => {
    const el = await render([{ n: 1, t: '<b>ቡና</b> ሻይ' }]);
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('.verse-t')!.textContent).toBe('<b>ቡና</b>፡ሻይ');
  });
});
