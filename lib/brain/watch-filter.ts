/** Git internals and hidden files never affect the index. */
export function isIgnoredChange(filename: string | null): boolean {
  if (!filename) return false;
  return filename.split(/[\\/]/).some((segment) => segment.startsWith("."));
}
