// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wordSeparators } from '../../lib/core/separators';
import { createT } from '../../lib/i18n';
import { resetBookCache } from '../scripture/useBook';
import { cleanup, click, expectHitArea, loadCss, render } from '../ui/ui.testutil';
import RefList, { refKey, refLabel } from './RefList';
import { fixtureBook, serveBooks, settle } from './verse.testutil';

const am = createT('am');
const BOOKS = { fixture: { id: 'fixture', name_am: 'የሙከራ መጽሐፍ' } };
const REFS = [
  { book_id: 'fixture', chapter: 1, verse_start: 1 },
  { book_id: 'fixture', chapter: 2, verse_start: 1, verse_end: 2 },
  { book_id: 'nobook', chapter: 1, verse_start: 1 },
];

beforeEach(() => {
  resetBookCache();
  loadCss('src/components/ui/ui.css');
});
afterEach(cleanup);

async function mount(served = serveBooks()) {
  const r = await render(
    <RefList
      refs={REFS}
      books={BOOKS}
      scripture={{ scriptureBooks: ['fixture'], scriptureVersion: 'v1', fetch: served.fetchFn }}
      t={am}
    />,
  );
  const buttons = () => [...r.container.querySelectorAll<HTMLButtonElement>('button.ref-button')];
  const blocks = () => [...r.container.querySelectorAll<HTMLElement>('.verse-block')];
  return { ...r, served, buttons, blocks };
}

describe('refLabel', () => {
  it('uses the Amharic book name, with Ge’ez numerals', () => {
    expect(refLabel(REFS[1]!, BOOKS)).toBe('የሙከራ መጽሐፍ ፪፥፩–፪');
    expect(refLabel(REFS[2]!, BOOKS)).toBe('nobook ፩፥፩'); // unknown book: placeholder form
    expect(refKey(REFS[1]!)).toBe('fixture.2.1-2');
  });
});

describe('RefList', () => {
  it('lists the refs as buttons named with the book name, all closed, nothing fetched', async () => {
    const m = await mount();
    expect(m.buttons().map((b) => b.textContent)).toEqual([
      'የሙከራ መጽሐፍ ፩፥፩',
      'የሙከራ መጽሐፍ ፪፥፩–፪',
      'nobook ፩፥፩',
    ]);
    for (const b of m.buttons()) {
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(b.getAttribute('lang')).toBe('am');
      expectHitArea(b);
    }
    expect(m.blocks()).toHaveLength(0);
    expect(m.served.fetchFn).not.toHaveBeenCalled();
  });

  it('opens one verse block inline, with the exact verses, lang="am" and the credit', async () => {
    const m = await mount();
    await click(m.buttons()[1]!);
    await settle();
    const [block] = m.blocks();
    expect(m.blocks()).toHaveLength(1);
    expect(m.buttons()[1]!.getAttribute('aria-expanded')).toBe('true');
    expect(m.buttons()[1]!.getAttribute('aria-controls')).toBe(block!.id);
    expect(block!.closest('li')!.getAttribute('data-ref')).toBe('fixture.2.1-2');
    const served = fixtureBook().chapters[1]!.verses;
    const texts = [...block!.querySelectorAll('p.verse')].map((p) => {
      expect(p.getAttribute('lang')).toBe('am');
      return p.querySelector('.verse-t')!.textContent;
    });
    expect(texts).toEqual([wordSeparators(served[0]!.t), wordSeparators(served[1]!.t)]);
    expect(block!.querySelector('.verse-credit')!.textContent).toBe(am('verse.credit'));
  });

  it('keeps only one open at a time, and a second tap closes it', async () => {
    const m = await mount();
    await click(m.buttons()[0]!);
    await click(m.buttons()[2]!);
    await settle();
    expect(m.blocks()).toHaveLength(1);
    expect(m.buttons().map((b) => b.getAttribute('aria-expanded'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    // The unpublished book says so; the credit is still under the block.
    expect(m.blocks()[0]!.textContent).toContain('ይህ መጽሐፍ በዝግጅት ላይ ነው');
    expect(m.blocks()[0]!.querySelector('.verse-credit')).not.toBeNull();
    await click(m.buttons()[2]!);
    expect(m.blocks()).toHaveLength(0);
    expect(m.served.urls).toEqual(['/data/scripture/fixture.json']);
  });

  it('renders nothing with no refs', async () => {
    const { container } = await render(
      <RefList refs={[]} scripture={{ scriptureBooks: [], scriptureVersion: 'v1' }} t={am} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
