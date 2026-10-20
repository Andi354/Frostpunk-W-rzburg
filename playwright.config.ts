import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/browser',
  timeout: 60_000,
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  projects: [{ name: 'phone', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
