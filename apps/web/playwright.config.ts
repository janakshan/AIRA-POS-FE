import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;

/**
 * Responsive validation at the three target viewports
 * (SOURCES/02_Prototype/05_UI_DESIGN_SYSTEM.md): desktop 1366×768, tablet 1024×768, mobile 390×844.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'en-LK',
    timezoneId: 'Asia/Colombo',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
