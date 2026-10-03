/**
 * Plain words for why a sub-score is missing, keyed on the reasons lib/scan/scoring stores
 * (first match wins).
 */
const REASONS: readonly (readonly [RegExp, string])[] = [
  [
    /measured in the outside view, not counted in the score yet/,
    "Measured in How the web sees you, not counted in the score yet.",
  ],
  [
    /needs? (?:API keys|a rankings API key)/,
    "Needs paid data, which isn't connected yet, so it isn't counted.",
  ],
  [/is not connected/, "Not connected yet, so it isn't counted."],
  [
    /was skipped and has no earlier result/,
    "Speed data is still arriving, so it isn't counted yet.",
  ],
  [
    /is more than \d+ days old/,
    "The last speed test is more than two weeks old, so it isn't counted until the next one.",
  ],
  [/failed in this scan/, "The data didn't arrive in the last check, so it isn't counted for now."],
  [
    /was skipped in this scan|did not run in this scan/,
    "This wasn't checked last time, so it isn't counted for now.",
  ],
  [
    /^(?:No earlier data|Too little volume|No full baseline)/,
    "There isn't enough search history yet to see a trend.",
  ],
  [
    /^(?:No HTML pages were crawled|The crawl recorded no pages)/,
    "Harbour couldn't read any pages in the last check.",
  ],
  [
    /robots\.txt could not be read/,
    "Harbour couldn't read your robots.txt file in the last check.",
  ],
];

const UNKNOWN = "Harbour couldn't measure this in the last check, so it isn't counted.";

/** Why a sub-score has no number, in plain words; a reason it doesn't know reads generically. */
export function missingLine(evidence: string): string {
  return REASONS.find(([pattern]) => pattern.test(evidence))?.[1] ?? UNKNOWN;
}
