// Content schemas: the single source of truth for the CMS, the compiler and the tests.
// Years: traditional = AA integers (creation = AA 1); scholarly = astronomical (1 BC = 0).
import { z } from 'zod';

const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'use lowercase letters, digits, - and _');
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase kebab-case');
const Year = z.int();
const Importance = z.int().min(1).max(5);
const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'use #RRGGBB');

export const Canon = z.enum(['shared', 'ethiopian_81']);
export type Canon = z.infer<typeof Canon>;

/** Fields every entity carries. */
const entity = {
  canon: Canon.default('shared'),
  fixture: z.boolean().optional(),
};

export const YearPair = z
  .strictObject({ traditional: Year.optional(), scholarly: Year.optional() })
  .refine((v) => v.traditional !== undefined || v.scholarly !== undefined, {
    message: 'a YearPair needs traditional, scholarly or both',
  });
export type YearPair = z.infer<typeof YearPair>;

export const ScriptureRef = z
  .strictObject({
    book_id: Id,
    chapter: z.int().min(1),
    verse_start: z.int().min(1),
    verse_end: z.int().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.verse_end !== undefined && v.verse_end < v.verse_start) {
      ctx.addIssue({
        code: 'custom',
        path: ['verse_end'],
        message: `verse_end (${v.verse_end}) must be ≥ verse_start (${v.verse_start})`,
      });
    }
  });
export type ScriptureRef = z.infer<typeof ScriptureRef>;

export const DateValue = z
  .strictObject({
    start: Year.optional(),
    end: Year.optional(),
    certainty: z.enum(['exact', 'approximate', 'range', 'disputed', 'tradition_only']),
    method: z.enum(['anchor', 'derived', 'traditional', 'relative']),
    source_id: Id.optional(),
    anchor_id: Id.optional(),
    anchor_value_used: Year.optional(),
    derivation_refs: z.array(ScriptureRef).optional(),
    relative_text_am: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    const need = (field: keyof typeof v, why: string) => {
      if (v[field] === undefined) {
        ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required ${why}` });
      }
    };
    switch (v.method) {
      case 'derived':
        need('anchor_id', 'when method is "derived"');
        need('anchor_value_used', 'when method is "derived"');
        break;
      case 'traditional':
        need('source_id', 'when method is "traditional"');
        break;
      case 'relative':
        need('relative_text_am', 'when method is "relative"');
        if (v.start !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['start'],
            message: 'start must be omitted when method is "relative" (no calendar year is shown)',
          });
        }
        break;
      default:
        need('start', `when method is "${v.method}"`);
    }
    if (v.start !== undefined && v.end !== undefined && v.end < v.start) {
      ctx.addIssue({
        code: 'custom',
        path: ['end'],
        message: `end (${v.end}) must be ≥ start (${v.start})`,
      });
    }
  });
export type DateValue = z.infer<typeof DateValue>;

export const Stream = z.strictObject({
  id: Id,
  slug: Slug,
  name_am: z.string().min(1),
  name_en: z.string().min(1),
  kind: z.enum(['polity', 'ribbon', 'lane']),
  fill_color: HexColor,
  parent_stream_id: Id.optional(),
  fork: YearPair.optional(),
  end: YearPair.optional(),
  width_keyframes: z.array(z.strictObject({ at: YearPair, width: z.int().min(1).max(5) })),
  lane_order: z.int(),
  ...entity,
});
export type Stream = z.infer<typeof Stream>;

export const Era = z
  .strictObject({
    id: Id,
    slug: Slug,
    name_am: z.string().min(1),
    name_en: z.string().min(1),
    start: YearPair.optional(),
    end: YearPair.optional(),
    certainty: z.enum(['anchored', 'approximate', 'disputed', 'tradition_only']),
    status: z.enum(['live', 'coming_soon']),
    order: z.int(),
    gap: z.boolean().optional(),
    lod: z.record(z.string(), z.unknown()).optional(),
    minimap_weight: z.number().optional(),
    ...entity,
  })
  .superRefine((v, ctx) => {
    if (v.status !== 'live') return;
    for (const field of ['start', 'end'] as const) {
      if (v[field] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required when status is "live"`,
        });
      }
    }
  });
export type Era = z.infer<typeof Era>;

export const Person = z.strictObject({
  id: Id,
  slug: Slug,
  name_am: z.string().min(1),
  name_en: z.string().min(1),
  aliases: z.array(z.string().min(1)),
  figure_kind: z.enum(['king', 'queen', 'prophet', 'christ', 'apostle', 'other']),
  figure_tone: z.string().optional(),
  importance: Importance,
  stream_id: Id,
  birth_traditional: DateValue.optional(),
  birth_scholarly: DateValue.optional(),
  death_traditional: DateValue.optional(),
  death_scholarly: DateValue.optional(),
  note_am: z.string().optional(),
  note_en: z.string().optional(),
  refs: z.array(ScriptureRef),
  ...entity,
});
export type Person = z.infer<typeof Person>;

export const Reign = z.strictObject({
  id: Id,
  person_id: Id,
  stream_id: Id,
  start_traditional: DateValue.optional(),
  start_scholarly: DateValue.optional(),
  end_traditional: DateValue.optional(),
  end_scholarly: DateValue.optional(),
  coregency_flag: z.boolean(),
  ...entity,
});
export type Reign = z.infer<typeof Reign>;

export const Event = z.strictObject({
  id: Id,
  slug: Slug,
  title_am: z.string().min(1),
  title_en: z.string().min(1),
  summary_am: z.string().optional(),
  summary_en: z.string().optional(),
  stream_id: Id.optional(),
  type: z.enum(['point', 'span']),
  date_traditional: DateValue.optional(),
  date_scholarly: DateValue.optional(),
  importance: Importance,
  refs: z.array(ScriptureRef),
  note_am: z.string().optional(),
  note_en: z.string().optional(),
  ...entity,
});
export type Event = z.infer<typeof Event>;

export const Relationship = z.strictObject({
  id: Id,
  person_a_id: Id,
  person_b_id: Id,
  type: z.enum(['parent', 'married', 'succeeded', 'allied', 'opposed', 'war', 'prophesied_to']),
  label_am: z.string().min(1),
  date: DateValue.optional(),
  refs: z.array(ScriptureRef),
  ...entity,
});
export type Relationship = z.infer<typeof Relationship>;

export const Anchor = z.strictObject({
  id: Id,
  label_am: z.string().min(1),
  label_en: z.string().min(1),
  date: z
    .strictObject({ start: Year, end: Year.optional() })
    .refine((d) => d.end === undefined || d.end >= d.start, {
      message: 'end must be ≥ start',
      path: ['end'],
    }),
  external_source: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  notes: z.string().optional(),
  ...entity,
});
export type Anchor = z.infer<typeof Anchor>;

export const Source = z.strictObject({
  id: Id,
  citation: z.string().min(1),
  kind: z.enum(['tradition', 'scholarly']),
  ...entity,
});
export type Source = z.infer<typeof Source>;

/** A book from books-meta.json (scripture repo, or scripture-fixtures). Not a collection. */
export const Book = z.object({
  id: Id,
  name_am: z.string().min(1),
  name_en: z.string().min(1),
  html_name_am: z.string().nullish(),
  abbr_am: z.string().nullish(),
  testament: z.enum(['ot', 'nt']),
  order_66: z.int().min(1).max(66),
  html_order: z.int().min(1).max(66).nullish(),
  order_81: z.int().min(1).max(81).nullish(),
  period_setting: YearPair.nullish(),
  ...entity,
});
export type Book = z.infer<typeof Book>;

/** Content folder name → schema. Books are loaded separately (loadBooks). */
export const COLLECTIONS = {
  streams: Stream,
  eras: Era,
  people: Person,
  reigns: Reign,
  events: Event,
  relationships: Relationship,
  anchors: Anchor,
  sources: Source,
} as const;
export type CollectionName = keyof typeof COLLECTIONS;

/**
 * Loads $SCRIPTURE_DIR/books-meta.json, falling back to scripture-fixtures/books-meta.json.
 * Node only (build time); fs is imported lazily so this module stays browser-safe.
 */
export async function loadBooks(scriptureDir = process.env.SCRIPTURE_DIR): Promise<Book[]> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const candidates = [scriptureDir, 'scripture-fixtures'].filter((d): d is string => !!d);
  for (const dir of candidates) {
    try {
      const raw = await readFile(join(dir, 'books-meta.json'), 'utf8');
      return z.array(Book).parse(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  throw new Error(`books-meta.json not found in: ${candidates.join(', ')}`);
}
