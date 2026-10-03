# Indexing coverage and the outside view — design

Status: approved by the owner in conversation, 3 October 2026 (decisions in section 7).
Amends: `2026-10-01-harbour-design.md` §5 (collectors, scoring, rules) and §12 (costs).
Builds on what a first manual check of a real directory-style site taught us: only 3 of 53 sitemap pages were indexed, "Discovered, currently
not indexed" for 40, and the owner could not tell from Harbour. Two features, built in this order.

## 1. Intent

Harbour should answer two questions on its own, in plain words:

1. **Is Google actually indexing my pages?** (free, daily)
2. **How does the rest of the web see me?** Who links to me, where I rank for the searches I care about, and
   whether AI assistants name or cite me. (paid, weekly, tiny cost, hard-capped)

Success: after a scan, the owner can open a product and say "Google has 3 of my 53 pages, ChatGPT named me in
1 of 5 answers, 4 sites link to me", and Harbour has raised an action only when something is worth doing.

Non-goals: no change to the score formula in this version (both features add information and actions, not
points); no automatic fixing; no posting; no scraping of anything beyond the Google and Treg APIs.

## 2. Feature 1: Indexing coverage (free)

### 2.1 Collector `indexing`
- Free, `cadence: "daily"`, `dependsOn: ["crawler", "search-console"]`. It runs after the Search Console
  collector and reuses its credentials (`HARBOUR_GSC_CREDENTIALS`, the product's `searchConsoleProperty`) and
  access token. The scope Harbour already uses (`webmasters.readonly`) covers URL Inspection.
- **Which URLs:** the sitemap URLs the crawler recorded (`site.sitemapPages`, capped at the crawl limit).
- **How many per run:** at most **100 URLs per product per run**, oldest-checked first (never-checked first),
  one request at a time, paced under one per second. The API allows about 2,000 a day and 600 a minute per
  property, so this stays far inside it. A site with 53 URLs is fully checked in one run; one with 500 takes
  five days, and the summary says how far it has got.
- **Endpoint:** `POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect`
  (`searchconsole.googleapis.com` is already an allowed host). Same transport rules as the Search Console
  collector: bearer token, no robots check for Google APIs, 30 s timeout, 1 MiB body cap, errors reduced to
  fixed sentences with no `cause`.
- **Failures:** 401/403 → the existing "give Harbour access" message; 429 or quota → "wait for tomorrow's
  check" and a partial result is kept; any other failure on one URL records that URL as `unknown` and
  continues. Missing data is a gap, never a zero.

### 2.2 Observations
- `index_status` (one per inspected URL; subject = URL): `{ verdict, coverageState, lastCrawlTime|null,
  googleCanonical|null, robotsTxtState, pageFetchState, checkedAt }`. Strings are length-capped and stored as
  given by Google; Harbour maps them to a small fixed set of states for its own logic (`indexed`,
  `discovered_not_indexed`, `crawled_not_indexed`, `unknown_to_google`, `blocked`, `other`).
- `index_summary` (one per run; subject = property): `{ inspected, total, byState, checkedThrough }`.
- Because a run may cover only part of a large site, readers use the **latest known status per URL** across
  recent scans (the carry-over pattern PageSpeed already uses), never only the latest scan.

### 2.3 Rule `pages-not-indexed` (action only)
- Raised when, among URLs with a known status, at least **3** are `discovered_not_indexed`,
  `crawled_not_indexed` or `unknown_to_google` **and** they are at least **20%** of the URLs checked.
  The sitemap must be at least 14 days old in Harbour's records before it fires (new pages need time).
- Area SEO, impact high, effort medium. Evidence: up to 20 example URLs and the counts.
- Plain wording (`lib/explain`, no jargon): *"Google hasn't added N of your M pages to its search results."*
  Why: pages Google does not index cannot be found. Fix: make each page clearly different and useful on its
  own, put the real content in the page itself (not loaded afterwards), link to the page from other pages,
  and earn links from other sites. Check: the count falls at the next checks. Docs: a short brain note.
- Gap behaviour: not connected or access refused → the rule is `unknown` (it never opens or resolves an
  action). Resolves when the share falls under the threshold.

### 2.4 Display
- Product page: its own **"Pages in Google"** panel beside "Found on Google" (the score card stays
  unscored by this): one line, **"In Google: 3 of 53 pages"**, with the one-sentence explainer and the
  breakdown inside Technical details. Absent data says why ("Search Console isn't connected", "the
  property doesn't cover this site's address", "Google's daily limit was reached; the check continues
  tomorrow") or how far a large site has got ("Checking, 20 of 53 so far"), never "0". Pages Google
  couldn't answer for are shown beside the count and count as asked about, so the panel finishes.
- Scope and queue: only sitemap pages the property covers are checked and counted (a domain property
  covers the host and its subdomains; a URL-prefix property its origin and path); none in scope means
  "not connected" with a fixed sentence. A page that failed is retried first, once a day at most; after
  two failures in a row it goes behind the others.
- Settings → Sources: the Search Console row gains "also checks which pages Google has indexed".
- No change to scoring (`FORMULA_VERSION` stays `v2`).

## 3. Feature 2: The outside view (paid, weekly, capped)

### 3.1 Service and key
- Treg (`https://treg.to`) is a pay-per-call catalogue of data APIs. Harbour calls it with `X-Treg-Token`.
- New secret `HARBOUR_TREG_API_KEY` (worker only; Settings shows "Connected / Not connected yet", never the
  value). The base URL is a code constant (`https://treg.to`), https only, **no redirects**, host added to
  the outbound allow-list for this collector only.
- Spending uses the existing ledger and budget. The ledger is in **micro-AUD**; Treg charges in USD and
  returns the charge in the `X-Treg-Cost-Micro` header. New setting `HARBOUR_USD_TO_AUD` (default `1.55`,
  range 1 to 3) converts both the reservation and the recorded charge; the conversion is shown in the cost
  detail. `HARBOUR_MONTHLY_BUDGET_AUD` already defaults to 0, which skips paid collectors: the owner sets it
  (suggested A$10).

### 3.2 Collector `treg`
- Paid, `cadence: "weekly"`, `collector` timeout 10 minutes (AI answers take about 30 s each).
- Requires **plain-text lists the owner chooses** per product in `harbour.config.json`:
  `tracking.products.<id> = { queries: [≤ 10], questions: [≤ 5], location: "Queensland,Australia" (optional) }`.
  No list → the collector reports "No searches chosen yet" (not configured, not zero). Reading approved
  keyword and question proposals from the database is a later option (not in this version).
- Three checks per product, each independent (one failing never hides the others):
  1. **Backlinks** — `serpstat.web.backlinks.summary` for the product's registrable domain
     (about US$0.0025). Observation `backlinks`: `{ referringDomains, backlinks, dofollow, rank, provider }`.
  2. **Search position** — `dataforseo.google.serp.organic`, `depth 30`, for each query
     (about US$0.006 each). Observation `serp_rank`: `{ query, position | null, url | null, topDomains[≤ 5],
     checkedAt }`. `null` means *not found in the top 30*, said that way; it is never turned into 31 or 0.
  3. **AI assistant check** — `cloro.ai-search.chatgpt.scrape` (country AU) for each question
     (about US$0.0036 each). Observation `ai_answer`: `{ question, named: boolean, cited: boolean,
     citedDomains[≤ 8], businessesNamed: number }`. Only these derived fields are stored: the answer text is
     not kept (size, copyright, and it is untrusted).
- **Price control:** every call carries `X-Treg-Route-Max-Cost` (a hard cap per call, from a per-endpoint
  constant with headroom), is preceded by `budget.allow(estimate)` and followed by `cost.record(actual)` from
  the response header. A call refused by the budget ends the run with a recorded partial result. Expected
  spend: about US$0.04 per product per week (≈ A$1 a month for three products).
- Provider ids are pinned in one table with the price headroom and a fixed-sentence failure for an unknown id
  or a retired endpoint; the weekly run logs the endpoint list it used.
- All response text is untrusted data: validated with zod, strings capped, never rendered as markup.

### 3.2a "Check now"
- Besides the weekly run, the product page has a **Check now** button (owner only, same-origin POST, both
  locks, audited) that enqueues an `outside-check` job for that product. The worker runs only the `treg`
  collector for it, through the same budget guard, and stores the results as usual.
- Limits: one check per product per 6 hours (a second click while one is queued returns the existing job),
  and at most 3 manual checks per product per day. A refused or partial run says why in plain words.
- The first run after the feature ships is a manual baseline, so the owner sees real numbers immediately.

### 3.3 History
- Observations are pruned with the scan (about 30 scans). Weekly checks would keep only 4 or 5 data points, so
  a compact **`external_checks`** table (one migration) stores `{ productId, kind, subject, checkedAt, value }`
  for backlinks, ranks and AI answers, written by the worker after the collector, pruned after 400 days.
  Backup first, as always.

### 3.4 Rules (actions only)
- `few-referring-sites`: fewer than **5** referring domains → area GEO ("Other sites rarely mention you"),
  fix points to listing on local and industry sites and asking partners to link; resolves at 5 or more.
- `not-named-by-ai`: at least 5 AI questions checked in total over two consecutive weeks and **none** name or
  cite the site → area GEO ("AI assistants don't mention you yet"); resolves when any does.
- Both are `unknown` while the data is missing or the budget skipped the run. Wording follows the plain-language
  rules; codes only in Technical details.

### 3.5 Display
- Product page, new section **"How the web sees you"** (plain, one sentence visible, detail on request):
  sites linking to you, your position for each chosen search with the change since last week, and the
  AI check ("ChatGPT named you in 1 of 5 answers; sites it cited: …"). Unmeasured → says so.
- Settings → Sources: a Treg row (what it gives Harbour, how to connect, status) and the spend meter as today.
- Scoring unchanged in this version. The GEO and AEO "not connected" placeholders from the original design
  stay at weight 0; a formula `v3` that weights these is a separate, later decision.

### 3.6 Verified Treg HTTP details (checked against the live service on 3 October 2026)
- **Call:** `POST https://treg.to/call/<endpoint-id>` with `X-Treg-Token: <key>`, `Content-Type: application/json`
  and an optional `X-Treg-Route-Max-Cost: <usd decimal>` (hard per-call ceiling).
- **Success:** HTTP 200; the body is the provider's body unchanged; `x-treg-cost-micro` is the charge in
  micro-USD (for example `2500` is US$0.0025) and `x-treg-call-id` identifies the call.
- **Ceiling refusal:** HTTP 402 with `{"detail":{"error":"route_max_cost","endpoint_id","provider",
  "max_cost_micro","estimated_cost_micro","message"}}`, header `x-treg-error: 1`, and nothing is charged. Any
  other 402 (for example an empty balance), 401/403 (key), 429 and 5xx are recorded as fixed-sentence
  failures; a 402 or 401/403 ends the run for all products, because it will repeat.
- **Endpoint bodies** (the three used here; synthetic fixtures only in tests):
  - `serpstat.web.backlinks.summary`: `{"method":"SerpstatBacklinksProcedure.getSummaryV2","id":"1","params":{"query":"<domain>"}}`
    answers `result.data` with `referring_domains`, `backlinks`, `dofollow_backlinks`, `nofollow_backlinks`,
    `sersptat_domain_rank` (sic). About US$0.0025.
  - `dataforseo.google.serp.organic`: body is an array of one task `[{"keyword","location_name","language_code":"en","depth":30}]`;
    answers `tasks[0].result[0].items[]` with `type`, `rank_group`, `domain`, `url`, `title` (only items whose
    `type` is `organic` count for a position). About US$0.002 per 10 results of depth.
  - `cloro.ai-search.chatgpt.scrape`: `{"country":"AU","prompt":"<question>"}` answers `result.text`,
    `result.sources[]` (objects with a `url`), `result.entities[]`, `result.citationPills`. About US$0.003 and
    around 30 seconds per call.
- Prices are quoted per call by `treg catalog get <id>`; the table of endpoints and price ceilings lives in one
  code file and changes only with a code change.

## 4. Architecture notes

- Feature 1 touches: `lib/scan/collectors/indexing.ts`, `registry.ts` and `labels.ts` (+ their tests),
  `rule-def.ts` (`Facts.coverage`, `Need`), `issue-rules*.ts`, `lib/explain` (rule text, sources), product page
  view. Feature 2 adds: `collectors/treg.ts` (+ a small `treg-client.ts`), `lib/costs/paid-sources.ts`
  entry, `lib/config.ts` + `.env.example` + README + `config-docs` test, `fetch` custom-header option and
  host allow-list, the `tracking` block in `lib/products/config.ts`, the `external_checks` table, rules,
  product page section, settings rows.
- Safe-fetch extension: `X-Treg-Token` needs a **custom request header** option, allowed only for the Treg
  host over https with redirects refused; the existing Bearer path and robots handling are unchanged.
- The web process never runs collectors; the key is read only in the worker; every error path strips `cause`
  and never contains the key (tested with sentinel values).
- Files stay inside the size limits (the Search Console collector is near its split point; new code goes in
  new files). README, `.env.example` and the settings docs are updated with each setting.

## 5. Testing

- **Indexing:** recorded fake Google responses (indexed, three "not indexed" states, 403, 429, malformed,
  huge body), rotation over 250 URLs across several runs, carry-over across scans, the rule's thresholds and
  the 14-day gate, missing data is `unknown`, partial runs keep what they have.
- **Treg:** a local fake Treg server (all three checks, a price over the cap, unknown endpoint, 402 balance
  empty, 429, hung, huge body, malformed, header-injection attempts in query text), cost conversion and
  reservation/settlement, budget skip, `null` rank stays `null`, the AI check never stores answer text,
  secrets never appear in errors, events, logs or observations.
- Both: product page and Settings render in light and dark with every state on `/design`; plain-language
  vocabulary test; whole-suite e2e on system Chrome once.

## 6. Order of work

1. Feature 1 (indexing coverage), reviewed and deployed on its own.
2. Feature 2 (outside view): collector and cost wiring, then history table, rules, then display.

## 7. Decisions (owner, 3 October 2026)

1. **Budget:** `HARBOUR_MONTHLY_BUDGET_AUD=10` is set. Expected use is about A$1 to A$2 a month.
2. **Tracked searches and AI questions:** the starting lists proposed in conversation (up to 8 searches and
   5 AI questions per product, drawn from the discovery agent's proposals) are accepted as a start, held in
   the owner's private `harbour.config.json` (never in the repository) and editable at any time.
3. **Cadence:** weekly, plus the **Check now** button (3.2a). No score change in this version.
