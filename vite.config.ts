import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/differential.test.ts', 'tests/golden.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
