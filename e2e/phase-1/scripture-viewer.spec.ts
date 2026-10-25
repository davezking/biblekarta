import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { resolveScriptureEnv, type BookFile } from '../../src/build/verify-scripture';
import { toGeez } from '../../src/lib/core/geez';
import { SEPARATOR, SEPARATOR_PUNCTUATION, wordSeparators } from '../../src/lib/core/separators';

// Demo step 7: /dev/scripture/<book>/ shows the stored verses with the display-time ፡.
// The real book when the build has the real text (BK_SCRIPTURE=real), otherwise the fixture.
test.skip(process.env.BK_SEED !== '1', 'dev pages are only built with BK_SEED=1');

interface Pick {
  ch: number;
  n: number;
  t: string;
}

async function loadBook(): Promise<BookFile> {
  const env = await resolveScriptureEnv();
  const dir = join(env.SCRIPTURE_DIR, 'books');
  const read = async (id: string) =>
    JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) as BookFile;
  if (env.BK_SCRIPTURE !== 'real') return read('fixture');
  try {
    const book = await read('1ki'); // the demo's book, once verified
    if (book.status === 'verified') return book;
  } catch {
    // not finalized yet: use the first verified book
  }
  const { readdir } = await import('node:fs/promises');
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    const book = await read(f.replace(/\.json$/, ''));
    if (book.status === 'verified') return book;
  }
  throw new Error(`no verified book in ${dir}`);
}

/** Three verses, preferring ones with punctuation inside (where the ፡ rule matters). */
function pickVerses(book: BookFile): Pick[] {
  const all = book.chapters.flatMap((c) => c.verses.map((v) => ({ ch: c.n, n: v.n, t: v.t })));
  const inner = all.filter((v) => SEPARATOR_PUNCTUATION.some((p) => v.t.slice(0, -1).includes(p)));
  const picks = [...inner, ...all.filter((v) => !inner.includes(v))].slice(0, 3);
  expect(picks).toHaveLength(3);
  return picks;
}

test('chapters have red Ge’ez headings and verses render exactly wordSeparators(t)', async ({
  page,
}) => {
  const book = await loadBook();
  await page.goto(`/dev/scripture/${book.book}/`);

  const headings = page.locator('main h2');
  await expect(headings).toHaveCount(book.chapters.length);
  for (const [i, ch] of book.chapters.entries()) {
    await expect(headings.nth(i)).toHaveText(`ምዕራፍ ${toGeez(ch.n)}`);
  }
  expect(await headings.first().evaluate((el) => getComputedStyle(el).color)).toBe(
    'rgb(138, 26, 18)', // --ink-red #8A1A12
  );

  for (const v of pickVerses(book)) {
    const p = page.locator(`section#c${v.ch} p[data-verse="${v.n}"]`);
    await expect(p).toHaveAttribute('lang', 'am');
    await expect(p.locator('.verse-n')).toHaveText(toGeez(v.n));
    const text = await p.locator('.verse-t').evaluate((el) => el.textContent);
    expect(text).toBe(wordSeparators(v.t));
    for (const mark of SEPARATOR_PUNCTUATION) {
      expect(text).not.toContain(SEPARATOR + mark);
      expect(text).not.toContain(mark + SEPARATOR);
    }
    expect(text!.replaceAll(SEPARATOR, ' ')).toBe(v.t); // nothing else changed
    expect(await p.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Abyssinica');
  }
});

test('the separator-samples page shows stored and rendered text side by side', async ({ page }) => {
  await page.goto('/dev/scripture/separator-samples/');
  const samples = page.locator('article.sample');
  expect(await samples.count()).toBeGreaterThan(0);
  for (const sample of await samples.all()) {
    const stored = await sample.locator('pre.stored').textContent();
    const rendered = await sample.locator('.verse-t').textContent();
    expect(rendered).toBe(wordSeparators(stored!));
  }
  await expect(page.locator('.rule-badge').first()).toBeVisible(); // rule pending review
});
