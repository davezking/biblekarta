// /dev/* pages are preview-only tools and must never reach a production build.
// Previews build with BK_SEED=1; production doesn't. Without it, this integration deletes
// dist/dev after the build. That is simpler and more reliable than guarding each page
// (static .astro pages have no getStaticPaths to return [] from). CI double-checks with
// `test ! -d dist/dev` after the production build.
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';

export function devPagesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BK_SEED === '1';
}

export function devOnly(env: Record<string, string | undefined> = process.env): AstroIntegration {
  return {
    name: 'bk-dev-only',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        if (devPagesEnabled(env)) return;
        await rm(fileURLToPath(new URL('dev/', dir)), { recursive: true, force: true });
        logger.info('removed /dev/* (production build: BK_SEED is not 1)');
      },
    },
  };
}
