// How Bible text enters the site build. The verified book files are copied byte-for-byte
// (fs.copyFile, never parsed and re-written) to public/data/scripture/, then each copy is
// compared with its source and re-hashed against checksums.json.
//
// Production guard: a production build (no BK_SEED=1) refuses the fixture test book, so the
// live site can never ship it. BK_ALLOW_FIXTURE_SCRIPTURE=1 is a CI-only escape hatch for
// fork PRs; it must never be set in Cloudflare (docs/deploy.md).
import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AstroIntegration } from 'astro';
import { fileURLToPath } from 'node:url';
import {
  resolveScriptureEnv,
  verseHash,
  type BookFile,
  type ScriptureEnv,
} from './verify-scripture';

type Env = Record<string, string | undefined>;

/** Throws when a production build would ship the fixture test book. */
export function checkProductionGuard(scripture: ScriptureEnv, env: Env = process.env): void {
  const preview = env.BK_SEED === '1';
  const allowed = env.BK_ALLOW_FIXTURE_SCRIPTURE === '1';
  if (scripture.BK_SCRIPTURE === 'fixtures' && !preview && !allowed) {
    throw new Error(
      'production build refused: scripture is the fixture test book (BK_SCRIPTURE=fixtures). ' +
        'Set SCRIPTURE_TOKEN and a commit SHA in scripture.lock, then run scripts/fetch-scripture.sh.',
    );
  }
}

/** Copy the verified books byte-for-byte, then prove each copy against its source and checksums. */
export async function copyScripture(
  scriptureDir: string,
  outDir: string,
): Promise<{ copied: string[]; skipped: string[] }> {
  const checksums = JSON.parse(
    await readFile(join(scriptureDir, 'checksums.json'), 'utf8'),
  ) as Record<string, string>;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const copied: string[] = [];
  const skipped: string[] = [];
  const files = (await readdir(join(scriptureDir, 'books')))
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const file of files) {
    const src = join(scriptureDir, 'books', file);
    const original = await readFile(src);
    const book = JSON.parse(original.toString('utf8')) as BookFile;
    if (book.status !== 'verified') {
      skipped.push(file);
      continue;
    }
    const dest = join(outDir, file);
    await copyFile(src, dest);
    const copy = await readFile(dest);
    if (!copy.equals(original)) throw new Error(`${file}: the copy differs from the source`);
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

export function copyScriptureIntegration(env: Env = process.env): AstroIntegration {
  let scripture: ScriptureEnv;
  const run = async (publicDir: URL, logger: { info: (m: string) => void }) => {
    const out = fileURLToPath(new URL('data/scripture/', publicDir));
    const { copied, skipped } = await copyScripture(scripture.SCRIPTURE_DIR, out);
    logger.info(
      `scripture ${scripture.SCRIPTURE_VERSION} (${scripture.BK_SCRIPTURE}): copied ${copied.length} ` +
        `verified books${skipped.length ? `, skipped ${skipped.length} unverified` : ''}`,
    );
  };
  let publicDir: URL;
  return {
    name: 'bk-copy-scripture',
    hooks: {
      'astro:config:setup': async ({ command, config, logger }) => {
        scripture = await resolveScriptureEnv(env);
        publicDir = config.publicDir;
        if (command === 'build') checkProductionGuard(scripture, env);
        if (command === 'dev') await run(publicDir, logger);
      },
      'astro:build:start': async ({ logger }) => run(publicDir, logger),
    },
  };
}
