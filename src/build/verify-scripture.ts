// Integrity of the scripture the build will publish: a TypeScript port of `bk verify` in the
// private repo. For every verified book in $SCRIPTURE_DIR/books: each verse's SHA-256 equals
// checksums.json, the counts equal verse-counts.json (every number in a `to` range counts),
// and the stored text uses only allowed characters — never ፡ (added at display time only).
// Digits are accepted here; which verses may hold them is enforced by the private repo.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface BookFile {
  book: string;
  status?: string;
  chapters: { n: number; verses: { n: number; to?: number; t: string; footnote?: string }[] }[];
}

export interface ScriptureEnv {
  SCRIPTURE_DIR: string;
  BK_SCRIPTURE: 'real' | 'fixtures';
  SCRIPTURE_VERSION: string;
}

type Env = Record<string, string | undefined>;

/**
 * The scripture choice made by scripts/fetch-scripture.sh: the process environment first,
 * then .scripture.env, then the fixtures (as when the script never ran).
 */
export async function resolveScriptureEnv(
  env: Env = process.env,
  file = '.scripture.env',
): Promise<ScriptureEnv> {
  const fromFile: Env = {};
  try {
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) fromFile[m[1]!] = m[2];
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  const get = (k: keyof ScriptureEnv) => env[k] || fromFile[k];
  const mode = get('BK_SCRIPTURE') === 'real' ? 'real' : 'fixtures';
  return {
    SCRIPTURE_DIR: get('SCRIPTURE_DIR') ?? 'scripture-fixtures',
    BK_SCRIPTURE: mode,
    SCRIPTURE_VERSION: get('SCRIPTURE_VERSION') ?? (mode === 'real' ? 'unknown' : 'fixtures'),
  };
}

const SEPARATOR = '፡';
const PUNCTUATION = new Set(['።', '፣', '፤', '፥', '?', '!']);
const FIDEL: [number, number][] = [
  [0x1200, 0x137f],
  [0x1380, 0x139f],
  [0x2d80, 0x2ddf],
  [0xab00, 0xab2f],
];

export function verseHash(t: string): string {
  return createHash('sha256').update(t, 'utf8').digest('hex');
}

function allowed(ch: string): boolean {
  if (ch === ' ' || PUNCTUATION.has(ch) || /[0-9]/.test(ch)) return true;
  if (ch === SEPARATOR) return false;
  const cp = ch.codePointAt(0)!;
  return FIDEL.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** Problems with one stored verse text, each prefixed with the ref. */
export function textProblems(ref: string, t: string): string[] {
  const out: string[] = [];
  if (t === '') out.push('empty');
  if (t.includes(SEPARATOR)) out.push('contains ፡ (it is added at display time only)');
  if (t !== t.trim()) out.push('leading or trailing space');
  if (t.includes('  ')) out.push('double space');
  const bad = [...new Set([...t].filter((c) => c !== SEPARATOR && !allowed(c)))];
  if (bad.length) {
    const codes = bad.map(
      (c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
    );
    out.push(`characters not allowed: ${codes.join(' ')}`);
  }
  if (t.normalize('NFC') !== t) out.push('not NFC');
  return out.map((p) => `${ref}: ${p}`);
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Every problem in `dir` (empty = OK) and the ids of the verified books checked. */
export async function verifyScripture(
  dir: string,
): Promise<{ problems: string[]; books: string[] }> {
  const checksums = await readJson<Record<string, string>>(join(dir, 'checksums.json'), {});
  const counts = await readJson<Record<string, Record<string, number>>>(
    join(dir, 'verse-counts.json'),
    {},
  );
  const problems: string[] = [];
  const books: string[] = [];
  const files = await listBooks(dir);
  for (const file of files) {
    const book = JSON.parse(await readFile(join(dir, 'books', file), 'utf8')) as BookFile;
    const id = file.replace(/\.json$/, '');
    if (book.status !== 'verified') continue; // never copied, so never published
    books.push(id);
    if (book.book !== id) problems.push(`${file}: book id is ${JSON.stringify(book.book)}`);
    const seen = new Set<string>();
    const actual: Record<string, number> = {};
    for (const ch of book.chapters) {
      const numbers: number[] = [];
      for (const v of ch.verses) {
        const ref = `${id}.${ch.n}.${v.n}`;
        seen.add(ref);
        for (let x = v.n; x <= (v.to ?? v.n); x++) numbers.push(x);
        if (!(ref in checksums)) problems.push(`${ref}: no checksum`);
        else if (verseHash(v.t) !== checksums[ref])
          problems.push(`${ref}: checksum mismatch (the text was changed)`);
        problems.push(...textProblems(ref, v.t));
      }
      actual[String(ch.n)] = numbers.length;
      if (numbers.some((x, i) => x !== i + 1))
        problems.push(`${id}.${ch.n}: verse numbers are not 1..n`);
    }
    for (const key of Object.keys(checksums).sort()) {
      if (key.split('.')[0] === id && !seen.has(key))
        problems.push(`${key}: checksum for a verse that is not in ${file}`);
    }
    if (JSON.stringify(sortKeys(counts[id] ?? {})) !== JSON.stringify(sortKeys(actual))) {
      problems.push(`${id}: verse counts differ from verse-counts.json`);
    }
  }
  return { problems, books };
}

async function listBooks(dir: string): Promise<string[]> {
  try {
    return (await readdir(join(dir, 'books'))).filter((f) => f.endsWith('.json')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function sortKeys(o: Record<string, number>): [string, number][] {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

async function main(): Promise<void> {
  const env = await resolveScriptureEnv();
  const { problems, books } = await verifyScripture(env.SCRIPTURE_DIR);
  for (const p of problems) console.error(p);
  if (problems.length) {
    console.error(`verify-scripture: FAIL — ${problems.length} problems in ${env.SCRIPTURE_DIR}`);
    process.exit(1);
  }
  console.log(
    `verify-scripture: OK — ${books.length} verified books in ${env.SCRIPTURE_DIR} (${env.BK_SCRIPTURE})`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
