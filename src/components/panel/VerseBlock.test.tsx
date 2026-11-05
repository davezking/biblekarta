// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wordSeparators } from '../../lib/core/separators';
import { createT } from '../../lib/i18n';
import { resetBookCache } from '../scripture/useBook';
import { cleanup, click, render } from '../ui/ui.testutil';
import VerseBlock from './VerseBlock';
import { FIXTURE_BYTES, fixtureBook, serveBooks, settle } from './verse.testutil';

const am = createT('am');
beforeEach(() => resetBookCache());
afterEach(cleanup);

const verseNodes = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('p.verse')];

async function mountBlock(
  ref: { book_id: string; chapter: number; verse_start: number; verse_end?: number },
  served = serveBooks(),
  scriptureBooks = ['fixture'],
) {
  const r = await render(
    <VerseBlock
      scriptureRef={ref}
      heading="የሙከራ መጽሐፍ ፩፥፩"
      scripture={{ scriptureBooks, scriptureVersion: 'v1', fetch: served.fetchFn }}
      t={am}
    />,
  );
  await settle();
  return { ...r, served, block: r.container.querySelector<HTMLElement>('.verse-block')! };
}

describe('VerseBlock', () => {
  it('shows each verse as exactly wordSeparators(t) of the served JSON, lang="am"', async () => {
    const { block } = await mountBlock({
      book_id: 'fixture',
      chapter: 1,
      verse_start: 1,
      verse_end: 4,
    });
    const served = fixtureBook().chapters[0]!.verses;
    const nodes = verseNodes(block);
    expect(nodes).toHaveLength(4);
    nodes.forEach((p, i) => {
      expect(p.getAttribute('lang')).toBe('am');
      expect(p.querySelector('.verse-t')!.textContent).toBe(wordSeparators(served[i]!.t));
      // A plain text node: no markup inside the verse text.
      expect(p.querySelector('.verse-t')!.children).toHaveLength(0);
    });
    expect(block.querySelector('.verse-ref')!.textContent).toBe('የሙከራ መጽሐፍ ፩፥፩');
    expect(block.querySelector('.verse-credit')!.textContent).toBe(am('verse.credit'));
  });

  it('shows a stored range once, numbered ፲፬–፲፭, for a ref to verse 15', async () => {
    const book = fixtureBook();
    const t = book.chapters[0]!.verses[0]!.t;
    book.chapters = [
      {
        n: 3,
        verses: [
          { n: 14, to: 15, t },
          { n: 16, t },
        ],
      },
    ];
    const { block } = await mountBlock(
      { book_id: 'fixture', chapter: 3, verse_start: 15 },
      serveBooks(() => JSON.stringify(book)),
    );
    const nodes = verseNodes(block);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.querySelector('.verse-n')!.textContent).toBe('፲፬–፲፭');
    expect(nodes[0]!.querySelector('.verse-t')!.textContent).toBe(wordSeparators(t));
  });

  it('shows "ይህ መጽሐፍ በዝግጅት ላይ ነው" for an unpublished book, with no request', async () => {
    const served = serveBooks();
    const { block } = await mountBlock({ book_id: '1ki', chapter: 16, verse_start: 29 }, served);
    expect(block.querySelector('.verse-status')!.textContent).toBe('ይህ መጽሐፍ በዝግጅት ላይ ነው');
    expect(verseNodes(block)).toHaveLength(0);
    expect(served.fetchFn).not.toHaveBeenCalled();
    expect(block.querySelector('.verse-credit')).not.toBeNull();
  });

  it('shows a skeleton without text while loading', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const served = serveBooks();
    const slow = (async (url: string) => {
      await gate;
      return served.fetchFn(url);
    }) as unknown as typeof fetch;
    const r = await render(
      <VerseBlock
        scriptureRef={{ book_id: 'fixture', chapter: 1, verse_start: 1 }}
        heading="h"
        scripture={{ scriptureBooks: ['fixture'], scriptureVersion: 'v1', fetch: slow }}
        t={am}
      />,
    );
    const skeleton = r.container.querySelector('.verse-skeleton')!;
    expect(skeleton).not.toBeNull();
    expect(skeleton.textContent).toBe('');
    expect(r.container.querySelector('.verse-block')!.getAttribute('aria-busy')).toBe('true');
    release();
    await settle();
    expect(verseNodes(r.container)).toHaveLength(1);
  });

  it('offers a retry after an error, which loads the verses', async () => {
    let fail = true;
    const served = serveBooks(() => (fail ? null : FIXTURE_BYTES));
    const { block } = await mountBlock({ book_id: 'fixture', chapter: 1, verse_start: 1 }, served);
    expect(block.querySelector('.verse-status')!.textContent).toBe(am('verse.error'));
    const retry = block.querySelector('button')!;
    expect(retry.textContent).toBe(am('verse.retry'));
    fail = false;
    await click(retry);
    await settle();
    expect(verseNodes(block)).toHaveLength(1);
    expect(served.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('says which requested verses the edition does not have', async () => {
    const { block } = await mountBlock({
      book_id: 'fixture',
      chapter: 1,
      verse_start: 4,
      verse_end: 5,
    });
    expect(verseNodes(block)).toHaveLength(1);
    expect(block.querySelector('.verse-status')!.textContent).toBe(
      am('verse.missing', { verses: '፭' }),
    );
  });
});
