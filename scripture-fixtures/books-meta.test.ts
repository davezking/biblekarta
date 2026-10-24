import { describe, expect, it } from 'vitest';
import books from './books-meta.json';
import fixture from './books/fixture.json';

describe('scripture-fixtures/books-meta.json', () => {
  it('has 66 unique ids', () => {
    expect(books).toHaveLength(66);
    expect(new Set(books.map((b) => b.id)).size).toBe(66);
  });

  it('order_66 is a permutation of 1..66', () => {
    const orders = books.map((b) => b.order_66).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 66 }, (_, i) => i + 1));
  });

  it('uses the scan order for the minor prophets (Hosea < Amos < Micah < Joel)', () => {
    const order = (id: string) => books.find((b) => b.id === id)!.order_66;
    expect(order('hos')).toBeLessThan(order('amo'));
    expect(order('amo')).toBeLessThan(order('mic'));
    expect(order('mic')).toBeLessThan(order('jol'));
  });
});

describe('scripture-fixtures/books/fixture.json', () => {
  it('never contains ፡', () => {
    expect(JSON.stringify(fixture)).not.toContain('፡');
  });
});
