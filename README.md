# Kedjan

A Swedish daily word puzzle. Each day gives a start part, a target part, and a
pool of ten part-chips. You drag or tap chips into a fixed row of slots to build
a bridge from start to target, where **every adjacent pair of parts must fuse
into a real Swedish compound** — grund+val → grundval, val+natt → valnatt. The
chain has a fixed budget of links (par + 1); winning means reaching the target
within budget.

**Parts go down in any order and nothing is checked as they land.** The target
is the final link: close the chain onto it and every joint is judged at once,
with each break named and marked. The game is arrangement and deduction, not
probing — a chip you are unsure of costs you a thought, not a slap.

```
npm install
npm run dev
```

## What is here

```
src/            the game — React, TypeScript, fully client-side
  game/         graph, validation, hints, storage, sharing, day rotation
  components/   chain, pool, controls, result, archive, stats
public/days.json  the curated calendar the client fetches at runtime
generator/      the data pipeline: lexicons → compounds → part graph → days
```

The runtime is fully static. A day object is under a kilobyte, so the curated
calendar is a JSON file on a CDN with rotation keyed to the player's local
date — no backend, no API costs, no accounts.

## The design, and what it is not

This shape was reached through roughly fifteen iterations, and the discarded
versions are guardrails rather than history. An open Spelling-Bee-style "find
all compounds" mode died on maths: any reasonable letter constraint yields
200–1600 valid answers. A single guess-the-compound riddle was too short for a
daily ritual. Free-text chain-building was too hard — recall against an
invisible graph of eleven thousand words. Whole-compound tiles dealt per turn
played like a signposted maze.

The surviving form is all information visible up front, deduction over
arrangement. **Do not reintroduce free-text entry, per-turn dealt options, or
open answer lists.**

### Rules learned in playtesting

Each was paid for with a found flaw. The generator encodes them as constraints
and `generator/kedjan/curate.py` enforces them as a lint.

- **Recognition over recall.** No keyboard. The pool is the move-space.
- **Decoy quality is selectivity, not connectivity.** A good decoy welds with
  two to four pool members. Universal combiners — colours (blå has degree 93)
  and the stor/halv class of adjectives — create ambiguity without structure,
  and are excluded by a degree ceiling and an explicit colour ban. Every pool
  part is capped at roughly five in-pool welds.
- **Pool parts are lemmas only.** lägga, never lagt or lägger. Surface form
  belongs to position: lägg- initially, -lägga finally.
- **Endpoints are curated.** No inflected forms, no plurals, no prefix
  particles — a till→X day was flagged in playtesting and the generator now
  excludes particle starts.
- **False rejections are the top quality metric.** Every "är inte ett ord" for
  a word the player knows is real (grundkurs, bollplan) spends trust the game
  cannot refund. It is a lexicon-coverage problem, and the in-game report
  button exists to track it as a KPI.
- **Hints are pathfinding, not content.** Breadth-first search over the day's
  pool graph, anchored to the end of the longest run that already holds — the
  only position that means anything once parts can be arranged out of order.
  The first hint gives distance-from-there, the second marks the optimal next
  chip, and a position that cannot reach the target yields a free rescue. No
  AI, no authoring, always adaptive.
- **A day needs at least three opening moves.** A start that welds to only one
  chip means move one is not a choice. Two prototype days died on this.
- **One lexeme, one form.** `far` and `fader` in the same pool is a guess, not
  a choice; the generator refuses register doublets outright.

Difficulty has three measured dials: par (3 for weekdays, 4 for harder days),
valid-pairs count (a healthy band is roughly 20–30 over twelve parts), and
solution count (a hard requirement of 3–12 within budget). The single most
descriptive number for a day is the pairs-to-solutions ratio: many welds, few
escapes.

## Accessibility

Every chip is a real `<button>`, so the game is fully playable from the
keyboard and by a screen reader with no drag involved — pointer drag and tap
are shortcuts layered on top, not the only route. Colour is never the only
signal: hints add a star and a border weight, and status messages carry a ✓ or
✗ glyph alongside the colour. All text/background pairs clear WCAG AA in both
light and dark themes (honey is a fill colour only — honey on paper is 2.6:1).
Motion respects `prefers-reduced-motion`.

## Tests

```
npm test              # game logic, interaction, and the shipped calendar
npm run test:generator  # the pipeline and the curation lint
npm run typecheck
```

The calendar itself is under test: `src/game/days.test.ts` re-derives every
shipped day's solution count, pool size, endpoint distinctness, and checks that
every pair's witness really is its two parts joined.

## Open questions from the handover, and how they were answered

Both were left to the build, with the note "my instinct says yes to both,
cheaply". Both are in:

- **Failed weld attempts join the share line** as a second stat
  (`· 2 felförsök`), next to the confessed hint count.
- **Solved days reveal the alternative routes** — "2 andra vägar fanns",
  expandable to show them.

## Status and next steps

The client is complete for v1. The pipeline is ported, restructured so each
stage is testable without the corpora, and extended with the curation lint. The
calendar is the thin part — see `CURATION.md`.

1. **Migrate the graph to Språkbanken SALDO** (CC BY 4.0, attribution
   required). The hunspell dictionary now in use answers "is this a word" but
   nothing else, and three defects need more than that: it cannot tell
   *farbroder* (archaic) from *farbror* (live), cannot tell *riskerar* (a
   conjugated verb) from a compound, and cannot express that *broder-* is
   correct initially and *-bror* finally. All three need lemma-based nodes and
   linking-form morphology. Keep the concatenation augmentation even after
   SALDO; no single lexicon has every compound. **Språkbanken is currently
   blocked by the environment's network policy** — allowlisting
   `spraakbanken.gu.se` is the unblock.
2. **Grow the calendar.** Five days is a week, not a daily.
3. **Point the report button at a collector** (`VITE_REPORT_URL`) so false
   rejections become a tracked number rather than an inbox.

The mechanic is portable to any compounding language — German and Dutch are
obvious — with everything language-specific living in the corpus and the
generator.
