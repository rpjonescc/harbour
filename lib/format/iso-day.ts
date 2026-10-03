// Calendar dates written YYYY-MM-DD: the one strict check, schema and day arithmetic. Pure.

import { z } from "zod";

const DAY_MS = 24 * 60 * 60_000;
const SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const toDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Whether `value` is a real calendar date written YYYY-MM-DD ("2026-02-31" is not). */
export function isIsoDay(value: string): boolean {
  if (!SHAPE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  // Date.parse rolls impossible days over (2026-02-31 → March 3); the round trip refuses those.
  return !Number.isNaN(ms) && toDay(ms) === value;
}

/** A real calendar date written YYYY-MM-DD, for data that comes from outside. */
export const isoDaySchema = z
  .string()
  .refine(isIsoDay, { message: "Expected a real date written YYYY-MM-DD" });

/** Midnight UTC of `day` (YYYY-MM-DD) in ms; throws on anything that is not a real date. */
export function parseDay(day: string): number {
  if (!isIsoDay(day)) throw new Error(`Invalid date (expected YYYY-MM-DD): ${day}`);
  return Date.parse(`${day}T00:00:00Z`);
}

/** `day` moved by `days` calendar days (in UTC, so no zone shifts it). */
export function addDays(day: string, days: number): string {
  return toDay(parseDay(day) + days * DAY_MS);
}
