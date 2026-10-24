// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { devOnly } from './src/middleware/devOnly';

export default defineConfig({
  output: 'static',
  site: 'https://biblekarta.com',
  // devOnly() strips /dev/* from builds unless BK_SEED=1 (previews); see its comment.
  integrations: [react(), devOnly()],
});
