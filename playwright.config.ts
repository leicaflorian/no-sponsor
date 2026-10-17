import { defineConfig } from '@playwright/test';

// e2e tests with the extension loaded in Chromium. NSP_EXT=legacy tests 0.1.0 (tag v0.1.0),
// otherwise the WXT build in .output/chrome-mv3.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
});
