# Plan: Send an approved piece to Postiz as a draft

Spec: `docs/superpowers/specs/2026-10-02-content-machine-design.md` §11 (stretch), §12.5, §13.
Branch `feat/content-postiz`. Off unless configured.

## API facts (checked 2026-10-04)

From docs.postiz.com (public-api: introduction, posts/create, integrations/list, providers) and the
source shipped in the installed image (`ghcr.io/gitroomhq/postiz-app`, `version.txt` v1.47.0), read
inside the container without calling the API:

- Self-hosted base: `<backend>/public/v1`; the backend is `<origin>/api` (this install's
  `NEXT_PUBLIC_BACKEND_URL` is `http://localhost:4007/api`). So `HARBOUR_POSTIZ_URL` is the backend
  URL and Harbour appends `/public/v1`.
- Auth: the raw key in `Authorization` (no `Bearer`). Missing or unknown key: 401.
- `GET /integrations` → `[{ id, name, identifier, picture, disabled, profile, customer? }]`.
- `POST /posts` body `{ type: "draft"|"schedule"|"now", date, shortLink, tags, posts: [{ integration:
  { id }, value: [{ content, image: [] }], settings: { __type, ... } }] }` → `[{ postId, integration }]`.
- For `type: "draft"` Postiz skips settings validation (only "at least one character or image" is
  checked), overwrites `settings.__type` from the channel, and starts no publishing workflow
  (`startWorkflow` returns early for state `DRAFT`).
- Rate limit: only `POST /public/v1/posts` is throttled, per organisation, `API_LIMIT` per hour
  (default 30 in this install; the docs now say 90). Harbour caps itself lower.
- Settings per channel identifier: `linkedin` / `linkedin-page` need only `__type`; `facebook` only
  `__type`; `instagram` / `instagram-standalone` need `post_type` (`post`). YouTube needs `title` and
  `type`, but Harbour has no YouTube platform, so it is not built. X is not used.

## Decisions

1. Platforms sent: LinkedIn, Facebook, Instagram. X, blog and website are never offered.
2. Text sent: LinkedIn and Facebook the whole piece (text, blank line, hashtags); Instagram the
   caption and hashtags. Never the visual brief, never images (said on the button's line).
3. `HARBOUR_POSTIZ_URL` + `HARBOUR_POSTIZ_API_KEY`: both or neither (config error otherwise). URL:
   `http:` or `https:`, no user, query or fragment, host on loopback (`127.0.0.1`, `[::1]`,
   `localhost`), a Tailscale name (`*.ts.net`) or a Tailscale address (`100.64.0.0/10`). Redirects
   are never followed.
4. `harbour.config.json` `content.postiz.channels: { linkedin?, facebook?, instagram? }` (channel
   ids). Strict: another key is an error.
5. Rate: 10 requests an hour, 2 per send (channel list + create) = 5 sends in any rolling hour,
   counted from the jobs table; checked when asking and again by the worker. One send waiting at a
   time.
6. The worker checks the channel is in Postiz, not disabled, and of the right kind for the
   platform before creating the draft.
7. Frontmatter `postiz: { sentAt, postId }` (null default), written by the worker with the usual
   revision bump and commit. Sending again needs a confirmation ("Send again").
8. Failures: the job fails with one plain sentence; the piece stays approved. The key is never in
   an error, event, log or the page (sentinel tests).

## Steps (each TDD, own commit)

1. refactor: share the decision job's commit-and-push as `commitChange` for a second worker job.
2. feat: config: `HARBOUR_POSTIZ_URL`, `HARBOUR_POSTIZ_API_KEY`, `content.postiz.channels`.
3. feat: Postiz client (worker only): `listChannels`, `createDraft`, `buildDraftRequest` with the
   literal `"draft"`; fake Postiz server and recorded fixtures by hand from the docs.
4. feat: `content-postiz` job (worker) and frontmatter field.
5. feat: request (`send-to-postiz`), rate cap, audit; Content page button, confirm, status line;
   Settings row; /design example.
6. docs: README, `.env.example`, `harbour.config.example.json`, spec §11 as built.
