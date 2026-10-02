/** The same prompt plus the checker's reason, for the one retry. */
export function retryPrompt(prompt: string, reason: string): string {
  return `${prompt}
Your previous output was rejected by Harbour's checker: ${reason}
Write the same file again from scratch, fixing that and changing nothing else.
`;
}
