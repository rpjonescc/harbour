import { getTableColumns } from "drizzle-orm";
import { actionEvents } from "@/lib/db/schema";
import { ACTION_ACTORS } from "./types";

describe("ACTION_ACTORS", () => {
  // The schema and active-work once each kept their own copy of this list.
  it("is exactly what the history table's actor column accepts", () => {
    expect(getTableColumns(actionEvents).actor.enumValues).toEqual([...ACTION_ACTORS]);
  });
});
