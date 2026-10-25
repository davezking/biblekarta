// Build-time reader for the /dev/scripture pages: the verified books of $SCRIPTURE_DIR (the
// ones copy-scripture publishes), in the scan's order. Books missing from books-meta.json
// (the fixture test book) come last, named from their own file.
import { loadBooks, scanOrder } from '../lib/core/books';
import { readBookFiles, resolveScriptureEnv, type BookFile } from './verify-scripture';

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
  const out: VerifiedBook[] = [];
  for (const { book } of await readBookFiles(SCRIPTURE_DIR)) {
    if (book.status !== 'verified') continue;
    out.push({
      id: book.book,
      name_am: names.get(book.book) ?? book.name_am ?? book.book,
      file: book,
    });
  }
  const order = (id: string) => rank.get(id) ?? meta.length;
  return out.sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));
}
