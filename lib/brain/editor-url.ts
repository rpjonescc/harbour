/** Editor deep link for a file, or null when the template is empty (button hidden). */
export function editorUrlFor(template: string, absolutePath: string): string | null {
  const encodedPath = absolutePath.split("/").map(encodeURIComponent).join("/");
  return template ? template.replace("{path}", encodedPath) : null;
}
