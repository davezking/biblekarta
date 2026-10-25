import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

// Demo step 9: production builds (no BK_SEED) have no /dev/ pages and never ship the fixture
// test book (copy-scripture.ts). Each test runs its own `astro build` into a temp folder, once (desktop only).
const run = promisify(execFile);
test.describe.configure({ mode: 'serial' });
test.skip(({ isMobile }) => isMobile, 'one build is enough (desktop project only)');
test.setTimeout(180_000);

const FIXTURES = {
  SCRIPTURE_DIR: 'scripture-fixtures',
  BK_SCRIPTURE: 'fixtures',
  SCRIPTURE_VERSION: 'fixtures',
};

async function build(env: Record<string, string>) {
  const outDir = await mkdtemp(join(tmpdir(), 'bk-prod-'));
  const base = { ...process.env };
  delete base.BK_SEED;
  delete base.BK_ALLOW_FIXTURE_SCRIPTURE;
  try {
    const { stdout, stderr } = await run('pnpm', ['exec', 'astro', 'build', '--outDir', outDir], {
      env: { ...base, ...env },
      maxBuffer: 32 * 1024 * 1024,
    });
    return { ok: true, output: stdout + stderr, outDir };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}`, outDir };
  }
}

async function files(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(join(e.parentPath, e.name));
  }
  return out;
}

test('a production build refuses the fixture book once a text release is pinned', async () => {
  const lockDir = await mkdtemp(join(tmpdir(), 'bk-lock-'));
  const lock = join(lockDir, 'scripture.lock');
  await writeFile(lock, `${'a'.repeat(40)}\n`); // a pinned release, but only fixtures fetched
  const { ok, output, outDir } = await build({ ...FIXTURES, SCRIPTURE_LOCK_FILE: lock });
  try {
    expect(ok).toBe(false);
    expect(output).toContain('production build refused');
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(lockDir, { recursive: true, force: true });
  }
});

test('with no release pinned, production builds with no scripture, no /dev/ and no seed', async () => {
  const lockDir = await mkdtemp(join(tmpdir(), 'bk-lock-'));
  const lock = join(lockDir, 'scripture.lock');
  await writeFile(lock, 'none\n'); // as before the first text release (text-v1)
  const { ok, output, outDir } = await build({ ...FIXTURES, SCRIPTURE_LOCK_FILE: lock });
  try {
    expect(ok, output).toBe(true);
    expect(output).toContain('removed /dev/*');
    expect(output).toContain('no scripture published');
    const all = await files(outDir);
    expect(all.filter((f) => f.startsWith(join(outDir, 'data', 'scripture')))).toEqual([]);
    expect(all.some((f) => f.startsWith(join(outDir, 'dev')))).toBe(false);
    for (const f of all.filter((f) => /\.(html|json|js)$/.test(f))) {
      const body = await readFile(f, 'utf8');
      expect(body, f).not.toContain('"fixture": true'); // seed/ files never ship
      expect(body, f).not.toContain('fixture-not-scripture'); // nor the fixture test book
      expect(body, f).not.toMatch(/href="\/dev\//);
    }
    const index = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(index).toContain('የመጽሐፍ ቅዱስ ካርታ');
  } finally {
    await rm(outDir, { recursive: true, force: true });
    await rm(lockDir, { recursive: true, force: true });
  }
});
