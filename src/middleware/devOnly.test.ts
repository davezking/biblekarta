import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { devOnly, devPagesEnabled } from './devOnly';

async function fakeDist(): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), 'bk-dist-'));
  await mkdir(join(dist, 'dev', 'playground'), { recursive: true });
  await writeFile(join(dist, 'dev', 'playground', 'index.html'), '<h1>dev</h1>');
  await writeFile(join(dist, 'index.html'), '<h1>home</h1>');
  return dist;
}

async function runBuildDone(env: Record<string, string | undefined>, dist: string) {
  const hook = devOnly(env).hooks['astro:build:done'];
  const logger = { info: () => {} };
  // Only `dir` and `logger` are used by the hook.
  await (hook as (o: unknown) => Promise<void>)({ dir: pathToFileURL(dist + '/'), logger });
}

describe('devOnly', () => {
  it('is enabled only with BK_SEED=1', () => {
    expect(devPagesEnabled({ BK_SEED: '1' })).toBe(true);
    expect(devPagesEnabled({})).toBe(false);
    expect(devPagesEnabled({ BK_SEED: '0' })).toBe(false);
  });

  it('removes dist/dev from a production build', async () => {
    const dist = await fakeDist();
    await runBuildDone({}, dist);
    expect(existsSync(join(dist, 'dev'))).toBe(false);
    expect(existsSync(join(dist, 'index.html'))).toBe(true);
  });

  it('keeps dist/dev in a seeded (preview) build', async () => {
    const dist = await fakeDist();
    await runBuildDone({ BK_SEED: '1' }, dist);
    expect(existsSync(join(dist, 'dev', 'playground', 'index.html'))).toBe(true);
  });
});
