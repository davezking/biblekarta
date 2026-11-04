// The perf builds (P2-S3-T7), made once per `pnpm perf` run by global-setup.ts:
//
// - `seeded/`: a preview-style build (BK_SEED=1), as the Cloudflare preview ships. LCP and the JS
//   budgets are measured on it.
// - `stress/`: the same build, with its chart data (/data/index.json and the tiles) recompiled from
//   the synthetic stress seed (scripts/stress-seed.mjs). Frame times are measured on it.
//
// The stress data only ever exists in a temp folder and in these perf builds, under
// node_modules/.cache/: never in seed/, content/, public/ or a normal build. Builds go on the
// checkout's own file system, not os.tmpdir(): `astro build` moves assets with fs.rename, which
// fails across mounts (EXDEV).
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { compileData } from '../../src/build/compile-data';
import { writeStressSeed } from '../../scripts/stress-seed.mjs';

const run = promisify(execFile);

export const PERF_DIR = join(process.cwd(), 'node_modules', '.cache', 'bk-perf');
export const SEEDED_DIR = join(PERF_DIR, 'seeded');
export const STRESS_DIR = join(PERF_DIR, 'stress');

const exists = (p: string) =>
  stat(p).then(
    () => true,
    () => false,
  );

/** Builds both perf sites. With PERF_REUSE=1, keeps builds from an earlier run (local iteration). */
export async function buildPerfSites(log: (m: string) => void = console.log): Promise<void> {
  if (process.env.PERF_REUSE === '1' && (await exists(SEEDED_DIR)) && (await exists(STRESS_DIR))) {
    log('perf: reusing the builds in node_modules/.cache/bk-perf (PERF_REUSE=1)');
    return;
  }
  await rm(PERF_DIR, { recursive: true, force: true });
  await mkdir(PERF_DIR, { recursive: true });

  log('perf: building the seeded preview site…');
  await run('pnpm', ['exec', 'astro', 'build', '--outDir', SEEDED_DIR], {
    env: { ...process.env, BK_SEED: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });

  log('perf: recompiling its chart data from the stress seed…');
  await cp(SEEDED_DIR, STRESS_DIR, { recursive: true });
  await rm(join(STRESS_DIR, 'data', 'index.json'), { force: true });
  await rm(join(STRESS_DIR, 'data', 'tiles'), { recursive: true, force: true });
  const seedDir: string = await writeStressSeed(await mkdtemp(join(tmpdir(), 'bk-stress-')));
  try {
    await compileData({
      contentDir: 'content',
      seedDir,
      outDir: join(STRESS_DIR, 'data'),
      env: { BK_SEED: '1' },
      buildId: 'perf-stress',
      logger: { info: (m) => log(`perf: ${m}`), warn: (m) => log(`perf: ${m}`) },
    });
  } finally {
    await rm(seedDir, { recursive: true, force: true });
  }
}
