import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// public/_headers is copied to dist/ and applied by Cloudflare Pages (architecture §6).
describe('public/_headers', () => {
  it('sets the baseline security headers for every path', async () => {
    const text = await readFile('public/_headers', 'utf8');
    const block = text.split(/^\/\*$/m)[1] ?? '';
    for (const header of [
      'Strict-Transport-Security: max-age=31536000',
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'X-Frame-Options: DENY',
      'Content-Security-Policy-Report-Only:',
      "frame-ancestors 'none'",
      "object-src 'none'",
    ])
      expect(block).toContain(header);
  });
});
