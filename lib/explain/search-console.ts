/** What Search Console's totals mean, in a sentence (the numbers sit small inside it). */
export function searchSummarySentence(
  clicks: number,
  impressions: number,
  format: (n: number) => string,
): string {
  const shown = `${format(impressions)} ${impressions === 1 ? "time" : "times"}`;
  const people =
    clicks === 0
      ? "nobody clicked through"
      : `${format(clicks)} ${clicks === 1 ? "person" : "people"} clicked through`;
  return `Google showed your pages ${shown}, and ${people}.`;
}
