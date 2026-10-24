import { describe, expect, it } from 'vitest';
import { formatText, validateContent } from './validate-content';

const F = 'src/build/__fixtures__/validate';

describe('validateContent', () => {
  it('passes the good fixture', async () => {
    expect(await validateContent({ dir: `${F}/good` })).toEqual([]);
  });

  it('passes an empty or missing content folder', async () => {
    expect(await validateContent({ dir: `${F}/does-not-exist` })).toEqual([]);
  });

  it('reports a dangling stream_id with file and field path', async () => {
    const errors = await validateContent({ dir: `${F}/dangling` });
    expect(errors).toEqual([
      {
        file: `${F}/dangling/people/test-king.json`,
        path: 'stream_id',
        message: 'stream_id "no-such-stream" not found in streams',
      },
    ]);
    expect(formatText(errors)).toContain('1 error');
  });

  it('reports a duplicate slug', async () => {
    const errors = await validateContent({ dir: `${F}/duplicate-slug` });
    expect(errors).toHaveLength(1);
    expect(errors[0].path).toBe('slug');
    expect(errors[0].message).toContain('duplicate slug "test-kingdom"');
  });

  it('reports a derived date whose anchor is missing', async () => {
    const errors = await validateContent({ dir: `${F}/derived-no-anchor` });
    expect(errors).toEqual([
      {
        file: `${F}/derived-no-anchor/people/test-king.json`,
        path: 'birth_scholarly.anchor_id',
        message: 'derived date\'s anchor "missing-anchor" not found in anchors',
      },
    ]);
  });

  it('merges seed under content (content wins on an id clash)', async () => {
    const opts = { dir: `${F}/with-seed/content`, seedDir: `${F}/with-seed/seed` };
    expect(await validateContent({ ...opts, withSeed: true })).toEqual([]);
    // Without content winning, the two "test-kingdom" entries would be a duplicate id.
  });

  it('checks person_a ≠ person_b, reign streams and book ids', async () => {
    const { mkdtemp, mkdir, writeFile } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'bk-validate-'));
    const put = async (coll: string, obj: Record<string, unknown>) => {
      await mkdir(join(dir, coll), { recursive: true });
      await writeFile(join(dir, coll, `${String(obj.id)}.json`), JSON.stringify(obj));
    };
    const stream = {
      slug: 's',
      name_am: 'ሀ',
      name_en: 'S',
      kind: 'polity',
      fill_color: '#000000',
      width_keyframes: [],
      lane_order: 1,
    };
    await put('streams', { ...stream, id: 's1', slug: 's1' });
    await put('streams', { ...stream, id: 's2', slug: 's2' });
    const person = {
      slug: 'p',
      name_am: 'ሀ',
      name_en: 'P',
      aliases: [],
      figure_kind: 'king',
      importance: 1,
      stream_id: 's1',
      refs: [],
    };
    await put('people', {
      ...person,
      id: 'p1',
      refs: [{ book_id: 'nope', chapter: 1, verse_start: 1 }],
    });
    await put('reigns', { id: 'r1', person_id: 'p1', stream_id: 's2', coregency_flag: false });
    await put('reigns', { id: 'r2', person_id: 'p1', stream_id: 's2', coregency_flag: true });
    await put('relationships', {
      id: 'x',
      person_a_id: 'p1',
      person_b_id: 'p1',
      type: 'allied',
      label_am: 'ሀ',
      refs: [],
    });

    const errors = (await validateContent({ dir })).map((e) => `${e.path}: ${e.message}`);
    expect(errors.sort()).toEqual(
      [
        'refs[0].book_id: book_id "nope" not found in books',
        'stream_id: reign stream "s2" differs from person\'s stream "s1" (set coregency_flag if intended)',
        'person_b_id: person_a_id and person_b_id must differ',
      ].sort(),
    );
  });
});
