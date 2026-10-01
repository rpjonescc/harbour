import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate, createInflateRaw } from "node:zlib";
import { FetchError } from "./fetch-error";

/** One HTTP response before its body is read. */
export type RawResponse = {
  status: number;
  /** Every header line as received, names lowercased, repeats kept apart. */
  headerLines: [string, string][];
  /**
   * Each header's values joined with ", " (as fetch's Headers would), names lowercased. No
   * prototype, so a header named `__proto__` or `constructor` is just a header.
   */
  headers: Record<string, string>;
  /** The decoded body. */
  body: Readable;
};

const ACCEPT_ENCODING = "gzip, deflate, br";

type Encoding = "gzip" | "deflate" | "br" | null;

/** The one encoding we decode, null for none; throws for stacked or unknown encodings. */
function encodingOf(url: URL, header: string | undefined): Encoding {
  const codings = (header ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter((c) => c !== "" && c !== "identity");
  const [coding] = codings;
  if (coding === undefined) return null;
  if (codings.length === 1 && coding === "x-gzip") return "gzip";
  if (codings.length === 1 && (coding === "gzip" || coding === "deflate" || coding === "br")) {
    return coding;
  }
  throw new FetchError("network", `${url} uses unsupported encoding "${header}"`);
}

/** Resolves with the stream's first chunk (null at a clean end), leaving it unread. */
function peek(stream: Readable): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const done = () => {
      stream.off("readable", onReadable);
      stream.off("error", reject);
      stream.off("close", onClose);
    };
    const onReadable = () => {
      done();
      const chunk: Buffer | null = stream.read();
      if (chunk) stream.unshift(chunk);
      resolve(chunk);
    };
    const onClose = () => {
      done();
      reject(stream.errored ?? new Error("closed before the body"));
    };
    stream.on("readable", onReadable);
    stream.once("error", reject);
    stream.once("close", onClose);
  });
}

/** "deflate" should be zlib-wrapped, but some servers send raw deflate: tell by the header. */
async function deflateDecoder(message: IncomingMessage) {
  const first = await peek(message);
  const [cmf = 0, flg = 0] = first ?? [];
  const zlibWrapped = (cmf & 0x0f) === 8 && ((cmf << 8) | flg) % 31 === 0;
  return zlibWrapped ? createInflate() : createInflateRaw();
}

async function decodedBody(message: IncomingMessage, encoding: Encoding): Promise<Readable> {
  if (encoding === null) return message;
  const decoder =
    encoding === "gzip"
      ? createGunzip()
      : encoding === "br"
        ? createBrotliDecompress()
        : await deflateDecoder(message);
  // pipeline destroys both streams on an error, so a bad encoding surfaces while reading.
  return pipeline(message, decoder, () => {});
}

async function toResponse(url: URL, message: IncomingMessage): Promise<RawResponse> {
  const headerLines: [string, string][] = [];
  const headers: Record<string, string> = Object.create(null);
  for (let i = 0; i + 1 < message.rawHeaders.length; i += 2) {
    const name = (message.rawHeaders[i] ?? "").toLowerCase();
    const value = message.rawHeaders[i + 1] ?? "";
    headerLines.push([name, value]);
    const previous = headers[name];
    headers[name] = previous === undefined ? value : `${previous}, ${value}`;
  }
  const encoding = encodingOf(url, headers["content-encoding"]);
  const body = await decodedBody(message, encoding);
  return { status: message.statusCode ?? 0, headerLines, headers, body };
}

/**
 * One GET (or a POST of `body`) without following redirects. We use node:http rather than fetch because fetch joins
 * repeated headers (e.g. two X-Robots-Tag lines) into one value, losing what each one scoped.
 * `lookup` decides which addresses the socket may connect to.
 */
export function sendRequest(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
  lookup: LookupFunction,
  body?: string,
): Promise<RawResponse> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const length = body === undefined ? {} : { "content-length": String(Buffer.byteLength(body)) };
  return new Promise((resolve, reject) => {
    const options = {
      method: body === undefined ? "GET" : "POST",
      headers: { ...headers, ...length, "accept-encoding": ACCEPT_ENCODING },
      signal,
      lookup,
    };
    const request = send(url, options, (message) => {
      // An abort after the headers must also end the body read; pipeline passes it on.
      const stop = () => message.destroy(signal.reason);
      signal.addEventListener("abort", stop, { once: true });
      message.once("close", () => signal.removeEventListener("abort", stop));
      toResponse(url, message).then(resolve, (error: unknown) => {
        message.destroy();
        reject(error);
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}
