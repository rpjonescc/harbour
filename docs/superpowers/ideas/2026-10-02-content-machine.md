# Idea: Content machine

Status: **spec drafted, awaiting review; not built.** Noted 2026-10-02 as the natural next step after the
plain-language UX work; the design is in
[`docs/superpowers/specs/2026-10-02-content-machine-design.md`](../specs/2026-10-02-content-machine-design.md).

## Why

Harbour's scans keep pointing at the same gap: products need more original, quotable pages
(guides, worked examples, answers to real questions) to be found on Google, recommended by AI
assistants and quoted as direct answers. Writing that content is the bottleneck. The content
machine turns Harbour's findings into a steady, owner-approved publishing flow.

## Rough shape (to be designed)

1. **Content pillars per product.** The owner curates 3–5 themes each product should be known
   for. Harbour suggests pillars from the research, the scans and Search Console queries; the
   owner approves them, the same way research targets are approved today.
2. **Ideas and briefs.** For each pillar, Harbour proposes topics: questions people actually
   search or ask AI assistants, gaps the scans found, and competitor topics. Each brief names
   the search intent, the angle, the sources to cite and the answer-first structure.
3. **Drafts.** An agent writes a draft into the Second Brain (agents still only write inside the
   brain directory and only propose).
4. **Atomising.** One approved article becomes derivative pieces: social posts, a newsletter
   blurb, FAQ entries, short answers for existing pages.
5. **Quality gates before anything is published:**
   - an anti-"AI slop" pass;
   - a humaniser pass;
   - a fact and source check, with health, legal and curriculum claims flagged for the owner;
   - the owner's approval.
6. **Publishing hand-off.** Approved content becomes an action, or a PR in the product's repo
   through the same Claude triage flow as other actions. Harbour never publishes on its own.
7. **Feedback loop.** Later scans and Search Console show whether each piece got found, cited
   or quoted, which feeds the next round of ideas.

## Open questions for the brainstorm

- Where pillars, briefs and drafts live: brain docs, new tables, or both.
- The slop and humaniser passes use the `no-ai-slop` (petergyang/no-ai-slop) and `humanizer` (blader/humanizer) skills; decide how their output is checked and recorded.
- Cost and budget limits for drafting runs.
- How derivative pieces (social posts and so on) leave Harbour, since Harbour doesn't post anywhere.
- How "atomised" pieces are tracked back to their source article.
