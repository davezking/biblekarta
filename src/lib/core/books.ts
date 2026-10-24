// The 66 books' metadata (scan names and order) from $SCRIPTURE_DIR/books-meta.json.
// Loading is in schema.ts (loadBooks, Node only); these helpers are pure.
import { loadBooks, type Book } from './schema';

export { loadBooks };

/** Books in the scan's order (order_66). */
export function scanOrder(books: Book[]): Book[] {
  return [...books].sort((a, b) => a.order_66 - b.order_66);
}

/** Book id → book. */
export function bookIndex(books: Book[]): Map<string, Book> {
  return new Map(books.map((b) => [b.id, b]));
}
