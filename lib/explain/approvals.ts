/** "3 research targets waiting for your OK": shared by Settings and the Actions board's note. */
export function approvalsPhrase(count: number): string {
  return `${count} research ${count === 1 ? "target" : "targets"} waiting for your OK`;
}
