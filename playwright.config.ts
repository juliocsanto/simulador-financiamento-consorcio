import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE = '/simulador-financiamento-consorcio/';
const remoto = process.env.BASE_URL;
const baseURL = remoto ?? `http://localhost:${PORT}${BASE}`;

export default defineConfig({
  testDir: 'e2e',
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: remoto
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
