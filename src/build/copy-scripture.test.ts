import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProductionGuard, copyScripture } from './copy-scripture';
import type { ScriptureEnv } from './verify-scripture';

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

  it('refuses the fixture book in a production build', () => {
    expect(() => checkProductionGuard(fixtures, {})).toThrow('production build refused');
  });

  it('allows previews, the CI escape hatch and real scripture', () => {
    expect(() => checkProductionGuard(fixtures, { BK_SEED: '1' })).not.toThrow();
    expect(() => checkProductionGuard(fixtures, { BK_ALLOW_FIXTURE_SCRIPTURE: '1' })).not.toThrow();
    expect(() => checkProductionGuard(real, {})).not.toThrow();
  });
});
