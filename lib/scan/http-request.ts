import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** One HTTP response before its body is read. */
export type RawResponse = {
  status: number;
  /** Every header line as received, names lowercased, repeats kept apart. */
  headerLines: [string, string][];
  /** Each header's values joined with ", " (as fetch's Headers would), names lowercased. */
  headers: Record<string, string>;
  /** The decoded body. */
  body: Readable;
};

const ACCEPT_ENCODING = "gzip, deflate, br";

function decoderFor(encoding: string | undefined) {
  switch (encoding?.trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return createGunzip();
    case "deflate":
      return createInflate();
    case "br":
      return createBrotliDecompress();
    default:
      return null;
  }
}

function toResponse(message: IncomingMessage): RawResponse {
  const headerLines: [string, string][] = [];
  const headers: Record<string, string> = {};
  for (let i = 0; i + 1 < message.rawHeaders.length; i += 2) {
    const name = (message.rawHeaders[i] ?? "").toLowerCase();
    const value = message.rawHeaders[i + 1] ?? "";
    headerLines.push([name, value]);
    headers[name] = name in headers ? `${headers[name]}, ${value}` : value;
  }
  const decoder = decoderFor(headers["content-encoding"]);
  // pipeline destroys both streams on an error, so a bad encoding surfaces while reading.
  const body = decoder ? pipeline(message, decoder, () => {}) : message;
  return { status: message.statusCode ?? 0, headerLines, headers, body };
}

/**
 * One GET without following redirects. We use node:http rather than fetch because fetch joins
 * repeated headers (e.g. two X-Robots-Tag lines) into one value, losing what each one scoped.
 */
export function sendRequest(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<RawResponse> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const request = send(
      url,
      { method: "GET", headers: { ...headers, "accept-encoding": ACCEPT_ENCODING }, signal },
      (message) => {
        const response = toResponse(message);
        // An abort after the headers must also end the body read.
        const stop = () => response.body.destroy(signal.reason);
        signal.addEventListener("abort", stop, { once: true });
        response.body.once("close", () => signal.removeEventListener("abort", stop));
        resolve(response);
      },
    );
    request.on("error", reject);
    request.end();
  });
}
