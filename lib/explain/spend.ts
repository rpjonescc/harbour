// Paid-data spend in words, for Today's cost meter and the tower's Spend light.

export const NO_PAID_DATA =
  "No paid data connected — Harbour is using free data only, so nothing is being spent.";

/** Followed by a link to the guide on setting one. */
export const NO_BUDGET = "Paid data is off until you set a monthly budget";

/** "A$4.10 of A$20.00": amounts already formatted. */
export function spendOfBudget(spent: string, cap: string): string {
  return `${spent} of ${cap}`;
}

/** `until` is the formatted day paid data resumes. */
export function budgetReachedLine(until: string): string {
  return `Budget reached — paid data is paused until ${until}.`;
}
