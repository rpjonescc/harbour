import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createSession } from "@/lib/auth/sessions";
import { migrateDb, openDb } from "@/lib/db/client";
import { brainDocs, passkeys } from "@/lib/db/schema";
import { E2E_DB, E2E_LOGIN } from "../../playwright.config";
import { sessionStorageState } from "./session-state";

/** Creates a real session with production code and hands its cookie to the browser. */
export default function globalSetup() {
  const db = openDb(E2E_DB);
  migrateDb(db);
  db.update(brainDocs)
    .set({ lastViewedAt: null })
    .where(eq(brainDocs.path, "badge-check.md"))
    .run();
  db.insert(passkeys)
    .values({
      id: "e2e-passkey",
      login: E2E_LOGIN,
      publicKey: Buffer.from([0]),
      counter: 0,
      transports: null,
      deviceLabel: "E2E browser",
      createdAt: new Date(),
      lastUsedAt: null,
    })
    .onConflictDoNothing()
    .run();
  const { token, expiresAt } = createSession(db, E2E_LOGIN, "e2e-passkey");
  mkdirSync("./data", { recursive: true });
  writeFileSync(
    "./data/e2e-storage.json",
    JSON.stringify(sessionStorageState(token, Math.floor(expiresAt.getTime() / 1000))),
  );
}
