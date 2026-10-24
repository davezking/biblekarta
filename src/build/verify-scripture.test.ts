import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveScriptureEnv, textProblems, verifyScripture, verseHash } from './verify-scripture';

// Test words only (from the fixture book's vocabulary), never Bible text.
async function fixtureCopy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bk-scripture-'));
  await cp('scripture-fixtures', dir, { recursive: true });
  return dir;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form edits of test JSON
async function editJson(path: string, edit: (d: any) => void): Promise<void> {
  const d = JSON.parse(await readFile(path, 'utf8'));
  edit(d);
  await writeFile(path, JSON.stringify(d, null, 2) + '\n');
}

describe('verifyScripture', () => {
  it('passes the fixture book', async () => {
    expect(await verifyScripture('scripture-fixtures')).toEqual({
      problems: [],
      books: ['fixture'],
    });
  });

  it('names a tampered verse', async () => {
    const dir = await fixtureCopy();
    await editJson(join(dir, 'books/fixture.json'), (d) => {
      d.chapters[0].verses[1].t = d.chapters[0].verses[1].t.replace('ነው', 'ነበር');
    });
    const { problems } = await verifyScripture(dir);
    expect(problems).toEqual(['fixture.1.2: checksum mismatch (the text was changed)']);
  });

  it('fails a book containing ፡ even with a matching checksum', async () => {
    const dir = await fixtureCopy();
    const t = 'ይህ፡የሙከራ፡ጽሑፍ፡ነው።';
    await editJson(join(dir, 'books/fixture.json'), (d) => (d.chapters[0].verses[0].t = t));
    await editJson(join(dir, 'checksums.json'), (d) => (d['fixture.1.1'] = verseHash(t)));
    const { problems } = await verifyScripture(dir);
    expect(problems).toEqual(['fixture.1.1: contains ፡ (it is added at display time only)']);
  });

  it('counts every number of a verse range', async () => {
    const dir = await fixtureCopy();
    await editJson(join(dir, 'books/fixture.json'), (d) => {
      d.chapters[0].verses[2].to = 4;
      d.chapters[0].verses.pop();
    });
    await editJson(join(dir, 'checksums.json'), (d) => delete d['fixture.1.4']);
    expect((await verifyScripture(dir)).problems).toEqual([]);
    await editJson(join(dir, 'verse-counts.json'), (d) => (d.fixture['1'] = 3));
    expect((await verifyScripture(dir)).problems).toEqual([
      'fixture: verse counts differ from verse-counts.json',
    ]);
  });

  it('skips books that are not verified', async () => {
    const dir = await fixtureCopy();
    await editJson(join(dir, 'books/fixture.json'), (d) => (d.status = 'draft'));
    expect(await verifyScripture(dir)).toEqual({ problems: [], books: [] });
  });
});

describe('textProblems', () => {
  it.each([
    ['ቃል  ሙከራ።', 'double space'],
    [' ቃል።', 'leading or trailing'],
    ['ቃል KW።', 'U+004B'],
    ['', 'empty'],
  ])('%s', (t, problem) => {
    expect(textProblems('x.1.1', t).join()).toContain(problem);
  });

  it('accepts the allowed punctuation, digits and fidel', () => {
    expect(textProblems('x.1.1', 'ወዮ! ቃል፣ ሙከራ፤ ጽሑፍ፥ ብቻ? ከ3 ፲፪።')).toEqual([]);
  });
});

describe('resolveScriptureEnv', () => {
  it('reads .scripture.env when the environment has nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bk-env-'));
    const file = join(dir, '.scripture.env');
    await writeFile(
      file,
      'SCRIPTURE_DIR=.scripture/scripture\nBK_SCRIPTURE=real\nSCRIPTURE_VERSION=abc\n',
    );
    expect(await resolveScriptureEnv({}, file)).toEqual({
      SCRIPTURE_DIR: '.scripture/scripture',
      BK_SCRIPTURE: 'real',
      SCRIPTURE_VERSION: 'abc',
    });
    expect(
      (await resolveScriptureEnv({ BK_SCRIPTURE: 'fixtures', SCRIPTURE_DIR: 'x' }, file))
        .SCRIPTURE_DIR,
    ).toBe('x');
  });

  it('defaults to the fixtures', async () => {
    expect(await resolveScriptureEnv({}, '/nonexistent/.scripture.env')).toEqual({
      SCRIPTURE_DIR: 'scripture-fixtures',
      BK_SCRIPTURE: 'fixtures',
      SCRIPTURE_VERSION: 'fixtures',
    });
  });
});
