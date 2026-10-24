// Runs scripts/fetch-scripture.sh for real, in a temp directory, against a local git repo
// standing in for biblekarta-scripture (SCRIPTURE_REMOTE), with a dummy token.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = resolve('scripts/fetch-scripture.sh');
const TOKEN = 'dummy-secret-token-0123456789';

function run(cwd: string, env: Record<string, string>) {
  const r = spawnSync('bash', [SCRIPT], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env },
  });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

async function workdir(lock: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bk-fetch-'));
  await writeFile(join(dir, 'scripture.lock'), `${lock}\n`);
  return dir;
}

async function scriptureRepo(): Promise<{ path: string; sha: string }> {
  const path = await mkdtemp(join(tmpdir(), 'bk-scripture-repo-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: path, encoding: 'utf8' }).trim();
  git('init', '-q');
  await mkdir(join(path, 'scripture'), { recursive: true });
  await writeFile(join(path, 'scripture/checksums.json'), '{}\n');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'text');
  return { path, sha: git('rev-parse', 'HEAD') };
}

describe('fetch-scripture.sh', () => {
  it('falls back to the fixtures without a token', async () => {
    const dir = await workdir('none');
    const { status, output } = run(dir, {});
    expect(status).toBe(0);
    expect(output).toContain('using scripture fixtures');
    expect(await readFile(join(dir, '.scripture.env'), 'utf8')).toBe(
      'SCRIPTURE_DIR=scripture-fixtures\nBK_SCRIPTURE=fixtures\nSCRIPTURE_VERSION=fixtures\n',
    );
  });

  it('falls back when the lock holds no SHA, without printing the token', async () => {
    const dir = await workdir('none');
    const { status, output } = run(dir, { SCRIPTURE_TOKEN: TOKEN });
    expect(status).toBe(0);
    expect(output).toContain('scripture.lock holds no commit SHA');
    expect(output).not.toContain(TOKEN);
  });

  it('fetches exactly the locked commit, without printing the token', async () => {
    const repo = await scriptureRepo();
    const dir = await workdir(repo.sha);
    const { status, output } = run(dir, { SCRIPTURE_TOKEN: TOKEN, SCRIPTURE_REMOTE: repo.path });
    expect(status, output).toBe(0);
    expect(output).toContain(`using scripture ${repo.sha}`);
    expect(output).not.toContain(TOKEN);
    const head = execFileSync('git', ['-C', join(dir, '.scripture'), 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    });
    expect(head.trim()).toBe(repo.sha);
    expect(await readFile(join(dir, '.scripture.env'), 'utf8')).toBe(
      `SCRIPTURE_DIR=.scripture/scripture\nBK_SCRIPTURE=real\nSCRIPTURE_VERSION=${repo.sha}\n`,
    );
  });

  it('fails (without printing the token) when the locked commit cannot be fetched', async () => {
    const repo = await scriptureRepo();
    const dir = await workdir('0'.repeat(40));
    const { status, output } = run(dir, { SCRIPTURE_TOKEN: TOKEN, SCRIPTURE_REMOTE: repo.path });
    expect(status).not.toBe(0);
    expect(output).not.toContain(TOKEN);
  });
});
