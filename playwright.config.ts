import { defineConfig } from "@playwright/test";
import fs from "node:fs";

const DB = "/tmp/clarity-e2e/e2e.db";
fs.rmSync("/tmp/clarity-e2e", { recursive: true, force: true });
fs.mkdirSync("/tmp/clarity-e2e", { recursive: true });

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    launchOptions: { executablePath: process.env.CLARITY_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: {
    command: "npx next build && npx next start -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 300_000,
    env: { CLARITY_DB_PATH: DB, ANTHROPIC_API_KEY: "" },
  },
});
