/** Reads a response body as UTF-8 up to `maxBytes`, cancelling the stream once the cap is hit. */
export async function readCappedBody(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!body) return { text: "", truncated: false };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  // Bounded: each pass consumes a chunk and the cap stops the loop.
  while (true) {
    const { done, value } = await reader.read();
    if (done) return { text: text + decoder.decode(), truncated: false };
    const room = maxBytes - received;
    if (value.byteLength > room) {
      text += decoder.decode(value.subarray(0, room));
      await reader.cancel();
      return { text, truncated: true };
    }
    received += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
}
