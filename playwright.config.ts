import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.03,
    },
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        ...devices['Desktop Chrome'],
        ...(isCI ? {} : { channel: 'chrome' }),
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'desktop-ultrawide',
      use: {
        ...devices['Desktop Chrome'],
        ...(isCI ? {} : { channel: 'chrome' }),
        viewport: { width: 2560, height: 1440 },
      },
    },
    {
      name: 'mobile-pixel',
      use: {
        ...devices['Pixel 7'],
        ...(isCI ? {} : { channel: 'chrome' }),
      },
    },
    {
      name: 'mobile-small-320',
      use: {
        ...devices['iPhone SE'],
        browserName: 'chromium',
        ...(isCI ? {} : { channel: 'chrome' }),
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: 'tablet-ipad',
      use: {
        ...devices['iPad Mini'],
        browserName: 'chromium',
        ...(isCI ? {} : { channel: 'chrome' }),
      },
    },
    ...(isCI
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
          },
          {
            name: 'edge',
            use: { ...devices['Desktop Edge'], channel: 'msedge' },
          },
        ]
      : []),
  ],
});
