// Build-time reader for the /dev/scripture pages: the verified books of $SCRIPTURE_DIR (the
// ones copy-scripture publishes), in the scan's order. Books missing from books-meta.json
// (the fixture test book) come last, named from their own file.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadBooks, scanOrder } from '../lib/core/books';
import { resolveScriptureEnv, type BookFile } from './verify-scripture';

export interface VerifiedBook {
  id: string;
  name_am: string;
  file: BookFile;
}

export async function loadVerifiedBooks(): Promise<VerifiedBook[]> {
  const { SCRIPTURE_DIR } = await resolveScriptureEnv();
  const meta = scanOrder(await loadBooks(SCRIPTURE_DIR));
  const rank = new Map(meta.map((b, i) => [b.id, i]));
  const names = new Map(meta.map((b) => [b.id, b.name_am]));
  const files = (await readdir(join(SCRIPTURE_DIR, 'books'))).filter((f) => f.endsWith('.json'));
  const out: VerifiedBook[] = [];
  for (const f of files) {
    const file = JSON.parse(await readFile(join(SCRIPTURE_DIR, 'books', f), 'utf8')) as BookFile & {
      name_am?: string;
    };
    if (file.status !== 'verified') continue;
    out.push({ id: file.book, name_am: names.get(file.book) ?? file.name_am ?? file.book, file });
  }
  const order = (id: string) => rank.get(id) ?? meta.length;
  return out.sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));
}
