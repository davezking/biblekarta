// How Bible text enters the site build. First the whole scripture folder is verified
// (verifyScripture: checksums, verse counts and the text rules). Then the verified book files are
// copied byte-for-byte (fs.copyFile, never parsed and re-written) to public/data/scripture/, and
// each copy is compared with its source and re-hashed against checksums.json.
//
// Production (no BK_SEED=1) never ships the fixture test book:
// - with real text (BK_SCRIPTURE=real), every book must be the Society's edition (EDITION);
// - with no text release yet (scripture.lock is "none"), it ships no scripture at all, so the
//   site builds and verses show "በዝግጅት ላይ";
// - with a release pinned but only the fixtures fetched (no SCRIPTURE_TOKEN), it refuses.
// BK_ALLOW_FIXTURE_SCRIPTURE=1 is a CI-only escape hatch for fork PRs; it must never be set in
// Cloudflare (docs/deploy.md).
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import {
  EDITION,
  readBookFiles,
  resolveScriptureEnv,
  verifyScripture,
  verseHash,
  type BookFile,
  type ScriptureEnv,
} from './verify-scripture';

type Env = Record<string, string | undefined>;

const SHA = /^[0-9a-f]{40}$/;

/**
 * What a build may publish: 'copy' the verified books, or 'none' (production with no text
 * release yet). Throws when a production build would ship the fixture test book.
 */
export function checkProductionGuard(
  scripture: ScriptureEnv,
  env: Env = process.env,
  lock = 'none',
): 'copy' | 'none' {
  const preview = env.BK_SEED === '1';
  const allowed = env.BK_ALLOW_FIXTURE_SCRIPTURE === '1';
  if (scripture.BK_SCRIPTURE !== 'fixtures' || preview || allowed) return 'copy';
  if (!SHA.test(lock.trim())) return 'none';
  throw new Error(
    'production build refused: scripture.lock pins a text release, but only the fixture test ' +
      'book was fetched (BK_SCRIPTURE=fixtures). Set SCRIPTURE_TOKEN and run scripts/fetch-scripture.sh.',
  );
}

/**
 * Verify, then copy the verified books byte-for-byte and prove each copy against its source and
 * checksums. With `requireEdition`, every published book must be the Society's edition.
 */
export async function copyScripture(
  scriptureDir: string,
  outDir: string,
  { requireEdition = false }: { requireEdition?: boolean } = {},
): Promise<{ copied: string[]; skipped: string[] }> {
  const { problems } = await verifyScripture(scriptureDir);
  if (problems.length) {
    const shown = problems.slice(0, 10).join('\n  ');
    throw new Error(`scripture in ${scriptureDir} failed verification:\n  ${shown}`);
  }
  const checksums = JSON.parse(
    await readFile(join(scriptureDir, 'checksums.json'), 'utf8'),
  ) as Record<string, string>;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const copied: string[] = [];
  const skipped: string[] = [];
  for (const { file, path, bytes, book } of await readBookFiles(scriptureDir)) {
    if (book.status !== 'verified') {
      skipped.push(file);
      continue;
    }
    if (requireEdition && book.edition !== EDITION) {
      throw new Error(`${file}: edition ${JSON.stringify(book.edition)} is not ${EDITION}`);
    }
    const dest = join(outDir, file);
    await copyFile(path, dest);
    const copy = await readFile(dest);
    if (!copy.equals(bytes)) throw new Error(`${file}: the copy differs from the source`);
    for (const ch of (JSON.parse(copy.toString('utf8')) as BookFile).chapters) {
      for (const v of ch.verses) {
        const ref = `${book.book}.${ch.n}.${v.n}`;
        if (checksums[ref] !== verseHash(v.t))
          throw new Error(`${ref}: checksum mismatch in the copy`);
      }
    }
    copied.push(file);
  }
  return { copied, skipped };
}

async function readLock(path: string): Promise<string> {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'none';
    throw err;
  }
}

export function copyScriptureIntegration(env: Env = process.env): AstroIntegration {
  let scripture: ScriptureEnv;
  let plan: 'copy' | 'none' = 'copy';
  let publicDir: URL;
  const run = async (logger: { info: (m: string) => void; warn: (m: string) => void }) => {
    const out = fileURLToPath(new URL('data/scripture/', publicDir));
    if (plan === 'none') {
      await rm(out, { recursive: true, force: true });
      await mkdir(out, { recursive: true });
      logger.warn(
        'no scripture published: scripture.lock pins no text release yet (production shows "በዝግጅት ላይ")',
      );
      return;
    }
    const production = env.BK_SEED !== '1' && env.BK_ALLOW_FIXTURE_SCRIPTURE !== '1';
    const { copied, skipped } = await copyScripture(scripture.SCRIPTURE_DIR, out, {
      requireEdition: production,
    });
    logger.info(
      `scripture ${scripture.SCRIPTURE_VERSION} (${scripture.BK_SCRIPTURE}): copied ${copied.length} ` +
        `verified books${skipped.length ? `, skipped ${skipped.length} unverified` : ''}`,
    );
  };
  return {
    name: 'bk-copy-scripture',
    hooks: {
      'astro:config:setup': async ({ command, config, logger }) => {
        scripture = await resolveScriptureEnv(env);
        publicDir = config.publicDir;
        // SCRIPTURE_LOCK_FILE: tests point this at a temporary lock file.
        const lock = await readLock(env.SCRIPTURE_LOCK_FILE ?? 'scripture.lock');
        if (command === 'build') plan = checkProductionGuard(scripture, env, lock);
        if (command === 'dev') await run(logger);
      },
      'astro:build:start': async ({ logger }) => run(logger),
    },
  };
}
