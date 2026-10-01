import type { Readable } from "node:stream";

/** Reads a response body as UTF-8 up to `maxBytes`, destroying the stream once the cap is hit. */
export async function readCappedBody(
  body: Readable,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  // Bounded: each pass consumes a chunk and the cap stops the loop.
  for await (const chunk of body) {
    const bytes: Uint8Array = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    const room = maxBytes - received;
    if (bytes.byteLength > room) {
      text += decoder.decode(bytes.subarray(0, room));
      body.destroy();
      return { text, truncated: true };
    }
    received += bytes.byteLength;
    text += decoder.decode(bytes, { stream: true });
  }
  return { text: text + decoder.decode(), truncated: false };
}
