// Treg bills in US dollars; the ledger and budget are in Australian dollars. Pure: no I/O.

/** Micro-USD to whole micro-AUD at `rate` AUD per USD (HARBOUR_USD_TO_AUD), rounded. */
export function usdMicroToAudMicro(microUsd: number, rate: number): number {
  return Math.round(microUsd * rate);
}
