// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import { devOnly } from './src/middleware/devOnly';
import { copyScriptureIntegration } from './src/build/copy-scripture';
import { compileDataIntegration } from './src/build/compile-data';

export default defineConfig({
  output: 'static',
  site: 'https://biblekarta.com',
  // devOnly() strips /dev/* from builds unless BK_SEED=1 (previews); see its comment.
  // copyScriptureIntegration() copies the verified books byte-for-byte to /data/scripture/ and
  // refuses a production build that would ship the fixture test book.
  // compileDataIntegration() writes /data/index.json and the era tiles (seed only when BK_SEED=1).
  integrations: [react(), devOnly(), copyScriptureIntegration(), compileDataIntegration()],
});
