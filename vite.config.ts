import { defineConfig } from "vitest/config";

// Static site, no backend. The converter runs in a Web Worker that must be
// emitted as a real same-origin file so the CSP (`worker-src 'self'`,
// `script-src 'self'`) can stay strict. See SECURITY_AND_PRIVACY section 5.
export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    // Never inline assets/workers as data: or blob: URIs (CSP blocks them).
    assetsInlineLimit: 0,
    // Keep the built HTML free of injected inline scripts.
    modulePreload: { polyfill: false },
  },
  worker: {
    // ES-module worker, loaded with: new Worker(new URL("./worker.ts", import.meta.url), { type: "module" })
    format: "es",
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/differential.test.ts"],
    // Playwright specs live in tests/e2e and are not run by Vitest.
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
