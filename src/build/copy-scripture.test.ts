import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProductionGuard, copyScripture } from './copy-scripture';
import { verseHash, type ScriptureEnv } from './verify-scripture';

async function tmp(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'bk-copy-'));
}

describe('copyScripture', () => {
  it('copies verified books byte-for-byte', async () => {
    const out = await tmp();
    expect(await copyScripture('scripture-fixtures', out)).toEqual({
      copied: ['fixture.json'],
      skipped: [],
    });
    const [a, b] = await Promise.all([
      readFile(join(out, 'fixture.json')),
      readFile('scripture-fixtures/books/fixture.json'),
    ]);
    expect(a.equals(b)).toBe(true);
  });

  it('skips books that are not verified and removes stale copies', async () => {
    const src = await tmp();
    await cp('scripture-fixtures', src, { recursive: true });
    const draft = JSON.parse(await readFile(join(src, 'books/fixture.json'), 'utf8'));
    await writeFile(
      join(src, 'books/draft.json'),
      JSON.stringify({ ...draft, book: 'draft', status: 'draft' }),
    );
    const out = await tmp();
    await writeFile(join(out, 'stale.json'), '{}');
    expect(await copyScripture(src, out)).toEqual({
      copied: ['fixture.json'],
      skipped: ['draft.json'],
    });
    await expect(readFile(join(out, 'stale.json'))).rejects.toThrow();
  });

  it('refuses a book whose text does not match checksums.json', async () => {
    const src = await tmp();
    await cp('scripture-fixtures', src, { recursive: true });
    const path = join(src, 'books/fixture.json');
    await writeFile(path, (await readFile(path, 'utf8')).replace('ነው', 'ነበር'));
    await expect(copyScripture(src, await tmp())).rejects.toThrow('checksum mismatch');
  });

  it('refuses a book that fails the text rules, even with matching checksums', async () => {
    const src = await tmp();
    await cp('scripture-fixtures', src, { recursive: true });
    const path = join(src, 'books/fixture.json');
    const book = JSON.parse(await readFile(path, 'utf8'));
    book.chapters[0].verses[0].t = book.chapters[0].verses[0].t.replace(' ', '፡');
    await writeFile(path, JSON.stringify(book, null, 2) + '\n');
    const sums = JSON.parse(await readFile(join(src, 'checksums.json'), 'utf8'));
    sums['fixture.1.1'] = verseHash(book.chapters[0].verses[0].t);
    await writeFile(join(src, 'checksums.json'), JSON.stringify(sums));
    await expect(copyScripture(src, await tmp())).rejects.toThrow('contains ፡');
  });

  it('in production, refuses a book that is not the Society edition', async () => {
    await expect(
      copyScripture('scripture-fixtures', await tmp(), { requireEdition: true }),
    ).rejects.toThrow('is not BSE-1954-html+scan');
  });
});

describe('production guard', () => {
  const fixtures: ScriptureEnv = {
    SCRIPTURE_DIR: 'scripture-fixtures',
    BK_SCRIPTURE: 'fixtures',
    SCRIPTURE_VERSION: 'fixtures',
  };
  const real: ScriptureEnv = {
    SCRIPTURE_DIR: '.scripture/scripture',
    BK_SCRIPTURE: 'real',
    SCRIPTURE_VERSION: 'abc',
  };

  const LOCK = 'a'.repeat(40);

  it('ships no scripture in production while scripture.lock pins no release', () => {
    expect(checkProductionGuard(fixtures, {})).toBe('none');
    expect(checkProductionGuard(fixtures, {}, 'none\n')).toBe('none');
  });

  it('refuses the fixture book in production once a release is pinned', () => {
    expect(() => checkProductionGuard(fixtures, {}, LOCK)).toThrow('production build refused');
  });

  it('copies for previews, the CI escape hatch and real scripture', () => {
    expect(checkProductionGuard(fixtures, { BK_SEED: '1' }, LOCK)).toBe('copy');
    expect(checkProductionGuard(fixtures, { BK_ALLOW_FIXTURE_SCRIPTURE: '1' }, LOCK)).toBe('copy');
    expect(checkProductionGuard(real, {}, LOCK)).toBe('copy');
  });
});
