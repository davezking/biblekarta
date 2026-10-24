// pnpm validate [--dir content] [--with-seed] [--seed-dir seed] [--format text|json]
// Parses every collection with its schema, then checks referential integrity.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { COLLECTIONS, loadBooks, type CollectionName } from '../lib/core/schema';

export interface ValidationError {
  file: string;
  path: string;
  message: string;
}

interface Entry {
  collection: CollectionName;
  file: string;
  data: Record<string, unknown>;
}

export interface ValidateOptions {
  dir?: string;
  withSeed?: boolean;
  seedDir?: string;
  scriptureDir?: string;
}

/** Which collection each *_id field points into. */
const ID_TARGETS: Record<string, CollectionName | 'books'> = {
  stream_id: 'streams',
  parent_stream_id: 'streams',
  person_id: 'people',
  person_a_id: 'people',
  person_b_id: 'people',
  source_id: 'sources',
  anchor_id: 'anchors',
  book_id: 'books',
};

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (out, key) =>
      typeof key === 'number' ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key),
    '',
  );
}

async function readCollection(
  root: string,
  collection: CollectionName,
  errors: ValidationError[],
): Promise<Entry[]> {
  const dir = join(root, collection);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const entries: Entry[] = [];
  for (const name of names) {
    const file = relative(process.cwd(), join(dir, name));
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
    } catch (err) {
      errors.push({ file, path: '', message: `invalid JSON: ${(err as Error).message}` });
      continue;
    }
    const result = COLLECTIONS[collection].safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ file, path: formatPath(issue.path), message: issue.message });
      }
      continue;
    }
    entries.push({ collection, file, data: result.data as Record<string, unknown> });
  }
  return entries;
}

/** Visits every *_id field we know about, anywhere in the entry (DateValues, refs…). */
function walkIds(
  value: unknown,
  path: PropertyKey[],
  visit: (key: string, id: string, path: PropertyKey[], parent: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkIds(v, [...path, i], visit));
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const [key, v] of Object.entries(obj)) {
      if (key in ID_TARGETS && typeof v === 'string') visit(key, v, [...path, key], obj);
      else walkIds(v, [...path, key], visit);
    }
  }
}

/**
 * Hook: will check that every ScriptureRef's chapter and verses exist (scan numbering)
 * once the verse counts are available (P1-S3-T5). Does nothing yet.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- placeholder until P1-S3-T5
export function checkVerseRanges(_entries: Entry[], _errors: ValidationError[]): void {}

export async function validateContent(opts: ValidateOptions = {}): Promise<ValidationError[]> {
  const { dir = 'content', withSeed = false, seedDir = 'seed' } = opts;
  const errors: ValidationError[] = [];
  const collections = Object.keys(COLLECTIONS) as CollectionName[];

  // 1. Parse. With --with-seed, seed entries fill in ids that content doesn't have.
  const byCollection = new Map<CollectionName, Entry[]>();
  for (const c of collections) {
    const content = await readCollection(dir, c, errors);
    if (withSeed) {
      const ids = new Set(content.map((e) => e.data.id));
      const seed = (await readCollection(seedDir, c, errors)).filter((e) => !ids.has(e.data.id));
      content.push(...seed);
    }
    byCollection.set(c, content);
  }

  // 2. Unique ids and slugs per collection.
  const ids = new Map<string, Set<string>>();
  for (const [c, entries] of byCollection) {
    const seenIds = new Map<string, string>();
    const seenSlugs = new Map<string, string>();
    for (const e of entries) {
      const id = e.data.id as string;
      const other = seenIds.get(id);
      if (other)
        errors.push({
          file: e.file,
          path: 'id',
          message: `duplicate id "${id}" (also in ${other})`,
        });
      else seenIds.set(id, e.file);
      const slug = e.data.slug as string | undefined;
      if (slug !== undefined) {
        const otherSlug = seenSlugs.get(slug);
        if (otherSlug)
          errors.push({
            file: e.file,
            path: 'slug',
            message: `duplicate slug "${slug}" in ${c} (also in ${otherSlug})`,
          });
        else seenSlugs.set(slug, e.file);
      }
    }
    ids.set(c, new Set(seenIds.keys()));
  }
  ids.set('books', new Set((await loadBooks(opts.scriptureDir)).map((b) => b.id)));

  // 3. Referential integrity.
  const all = [...byCollection.values()].flat();
  const people = new Map((byCollection.get('people') ?? []).map((e) => [e.data.id, e.data]));
  for (const e of all) {
    walkIds(e.data, [], (key, id, path, parent) => {
      const target = ID_TARGETS[key];
      if (ids.get(target)?.has(id)) return;
      const message =
        key === 'anchor_id' && parent.method === 'derived'
          ? `derived date's anchor "${id}" not found in anchors`
          : `${key} "${id}" not found in ${target}`;
      errors.push({ file: e.file, path: formatPath(path), message });
    });

    if (e.collection === 'relationships' && e.data.person_a_id === e.data.person_b_id) {
      errors.push({
        file: e.file,
        path: 'person_b_id',
        message: 'person_a_id and person_b_id must differ',
      });
    }

    if (e.collection === 'reigns' && !e.data.coregency_flag) {
      const person = people.get(e.data.person_id);
      if (person && person.stream_id !== e.data.stream_id) {
        errors.push({
          file: e.file,
          path: 'stream_id',
          message: `reign stream "${String(e.data.stream_id)}" differs from person's stream "${String(person.stream_id)}" (set coregency_flag if intended)`,
        });
      }
    }
  }

  checkVerseRanges(all, errors);
  return errors;
}

export function formatText(errors: ValidationError[]): string {
  const byFile = new Map<string, ValidationError[]>();
  for (const e of errors) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  const lines: string[] = [];
  for (const [file, errs] of byFile) {
    lines.push(file);
    for (const e of errs) lines.push(`  ${e.path || '(root)'}: ${e.message}`);
  }
  lines.push(`${errors.length} error${errors.length === 1 ? '' : 's'}`);
  return lines.join('\n');
}

function parseArgs(argv: string[]): ValidateOptions & { format: 'text' | 'json' } {
  const opts: ValidateOptions & { format: 'text' | 'json' } = { format: 'text' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === '--dir') opts.dir = value();
    else if (arg === '--seed-dir') opts.seedDir = value();
    else if (arg === '--with-seed') opts.withSeed = true;
    else if (arg === '--format') {
      const f = value();
      if (f !== 'text' && f !== 'json') throw new Error(`--format must be text or json, got ${f}`);
      opts.format = f;
    } else throw new Error(`unknown argument ${arg}`);
  }
  return opts;
}

async function main(): Promise<void> {
  const { format, ...opts } = parseArgs(process.argv.slice(2));
  const errors = await validateContent(opts);
  console.log(
    format === 'json'
      ? JSON.stringify({ count: errors.length, errors }, null, 2)
      : formatText(errors),
  );
  process.exit(errors.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  });
}
