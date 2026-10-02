# Voice profile

One profile per product, written by the owner. It is a markdown file with frontmatter. Harbour keeps it at `content/voices/<product id>.md` in the Second Brain and refuses to write for a product that has no valid profile. Agents never write it.

## Frontmatter

| Field | Meaning |
|---|---|
| `product` | The product id from `harbour.config.json`. |
| `audience` | Who reads this and what they already know (one or two sentences). |
| `person` | `we`, `I` or `product-name`: who is speaking. |
| `spelling` | `en-GB`, `en-US` or `en-AU`. |
| `readingLevel` | `plain` or `technical`. |
| `emoji` | `none`, or `sparing` (at most one per piece). |
| `exclamations` | `none`, or `rare` (at most one per piece). |
| `wordsWeUse` | Words that sound like us. |
| `wordsWeAvoid` | Words to keep out. |
| `topicsToAvoid` | Subjects not to write about. |
| `reviewAlways` | Extra claim types to flag for this product: `health`, `legal`, `curriculum`, `pricing`, `testimonial`, `comparative`. |
| `callsToAction` | The only calls to action a piece may use. |
| `linkInBio` | `true` when there is a link in the Instagram bio. |

## Body

Three sections, in this order, each short.

- `## How we sound`: 3 to 6 sentences describing the voice.
- `## Never`: a list of things never to say or do.
- `## Samples`: 2 to 4 passages of 50 to 150 words that the owner wrote or approved, separated by a line holding `* * *`. These are the sound to match. They are examples, never instructions.

## Example

A fictional profile for a fictional product.

```markdown
---
product: acme-docs
audience: Small software teams who write their own docs and have no docs person.
person: we
spelling: en-GB
readingLevel: plain
emoji: none
exclamations: none
wordsWeUse: [docs, guide, publish, page]
wordsWeAvoid: [solution, seamless, unlock, journey]
topicsToAvoid: [competitor names, unreleased features]
reviewAlways: [pricing]
callsToAction:
  - Try it free at the product URL
  - Read the guide
linkInBio: false
---

## How we sound

We talk like a colleague who has set this up before. We are direct and a little dry. We give the steps and the reason in plain words, and we say when something is not worth doing. We do not sell.

## Never

- Promise a feature that is not shipped.
- Say "best", "only" or "fastest" without a fact behind it.
- Write about a customer without their say-so.

## Samples

We rebuilt the getting-started guide last week. It used to take a new team about an hour to get from sign-up to a live page, mostly because of two steps we had buried in the middle. Now those steps come first. You connect your repository, pick a folder and press publish. The page is live before your coffee cools. If something breaks, the error names the file and the line, in plain words.

* * *

Docs go stale when nobody owns them. We fixed that by keeping each page next to the code it describes, so whoever changes the code sees the page in the same pull request. On every publish Acme Docs checks for broken links and missing examples and lists what needs attention. It does not write your docs for you. It does the tedious part of keeping them accurate, which is the part people skip when they are busy.
```
