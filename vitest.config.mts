import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx", "deploy/**/*.test.mjs"],
    exclude: ["node_modules", ".next", "tests/e2e/**", ".superpowers"],
    setupFiles: ["./tests/setup.ts"],
    // A valid, generic environment for code that reads getConfig(). The config path is pinned
    // to the example so tests never depend on a local harbour.config.json.
    env: {
      HARBOUR_ALLOWED_LOGINS: "owner@example.com",
      HARBOUR_ORIGIN: "https://harbour.example.ts.net",
      HARBOUR_RP_ID: "harbour.example.ts.net",
      HARBOUR_CONFIG_PATH: "./harbour.config.example.json",
    },
  },
});
