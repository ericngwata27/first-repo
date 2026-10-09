// Settings for the automated tests (run them with: npm test)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173",
    locale: "en-GB",
    timezoneId: "Europe/London",
    browserName: "chromium",
    launchOptions: {
      // Software 3D graphics, so the globe works on machines without a graphics card
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    },
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
