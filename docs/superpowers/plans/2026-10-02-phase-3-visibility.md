# Harbour Phase 3 (Daily Visibility Scan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every day Harbour scans each configured product's site, stores raw observations, computes explainable SEO/GEO/AEO scores, and shows real data on Today and on per-product pages — with collectors that need credentials (Search Console) or paid keys (AI engines, rankings) shown as "not connected" until configured.

**Architecture:** A `scan` job kind runs in the existing worker (one job per product per day, plus "Scan now"). It calls registered collectors through one `Collector` contract; each collector writes `observations` and reports its own status (`ok | failed | not_configured | skipped`) so one failing source never blocks the others. Pure, versioned scoring turns a scan's observations into sub-scores and SEO/GEO/AEO totals stored per scan. The web app only reads results and enqueues scans.

**Tech Stack:** existing stack (Next.js 16, Drizzle/SQLite, worker, zod 4, Vitest, Playwright). New: `undici`-free native `fetch` with AbortController; `google-auth-library` for Search Console (service account or OAuth refresh token); a tiny HTML parser (`node-html-parser`).

**Spec:** `docs/superpowers/specs/2026-10-01-harbour-design.md` §5 (Visibility), §9 (UI), §11 (reliability), §12 (cost — no paid collectors in this phase). **Rules:** `AGENTS.md`.

## Global Constraints

- Public repo: fictional data only in code/tests/docs (`example.com`, "Acme Docs"). Real properties live only in the gitignored `harbour.config.json`.
- Web never runs collectors; it enqueues `scan` jobs. Worker code must not import `server-only` modules.
- Outbound HTTP: only to configured product origins (and, for PageSpeed/Search Console, Google's API hosts). Per request: 15 s timeout (deliberate exception: PageSpeed Insights calls use a 90 s per-call `timeoutMs`, because the API runs Lighthouse for 15–40 s before answering; only Google API calls may override it), max 3 redirects (same registrable domain only for crawling), response body cap 2 MiB (HTML) / 512 KiB (robots, llms.txt, sitemaps up to 5 MiB), identify as `HarbourBot/0.1 (+https://github.com/rpjonescc/harbour)`, honour robots.txt `Disallow` for `HarbourBot` and `*`, concurrency 2 per site, ≥ 500 ms between requests to the same host.
- Crawl cap 200 pages per product per scan (configurable `HARBOUR_CRAWL_MAX_PAGES`, 1–500).
- Missing data is a gap, never a zero: a collector that fails or isn't configured produces no score input, and the affected score is marked `incomplete` with the reason.
- Scoring is pure and versioned (`formulaVersion: "v1"`); stored score rows never change after insert.
- Secrets (Search Console credentials) live in files referenced from `.env`, mode 600, read by the worker only; the UI shows only "connected / not connected".
- Daily scan at 06:00 in `HARBOUR_TIMEZONE`; catch-up on worker start if the last successful scan for a product is > 24 h old; never more than one scan job per product queued/running (enqueue dedupe already exists).
- Semantic tokens; rem text; file-size limits; README updated with each new setting/feature. Commit trailer per environment; never `--no-verify`; never `pkill`.

---

### Task 1: Scan data model and collector framework

**Files:** `lib/db/schema.ts` (+ generated migration), `lib/scan/types.ts`, `lib/scan/registry.ts`, `lib/scan/run-scan.ts` (+ test), `lib/jobs/queue.ts` (kind `scan`), `worker/index.ts` (dispatch), `lib/products/config.ts` (optional `searchConsoleProperty`).

**Schema:**
- `scan_runs(id, product_id, job_id → jobs, started_at, finished_at, status: running|ok|partial|failed)`
- `collector_runs(id, scan_id → scan_runs, collector, status: ok|failed|not_configured|skipped, error, started_at, finished_at, items)`
- `observations(id, scan_id, collector, kind, subject, value json)` — `kind` e.g. `page`, `site`, `robots`, `cwv`, `gsc_daily`, `gsc_query`; `subject` a URL/query/date; index `(scan_id, collector, kind)`.
- `scores(id, scan_id unique, product_id, computed_at, formula_version, seo, geo, aeo (nullable ints 0–100), complete json {seo,geo,aeo: boolean}, breakdown json)`
- jobs `kind` enum gains `"scan"` (params `{ productId }`).

**Types (`lib/scan/types.ts`):**
```ts
export type Observation = { kind: string; subject: string; value: Record<string, unknown> };
export type CollectorResult =
  | { status: "ok"; observations: Observation[] }
  | { status: "not_configured"; reason: string }
  | { status: "skipped"; reason: string };
export type CollectContext = {
  product: Product;               // from harbour.config.json
  config: Config;
  now: Date;
  fetch: SafeFetch;               // Task 2
  log: (message: string) => void; // becomes a job event
  signal: AbortSignal;
};
export type Collector = {
  id: string;                     // "crawler" | "readiness" | "pagespeed" | "search-console"
  cadence: "daily" | "weekly";
  collect(ctx: CollectContext): Promise<CollectorResult>; // throw = failed
};
```

**`runScan(deps, job)`**: create `scan_runs`; for each registered collector (skip weekly ones whose last ok run is < 7 days old → `skipped`), run with a per-collector timeout (crawler 10 min, others 2 min), insert observations in one transaction per collector, record `collector_runs`; scan status `ok` if all ok/not_configured/skipped, `partial` if some failed, `failed` if all failed; then compute and store scores (Task 6 hook; until then a no-op function injected); add job events per collector ("Crawler: 143 pages", "Search Console: not connected — add credentials"). Respect worker stopping/cancel via `signal`.

Tests: fake collectors (ok / throws / not_configured / slow beyond timeout) → statuses, observations persisted only for ok, scan status rules, weekly skip, cancel aborts remaining collectors.

### Task 2: Safe fetch and robots

**Files:** `lib/scan/fetch.ts` (+ test with a local `http.createServer`), `lib/scan/robots.ts` (+ test).

`safeFetch(url, { maxBytes, accept })` implements the HTTP constraints above (timeout, redirect limit and host check, byte cap with streaming abort, user agent, per-host spacing and concurrency via a small in-memory limiter keyed by host). Returns `{ url, finalUrl, status, headers, body: string, truncated, ms }` or throws a typed `FetchError(kind: "timeout" | "too_large" | "redirect" | "network" | "blocked_by_robots")`.

`parseRobots(text)` → groups per user-agent with allow/disallow rules and sitemaps; `isAllowed(robots, agent, path)` using longest-match precedence (Google semantics); `aiCrawlerAccess(robots)` → `{ GPTBot, "OAI-SearchBot", "ChatGPT-User", PerplexityBot, ClaudeBot, "Claude-SearchBot", "Google-Extended", CCBot, Bytespider }` each `allowed | blocked | partial` for `/`.

Tests: local server for timeout, redirect chains (incl. off-domain refusal), byte cap, spacing; robots fixtures (wildcards, `$`, empty disallow, multiple groups, case-insensitive agents).

### Task 3: Crawler collector

**Files:** `lib/scan/collectors/crawler.ts` (+ test), `lib/scan/html.ts` (+ test).

Seeds: product `url`, then sitemap URLs from robots.txt and `/sitemap.xml` (sitemap index supported, max 5 sitemaps, max 5,000 URLs read). Same-origin only. BFS over internal links until the page cap. Respect robots. Per page observation `page`: `{ status, finalUrl, title, titleLength, metaDescription, descriptionLength, h1Count, canonical, robotsMeta, noindex, lang, jsonLdTypes: string[], wordCount, internalLinks, externalLinks, images, imagesMissingAlt, hasFaqMarkup, ms }`. Site observation `site`: `{ pagesCrawled, pagesInSitemap, brokenInternalLinks: [{from,to,status}] (cap 100), duplicateTitles (cap 50), avgMs }`.

`lib/scan/html.ts` extracts the above from HTML with `node-html-parser`; JSON-LD parsed defensively (arrays, `@graph`, invalid JSON counted as `invalidJsonLd`).

Tests: fixture sites served by a local server (pages with missing titles, noindex, broken links, JSON-LD variants, sitemap index, robots disallow) → exact observations.

**As built** (types: `CrawledPage` in `lib/scan/collectors/crawl-page.ts`, `CrawlSite` in `lib/scan/collectors/crawl-site.ts`; setting `HARBOUR_CRAWL_MAX_PAGES`):
- `page` (subject: requested URL, the product URL normalised): the fields above plus `truncated` (body over the 2 MiB cap) and `invalidJsonLd` (JSON-LD blocks that aren't valid JSON). Missing title/description → `null` with length `0`. Non-2xx or non-HTML responses → every HTML field `null` (a gap, not a zero). `noindex` combines the robots meta tag and `X-Robots-Tag`, counting only unscoped directives and those for HarbourBot/Googlebot. URLs blocked by robots or failing to fetch produce no `page`. Also `articleDatePublished` (newest `datePublished` of an Article-type JSON-LD node, ISO, or `null`) and `preferredSourcesLink` (an `<a>` to `google.com/preferences/source`). Added for scoring (Task 6): `questionHeadings` (visible h1–h6 ending in "?" or opening with a question word) and `conciseAnswers` (those whose next element is a `<p>` of 1–60 words).
- `site` (subject: normalised product URL): `pagesCrawled`, `pagesInSitemap` (`null` when sitemaps exist but none could be read; partial when `sitemapErrors` is non-empty), `sitemapLastmods: {dated, newest: [{url, lastmod}]}` (URLs with a valid `<lastmod>`, the newest 50; `null` with `pagesInSitemap`), `brokenInternalLinks: [{from,to,status}]` (4xx/5xx targets, sorted, cap 100), `duplicateTitles: [{title, urls}]` (distinct final URLs, sorted, cap 50, 10 URLs each), `avgMs` (`null` without pages), `robotsTxt: "ok"|"missing"|"unavailable"|"unfollowable_redirect"`, `sitemapsRead`, `sitemapErrors: [{url, status} | {url, kind}]` (kind: a fetch error kind, `invalid` or `off_origin`; cap 5; a 4xx on the default `/sitemap.xml` is absence, not an error), `sitemapPages: {crawled, ok}` (sitemap page URLs this crawl visited and how many answered 2xx; `null` without sitemap URLs; added for scoring in Task 6), `blockedByRobots`, `fetchErrors: [{url, kind}]` (cap 50), `limitReached: "pages"|"bytes"|null`.
- Bounds: page cap (robots-blocked URLs don't count), 64 MiB total HTML, 10,000 known URLs, 2 pages in flight (the shared limiter's 2 per site). A redirect's final URL counts as visited. A robots.txt redirect that can't be followed means no rules (allow all) and is reported as `unfollowable_redirect`.

### Task 4: Readiness and PageSpeed collectors

**Files:** `lib/scan/collectors/readiness.ts` (+ test), `lib/scan/collectors/pagespeed.ts` (+ test).

Readiness (`site`-level observations, kind `readiness`): robots.txt present/valid + `aiCrawlerAccess`; sitemap reachable/valid/URL count/lastmod freshness; `llms.txt` present (and `llms-full.txt`) with size; Organization / WebSite / LocalBusiness / FAQPage / HowTo / Article schema presence across crawled pages (reads crawler observations from the same scan — run order: crawler first); Google Preferred Sources: button/deeplink present on any crawled page (links or `<a>` to `https://www.google.com/preferences/source?q=` or `google.com/preferences/source`), and "fresh content section" heuristic (≥ 3 URLs with sitemap `lastmod` or Article `datePublished` in the last 30 days); HTTPS and `www`/apex redirect consistency.

**As built — readiness** (type `Readiness` in `lib/scan/collectors/readiness.ts`; `dependsOn: ["crawler"]`, and collectors read earlier results of the same scan through `ctx.earlier`): one `readiness` observation per scan (subject: normalised product URL) with
- `robotsTxt: {state, valid, aiCrawlerAccess}` — `state` as the crawler reports it; `valid` (plain text with a group or sitemap line) is `null` unless `ok`; a missing file means every AI crawler `allowed`; unreadable (429/5xx/no response/unfollowable redirect) means `aiCrawlerAccess: null`.
- `llmsTxt`, `llmsFullTxt: {present, status, bytes, truncated, error}` — an HTML page answering 200 is not the file; `present: null` when unknown (no response, 429, 5xx).
- `sitemap: {reachable, valid, sitemapsRead, urlCount, partial, errors, offOrigin, datedUrls, newestLastmod, modifiedLast30Days}` from the crawler's `site` observation; `partial` whenever `sitemapErrors` is non-empty; `offOrigin` lists sitemaps on another origin (e.g. a www site listing the apex's).
- `schema: {pagesChecked, pagesWith: {Organization, WebSite, LocalBusiness, FAQPage, HowTo, Article}}` — distinct HTML pages by final URL; common subtypes count (`lib/scan/schema-types.ts`).
- `preferredSources: {button, buttonPages, freshUrls, freshContent}` — fresh = sitemap `lastmod` or Article `datePublished` within 30 days (up to a day ahead allowed); `freshContent` at ≥ 3 URLs.
- `https: {productUrlHttps, httpUpgradesToHttps, downgrades: [{from,to}], hosts: [{url, finalUrl, error}], hostsConsistent, siteOrigin}` — home page plus https apex and www variants (just the home page for an IP host); `hostsConsistent` is `null` when fewer than two variants answered (e.g. a subdomain without www); any https→http redirect hop is a downgrade.
- `sitemap`, `schema` and `preferredSources` are `null` when the crawler did not end ok in this scan, or when its observations don't have the expected shape (validated with zod; a job event says why) — a gap, not a zero.

PageSpeed (weekly): PSI API v5 `runPagespeed?url=<product url>&strategy=mobile&category=performance` (optional `HARBOUR_PAGESPEED_API_KEY`), observation `cwv`: `{ performanceScore, lcpMs, inpMs (field) | null, cls, fcpMs, tbtMs, fieldDataAvailable }`. Quota/429 → failed with readable error.

Tests: fixture site + recorded PSI JSON fixture (no live calls).

**As built — PageSpeed** (`lib/scan/collectors/pagespeed.ts`, cadence `weekly`; runScan skips it while its last ok run is under 7 days old, less 12 h of slack): `GET https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=<product url>&strategy=mobile&category=performance&key=…` plus a `fields` partial-response mask (`PSI_FIELDS`: only the values the parser reads; a test applies the mask to the recorded response and gets the same result), with `ignoreRobots`, a 90 s `timeoutMs` (honoured only for Google API hosts) and a 1 MiB cap; the response is validated with zod (`pagespeed-response.ts`). One `cwv` observation (subject: normalised product URL): `performanceScore` (Lighthouse 0–100, `null` if none), lab `lcpMs`, `cls`, `fcpMs`, `tbtMs` (`null` when an audit is missing), field `inpMs` (CrUX p75 for the URL or its origin, `null` without field data) and `fieldDataAvailable`. Without `HARBOUR_PAGESPEED_API_KEY` → `not_configured` with the setup steps (a live check found keyless requests get a quota of 0, so the key is required, not optional). HTTP 429 or a Google quota reason → failed with "PageSpeed Insights quota exceeded …", advising to raise the key's quota; other non-2xx → failed with Google's message; a Lighthouse `runtimeError` → failed. The request URL (with the key) never appears in observations or errors, and the key is redacted from Google's messages.

### Task 5: Search Console collector

**Files:** `lib/scan/collectors/search-console.ts` (+ test), `lib/config.ts` (`HARBOUR_GSC_CREDENTIALS` path, optional), `lib/products/config.ts` (`searchConsoleProperty` optional, `sc-domain:` or URL-prefix form).

Not configured (no credentials file, or product has no `searchConsoleProperty`) → `not_configured` with the exact setup step. Credentials file may be a **service account key** (`type: "service_account"`) or an **OAuth authorized-user** JSON (`type: "authorized_user"` with client_id, client_secret, refresh_token) — load with `google-auth-library` (`GoogleAuth({ keyFile, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] })` / `UserRefreshClient`). Query `searchanalytics.query` via REST (`https://www.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query`): last 28 days by `date` (kind `gsc_daily`: clicks, impressions, ctr, position per date), top 250 queries (kind `gsc_query`) and top 100 pages (kind `gsc_page`), data lagging ~2–3 days. 401/403 → failed with "check the property is shared with the credential's account". Credentials file must be mode 600 (warn otherwise); never log tokens.

Tests: mock HTTP (inject fetch) with recorded responses; not-configured paths; error mapping. README + deploy README: a step-by-step "Connect Search Console" guide (create OAuth desktop client or service account in Google Cloud, add the service account email as a restricted user on each property, put the JSON at `~/harbour-data/gsc.json` mode 600, set `HARBOUR_GSC_CREDENTIALS`), and how to add `searchConsoleProperty` to each product in `harbour.config.json`.

**As built — Search Console** (`lib/scan/collectors/search-console.ts`, cadence `daily`, runs after PageSpeed; setting `HARBOUR_GSC_CREDENTIALS`): `not_configured` (with the setup step) when `HARBOUR_GSC_CREDENTIALS` is unset, the product has no `searchConsoleProperty`, or the file does not exist. The file (`gsc-credentials.ts`) is validated with zod as `service_account` (client_email, private_key) or `authorized_user` (client_id, client_secret, refresh_token); errors name fields, never values; group/other permission bits → a warning (job event and the summary observation), the scan still runs. `gsc-token.ts` gets a read-only (`webmasters.readonly`) access token with google-auth-library (`JWT` / `UserRefreshClient` built from the validated fields; its own token request to oauth2.googleapis.com has a 30 s timeout; the library opts its token POSTs into gaxios retries (3 by default), capped at one retry with `retryConfig.retry: 1` (a test counts the requests); it is abandoned when the scan aborts); token errors are redacted. The credentials file must be a regular file of at most 64 KiB. Three `POST https://www.googleapis.com/webmasters/v3/sites/<encoded property>/searchAnalytics/query` through the safe fetch (new `post: {json, bearer}` option: Google API hosts over https only, redirects refused), `ignoreRobots`, 30 s, 1 MiB cap, `type: "web"`, window = the 28 days ending 3 days before the scan (UTC dates). Observations: `gsc_daily` (subject date), `gsc_query` (top 250 by clicks), `gsc_page` (top 100), each `{clicks, impressions, ctr, position}`; plus one `gsc_summary` (subject property): `{startDate, endDate, days, queries, pages, warning}`. No rows → an ok, empty report. 401/403 → failed with "check the property is shared with the credential's account (<service account email | the OAuth user>)", except reasons `accessNotConfigured`/`SERVICE_DISABLED` → "enable the Google Search Console API in the credential's Google Cloud project"; 429/quota → "quota exceeded"; other non-2xx → Google's message (cut to 300 characters, as for PageSpeed). Collector labels live in `lib/scan/labels.ts` (no collector imports) so the UI can use them without bundling google-auth-library.

### Task 6: Scoring v1

**Files:** `lib/scan/score.ts` (+ extensive tests), wire into `runScan`.

Pure `scoreScan(observations, collectorStatuses): { seo, geo, aeo, complete, breakdown }`, `formulaVersion = "v1"`. Each total is a weighted mean of available sub-scores (0–100, integers); a sub-score whose collector didn't run ok is excluded and `complete=false` with a reason in breakdown. Sub-scores:
- **SEO:** technical health (share of crawled pages with 2xx, title 10–60 chars, description 50–160, exactly one h1, no noindex on indexable pages, canonical present; minus broken links), indexability (sitemap valid, robots allows Googlebot, pages in sitemap reachable), Core Web Vitals (PSI performance score; field data preferred), Search Console visibility (impressions trend 28d vs prior when available).
- **GEO:** AI crawler access (share of AI bots allowed), llms.txt present, structured data for entities (Organization/LocalBusiness/WebSite), citation-ready content (pages with FAQ/HowTo/Article schema or question-style headings) — breakdown notes "AI engine mention checks not connected".
- **AEO:** FAQ/HowTo/Q&A coverage, concise answer blocks (paragraph ≤ 60 words directly under a question heading), Preferred Sources readiness (button/deeplink + fresh content), featured-snippet data not connected.
Breakdown entries `{ key, label, score, weight, evidence: string, status: "ok"|"missing" }` so the UI can explain every number. Tests: fixture observation sets → exact scores; incomplete paths; weights sum; idempotent.

### Task 7: Scheduling

**Files:** `lib/jobs/scheduler.ts` (+ tests), `worker/index.ts`, `scripts/scan-now.ts`.

Daily 06:00 local (`HARBOUR_TIMEZONE`): enqueue one `scan` job per configured product (dedupe). Catch-up on start: any product without an `ok|partial` scan in the last 24 h. Scans are ordinary jobs (one at a time with agents; agent jobs and scans interleave by queue order). Quiet-brain deferral does NOT apply to scans (they don't touch the brain). Tests with injected clock (DST-safe via Intl date parts). Script `pnpm scan:now [productId]` enqueues scans (used by the controller after deploy).

### Task 8: UI — Today, product pages, sources

**Files:** `lib/scan/views.ts` (queries: latest scores per product, 30-day series, deltas vs previous scan, top issues), `app/(app)/page.tsx` (Today on real data with the sample banner only when no scans exist), `app/(app)/products/[id]/page.tsx` (+ components under `components/products/`), `app/(app)/settings/sources/page.tsx`, `app/api/scans/route.ts` (POST scan now, guards as usual), sidebar product links → `/products/[id]` (the proposals page stays reachable from the product page).

Product page: header with scores + "Scan now"; tabs SEO / GEO / AEO each showing the breakdown (label, score bar, evidence, missing reasons); "Issues" list derived from observations (pages missing titles/descriptions, broken links, noindex, AI bots blocked, no llms.txt, no FAQ schema, no Preferred Sources button) each with a "Hand to Claude" copy button (prompt text: product, URL(s), problem, suggested fix, acceptance check); "Pages" table (top 50 crawled pages with status/title/issues); "Search Console" panel (clicks/impressions sparkline, top queries) or "Not connected — how to connect"; "AI engines" and "Rankings" panels "Not connected (needs API keys)" linking to docs. Sources page: each collector's last status per product, last run time, and connection state (no secrets). Accessible tabs (Radix-free: roving tabindex buttons with aria-selected / tabpanel), semantic tokens, rem.

Tests: views (fixture DB), Today rendering with/without scans, product page components, route auth. E2E (Task 9).

### Task 9: E2E, deploy, live scan

E2E: a fixture site served by a tiny static server (Playwright `webServer` entry, port 3402) configured as the demo product URL in E2E env; run "Scan now" → product page shows scores, issues, pages; Today shows real scores. Deploy (build, restart web+worker), run `pnpm scan:now` for all products, verify live: scan statuses ok/partial, scores present, Today and product pages render (verify via authenticated browser if available; otherwise via DB + server logs), Search Console "not connected" until credentials.

## Spec coverage

§5.1 config (products + approved proposals used later), §5.2 collectors crawler/pagespeed/readiness/search-console (rankings, aeo-serp, ai-engines deferred until keys: shown as not connected), §5.3 scoring (versioned, incomplete), §9 Today/Product/Sources, §11 job model/retries/catch-up/gaps, §12 no paid calls this phase. Phase 4 (actions board, weekly analyst) follows.
