import { describe, expect, it } from 'vitest';
import { resolveScriptureEnv } from '../../build/verify-scripture';
import { bookIndex, loadBooks, scanOrder } from './books';

describe('books', () => {
  it('orders by the scan order and indexes by id', async () => {
    const books = await loadBooks('scripture-fixtures');
    expect(scanOrder(books).map((b) => b.order_66)).toEqual(
      [...Array(66).keys()].map((i) => i + 1),
    );
    expect(bookIndex(books).get('gen')?.order_66).toBe(1);
  });

  it('fixture books-meta matches the real one (ids, scan names, order)', async (ctx) => {
    const env = await resolveScriptureEnv();
    if (env.BK_SCRIPTURE !== 'real') ctx.skip();
    const pick = (b: { id: string; name_am: string; order_66: number }) => [
      b.id,
      b.name_am,
      b.order_66,
    ];
    const [fixture, real] = await Promise.all([
      loadBooks('scripture-fixtures'),
      loadBooks(env.SCRIPTURE_DIR),
    ]);
    expect(scanOrder(fixture).map(pick)).toEqual(scanOrder(real).map(pick));
  });
});
