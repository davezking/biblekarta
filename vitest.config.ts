import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripture-fixtures/**/*.test.ts'],
  },
});
