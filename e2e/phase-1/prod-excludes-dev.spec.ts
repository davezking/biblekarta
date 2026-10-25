import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';

// Demo step 9: production builds (no BK_SEED) have no /dev/ pages and never ship the fixture
// test book. Each test runs its own `astro build` into a temp folder, once (desktop only).
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

test('a production build refuses the fixture scripture', async () => {
  const { ok, output, outDir } = await build(FIXTURES);
  try {
    expect(ok).toBe(false);
    expect(output).toContain('production build refused');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('a production build has no /dev/ routes and no seed data', async () => {
  // The CI-only escape hatch lets this run without the real text; Cloudflare never sets it.
  const { ok, output, outDir } = await build({ ...FIXTURES, BK_ALLOW_FIXTURE_SCRIPTURE: '1' });
  try {
    expect(ok, output).toBe(true);
    expect(output).toContain('removed /dev/*');
    const all = await files(outDir);
    expect(all.some((f) => f.includes(`${join(outDir, 'dev')}`))).toBe(false);
    for (const f of all.filter((f) => /\.(html|json|js)$/.test(f))) {
      const body = await readFile(f, 'utf8');
      expect(body, f).not.toContain('"fixture": true'); // seed/ files never ship
      expect(body, f).not.toMatch(/href="\/dev\//);
    }
    const index = await readFile(join(outDir, 'index.html'), 'utf8');
    expect(index).toContain('የመጽሐፍ ቅዱስ ካርታ');
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
