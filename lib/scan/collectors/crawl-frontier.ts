/** Most URLs one crawl tracks (queued or visited): bounds memory on link-heavy sites. */
const MAX_KNOWN_URLS = 10_000;
/** Pages remembered as linking to each URL, for broken-link reports. */
const MAX_REFERRERS = 3;

/** `raw` resolved against `origin` when it is an http(s) URL on that origin, without fragment. */
export function sameOriginHref(raw: string, origin: string): string | null {
  if (!URL.canParse(raw, origin)) return null;
  const url = new URL(raw, origin);
  if (url.origin !== origin) return null;
  url.hash = "";
  return url.href;
}

/** The crawl's breadth-first queue of same-origin URLs, each queued at most once. */
export class Frontier {
  private readonly queue: string[] = [];
  private head = 0;
  private readonly known = new Set<string>();
  private readonly referrers = new Map<string, string[]>();

  constructor(
    readonly origin: string,
    private readonly maxKnown = MAX_KNOWN_URLS,
  ) {}

  /** Queues `raw` unless it is off-origin, already known or over the cap; notes who linked it. */
  add(raw: string, from?: string): void {
    const url = sameOriginHref(raw, this.origin);
    if (!url) return;
    if (!this.known.has(url)) {
      if (this.known.size >= this.maxKnown) return;
      this.known.add(url);
      this.queue.push(url);
    }
    if (from) this.addReferrer(url, from);
  }

  /** Records a URL as visited without queueing it (the product URL and its final URL). */
  markKnown(raw: string): void {
    const url = sameOriginHref(raw, this.origin);
    if (url) this.known.add(url);
  }

  /** The next URL to visit, or undefined when the queue is empty. */
  next(): string | undefined {
    if (this.head >= this.queue.length) return undefined;
    const url = this.queue[this.head];
    this.head++;
    return url;
  }

  hasPending(): boolean {
    return this.head < this.queue.length;
  }

  /** Pages seen linking to `url` (at most three). */
  referrersOf(url: string): readonly string[] {
    return this.referrers.get(url) ?? [];
  }

  private addReferrer(url: string, from: string): void {
    const list = this.referrers.get(url) ?? [];
    if (list.length >= MAX_REFERRERS || list.includes(from)) return;
    list.push(from);
    this.referrers.set(url, list);
  }
}
