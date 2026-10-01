import { mkdirSync, writeFileSync } from "node:fs";
import { createSession } from "@/lib/auth/sessions";
import { migrateDb, openDb } from "@/lib/db/client";
import { E2E_DB, E2E_LOGIN } from "../../playwright.config";
import { sessionStorageState } from "./session-state";

/** Creates a real session with production code and hands its cookie to the browser. */
export default function globalSetup() {
  const db = openDb(E2E_DB);
  migrateDb(db);
  const { token, expiresAt } = createSession(db, E2E_LOGIN, null);
  mkdirSync("./data", { recursive: true });
  writeFileSync(
    "./data/e2e-storage.json",
    JSON.stringify(sessionStorageState(token, Math.floor(expiresAt.getTime() / 1000))),
  );
}
