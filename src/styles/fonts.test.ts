import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = 'public/fonts';

describe('self-hosted fonts', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.woff2'));

  it('ships both families as WOFF2', () => {
    expect(files.some((f) => f.startsWith('AbyssinicaSIL'))).toBe(true);
    expect(files.some((f) => f.startsWith('NotoSansEthiopic'))).toBe(true);
  });

  it('keeps the total WOFF2 payload ≤ 250 KB', () => {
    const total = files.reduce((sum, f) => sum + statSync(join(DIR, f)).size, 0);
    expect(total).toBeLessThanOrEqual(250 * 1024);
  });
});
