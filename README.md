# Kedjan

A Swedish daily word puzzle. Each day gives a start part, a target part, and a
pool of ten part-chips. You drag or tap chips into the chain to build
a bridge from start to target, where **every adjacent pair of parts must fuse
into a real Swedish compound** — grund+val → grundval, val+natt → valnatt.
There is no cap on length: any chain that holds wins, and par is the measure
to beat rather than a wall to hit. Three lives guard against brute force — a
chip that welds with neither neighbour costs one.

**Parts go down in any order, and the chain grows as you build it.** There is
no row of empty slots: how many links a day needs is part of the puzzle, and a
board laying out four gaps has already answered it. The whole chain is judged
after every placement, each joint carrying its own green tick or red cross, and
the chip that completes it finishes the day — there is nothing further to press.

Par is hidden too. The first hint buys it, which makes asking a real decision
rather than a formality.

Nothing is ever refused, so a chip you are unsure of costs you a thought rather
than a slap. The joint *into the target* shows its green check the moment that
weld holds — a real word is real information — but its red cross is withheld
while slots remain: a cross under a half-built bridge would say "wrong" when
the honest answer is "not yet".

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
- **Hints are pathfinding, not content.** Three rungs, cheapest first: par
  (the shape of the answer, which the board no longer gives away), then the
  chips that lead nowhere are dimmed, then the chip itself. All of it
  is breadth-first search over the day's pool graph, anchored to the player's
  real position, and a position that cannot reach the target yields a free
  rescue. No AI, no authoring, always adaptive.
- **A day needs at least three opening moves.** A start that welds to only one
  chip means move one is not a choice. Two prototype days died on this.
- **One lexeme, one form.** `far` and `fader` in the same pool is a guess, not
  a choice; the generator refuses register doublets outright.

Difficulty has three measured dials: par (3 for weekdays, 4 for harder days),
valid-pairs count (a healthy band is roughly 20–30 over twelve parts), and
solution count (a hard requirement of 3–12 within budget). The single most
descriptive number for a day is the pairs-to-solutions ratio: many welds, few
escapes.

Solution count alone flatters a day, though. Eight routes that all funnel
through one part are one idea with variations, so routes must be **genuinely
independent** — sharing no intermediate chip. The floor scales with par (3 at
par 3, 2 at par 4) because `3 × (par − 1)` chips of a ten-chip pool is all the
room there is, and decoys need the rest.

Independence alone is not enough either. Three routes that weld only along
themselves are three visible islands, and a player who spots that `hund`, `ben`
and `böj` join nothing else has been handed the answer by elimination. So every
route must **cross-link** into the rest of the pool, and at most one chip may
weld solely within its own route.

## Dragging

There is one drop target on the board and one rule for hitting it.

**Joints are the only targets.** A joint is the gap between two parts, and it
is the same thing as an insertion point — joint `i` sits between `full[i]` and
`full[i + 1]`, so a chip dropped there lands exactly there. Parts themselves
are drag *sources* only. They used to be targets as well, which meant a part
and the joint above it both claimed the same drop and neither could be aimed
at deliberately.

**A target looks like the thing that lands in it.** An open joint grows to hold
a chip-shaped dashed outline the width of a chip, not a small circle, and while
a chip is in flight *every* joint shows its outline — a player should be able
to see where a chip may go without hunting for it.

**A drop resolves to the gap it is nearest**, by distance to the joint's edge,
with a 140px snap radius so a chip released over a part still lands rather than
silently going home. Edge distance rather than centre distance, because the
open joint is taller than the rest and centre distance is therefore not
monotonic down the chain: the same gesture could send a chip *backwards*, past
a part it was released below. Edge distance splits each gap at its midpoint, so
the rule a player forms — "it goes in the gap I aimed at" — is the rule that
runs.

**A full chain still takes drops from its own parts.** Moving a part already in
the chain does not lengthen it, so the joints stay available at the link
ceiling instead of demanding a removal first.

Zone ids live in `src/game/useChipDrag.ts` as `POOL_ZONE` and `JOINT_ZONE`
rather than string literals in both the markup and the parser. They were once
renamed in the markup and not the parser, drag-to-joint silently stopped
working, and nothing failed — the tests exercised clicks.

## Accessibility

Every chip is a real `<button>`, so the game is fully playable from the
keyboard and by a screen reader with no drag involved — pointer drag and tap
are shortcuts layered on top, not the only route. Colour is never the only
signal: hints add a star and a border weight, verdict badges carry a ✓ or ✗
glyph as well as green or red, and every joint states its verdict in words for
a screen reader. All text/background pairs clear WCAG AA in both
light and dark themes (honey is a fill colour only — honey on paper is 2.6:1).
Motion respects `prefers-reduced-motion`.

## Test mode

Add `?dev` to the URL. It sticks across reloads; `?dev=0` turns it off, and it
is always on under `npm run dev`.

It gives a tester the two things the game deliberately withholds from a player:

- **Spela om dagen** — put a solved day back on the table. The stats keep the
  first result, so replaying explores without rewriting history.
- **The whole weld table** — every pair in the day, the word that witnesses it,
  and SALDO's sense for that word, unreachable ones greyed, plus every
  solution. This is the one that matters: `morfin` sat in a shipped pool
  through several rounds of review because probing a pool one tap at a time
  never shows you the whole table.

  The glosses are the *evidence*. SALDO places every sense against two
  neighbours, and for a compound those two are usually its own analysis, so a
  gloss that has nothing to do with the claimed parts is the tell:
  `hundmat · mat, hund` holds up, `morfin · narkotika` does not, and
  `värddjur · parasit` is the sort of confirmation that saves an argument.
  Only about 40% of welds have an entry, so **ingen källa** means "no evidence
  either way", not "not a word".

`Nollställ allt` wipes local progress and stats.

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
- **Solved days reveal the alternative routes** — "8 andra vägar fanns",
  expandable into one map: routes branch out from the start in every
  direction, join back wherever the rest of the way is shared, and funnel
  into a single target node. Joins are only drawn when two branches share
  their *entire* continuation, which is what makes them safe — every path
  through the picture is a real way to win, never a chimera of two routes.
  The player's own route runs through it in green with a ✓ — never colour
  alone — and the routes stay readable as plain text for screen readers.

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
