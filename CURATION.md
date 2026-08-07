# Curation

The generator proposes; a human decides. This document is the process, the
record of what it has caught, and what it still cannot see.

## The process

```
./fetch-corpora.sh                                   # 0. corpora
python3 -m kedjan.cli generate --out candidates.json \
        --first 2026-08-02 --par3 10 --par4 8        # 1. propose
python3 -m kedjan.cli review candidates.json         # 2. read
python3 -m kedjan.cli accept candidates.json \
        --pick fin hund hel mat djur \
        --first 2026-08-02 --dic sv_SE.dic \
        --reject "bär=funnel through val" ...        # 3. decide
python3 -m kedjan.cli lint ../public/days.json --dic sv_SE.dic   # 4. verify
```

**0 — Corpora.** SALDO decides what may be a *part*; the hunspell list decides
whether a *compound* exists. Neither can do the other's job, and the generator
degrades to hand-built filters when SALDO is absent rather than refusing to run.

**1 — Propose.** Every hard requirement is enforced here, so a candidate that
reaches you already satisfies all of them. Ask for more than you need: the yield
after curation is roughly a third.

**2 — Review.** A table of the measurable, then each pool in full. The table is
for scanning; the pools are for reading aloud. Nothing in step 2 decides
anything — it exists to put the judgeable things in front of you and keep the
unjudgeable things out of your way.

**3 — Decide.** `accept` re-runs the full lint against your picks and writes
nothing if anything blocks, so a bad pick cannot reach `days.json` by accident.
Rejections go to `curation-log.json` with a reason. That ledger is the point:
**a reason that recurs is a rule waiting to be written.** Every rule in the
table below started as a sentence typed into `--reject`.

`accept` now reads the ledger back and names anything rejected more than once,
because relying on a human to notice is how `tok-` got rejected by hand twice
and encoded zero times — until `hel-` shipped for exactly the same reason.
Current repeat offenders worth turning into rules:

```
flyg: an injury pool in a cosy daily / bett, brott, skallbrott reads violent
vår:  toppen is a definite form (twice)
hopp: svärdgräs, skyddsvärd marginal (twice)
```

**4 — Verify.** `lint` refuses to run without a dictionary unless you pass
`--no-lexicon` explicitly, because a green lint that skipped the weld check is
worse than no lint. CI runs it with `--dic` on every push.

## What the machine checks

**Hard requirements** — enforced in `days.py`, re-checked in `curate.py`, so a
day that fails one can neither be generated nor accepted.

| requirement | why |
|---|---|
| 3–12 solutions within budget | fewer is a single line to find; more and the deduction evaporates |
| independent routes: 3 at par 3, 2 at par 4 | raw solution count flatters a day — see below |
| each route reaches ≥ 2 chips outside itself | otherwise it is an island, found by elimination |
| ≤ 1 chip welding only inside its own route | two or more and the pool reads as separate groups |
| ≥ 3 chips weld to the start | move one must be a choice |
| ≥ 2 chips weld into the target | so must the last move |
| branching ≥ 2 at every step | a route of single options is a corridor |
| shortest route == par | otherwise par is a label no player can reach |
| ≥ 9 pool parts, no endpoint among them | |
| no direct start→target weld | there would be no puzzle |
| distinct starts and targets, one day per date | |
| every witness is its two parts joined | |
| every witness present in the dictionary | the only check that catches a compound that does not exist |
| no colour, numeral, closed-class or off-tone part | universal combiners and bad mornings |
| no degree prefix (hel-, tok-, jätte-) | helfin is "really nice", not a compound |
| no register doublet in one pool | `far` and `fader` together is a guess, not a choice |
| no verb conjugation posing as a compound | risk+e+ras is *riskeras* |
| sound linking morpheme in both directions | see below |

**Warnings** — for you to overrule knowingly: pair count outside 20–30, a part
every solution funnels through, and welds on solution paths that SALDO does not
record.

## What only a human can see

Read every pool aloud.

1. **Tone.** The frequency list is built from film subtitles, so it ranks
   spoken Swedish — `skit`, `bög`, `snut` and `fan` all sit in the first few
   hundred. `TONE_BAN` catches the ones already found. It will not catch the
   next one.
2. **Register and currency.** `farbroder` is in the hunspell dictionary and is
   archaic; live Swedish is `farbror`. SALDO knows the difference and so do
   you. A dictionary that merely *contains* a word cannot.
3. **Endpoint taste.** Real lemmas, no particles, no definite forms, no slang —
   and beyond that, a word a player would volunteer unprompted.
4. **Coherence.** `mat, gäst, frihet, glas, kropp, straff, miss, middag, bord,
   natt` reads as a pool. Ten unrelated nouns do not, even at identical metrics.

## What this has caught

Each entry was a defect found in play or in review, and is now a rule.

| found as | rule |
|---|---|
| `till → kör` | no prefix particles at endpoints |
| `riskerar`, `grupperas`, `värderas` | verb conjugations behind foge-*e* |
| `huvud → tusen`: fyra, hundra, tjugo, två | numerals banned, like colours |
| `hetsbrott` | foge-*s* is unsound when `a+s` is a word — it is hets+brott |
| `toksvår`, `båtskatt`, `benskör`, `medelsvår` | …and equally when `s+b` is a word — tok+**svår**, båt+**skatt** |
| `farbroder`; `far` and `fader` in one pool | SALDO as the lemma authority; doublets barred |
| `het → bank`, `full → rock`: one opening | minimum openings |
| every shipped day funnelling through one closing chip | minimum closings, branching profile |
| `hund → höger`: par 4, shortest route 5 | par must equal the shortest route |
| `ögat`, `mans`, `gör` | definite, genitive and finite forms are not lemmas |
| `snöande`, `bärande` | `ande` barred as a part — finally it spells a participle |
| `hund`/`ben`/`böj` welding to nothing else | routes must cross-link; isolated chips capped at one |
| `benbrott`, `skallbrott`, `hundbett` | an injury pool in a cosy daily — cut on tone |
| `helfin`, `helkul`, `heltokig` | degree prefixes, caught by adjective-head share |

The two linking-morpheme rules are worth reading together. The letter between
two parts can belong to either neighbour, and if it belongs to one, the
compound is not `a+b` at all:

```
het   + s + brott   is really  hets + brott     (hets is a word)
tok   + s + vår     is really  tok  + svår      (svår is a word)
strid + s + vagn    really is  strid-s-vagn     (neither strids nor svagn)
```

## What shipped

Five days, curated from twenty candidates.

| # | date | day | par | sols | indep | cross | open | close | branching |
|---|------|-----|-----|------|-------|-------|------|-------|-----------|
| 1 | 2026-08-02 | slag → flaska | 4 | 6 | 2 | 5 | 4 | 2 | 4, 2, 3 |
| 2 | 2026-08-03 | slut → teori | 3 | 10 | 3 | 6 | 5 | 4 | 5, 2 |
| 3 | 2026-08-04 | hund → glas | 3 | 9 | 4 | 2 | 4 | 4 | 4, 2 |
| 4 | 2026-08-05 | jul → skydd | 3 | 10 | 3 | 2 | 5 | 3 | 5, 2 |
| 5 | 2026-08-06 | musik → sätt | 3 | 7 | 3 | 2 | 5 | 3 | 5, 3 |

No day carries an isolated chip. `slut→teori` replaced `hel→gäst`, and is placed
away from `musik→sätt` because their pools share kör, sång, låt and val — two
near-identical pools on consecutive days would read as a repeat.

`lint --dic` reports zero errors. Rejections and their reasons are in
`generator/curation-log.json`.

## Solution count is not route diversity

The band is 3–12, and the ceiling is deliberate: the design wants *many welds,
few escapes*, so a day with thirty ways to win has no deduction left in it.
More is not better past a point.

Worse, the raw count flatters. `fin→tro` has eight solutions and only **two**
that are genuinely independent — the rest funnel through `gäst`, so a player
who finds that one chip has finished thinking. `hund→glas` has nine solutions
and four independent ones, and is a materially better puzzle at a nearly
identical count.

`disjoint_routes` is the honest number: the largest set of solutions that
share no intermediate chip. It is the column to read in `review` before the
solution count.

### The floor has to scale with par

Three disjoint routes need `3 × (par − 1)` chips at minimum length. Against a
ten-chip pool:

```
par 3:  3 × 2 = 6 chips,  4 left for decoys
par 4:  3 × 3 = 9 chips,  1 left for decoys   <- nothing left to deduce
par 5:  3 × 4 = 12 chips, impossible
```

So the floor is 3 at par 3 and 2 at par 4 — not a preference, arithmetic.
Measured before it was decided: of eighteen candidates generated at a flat
floor of two, three cleared a flat floor of three, and every one was par 3.

### Independent is not enough — routes must be entangled

Three routes that weld only along themselves are three visible islands. Spot
that `hund`, `ben` and `böj` join nothing else in the pool and elimination
hands you the answer without any deduction at all. Two rules guard this:

- **`route_cross_links`** — welds from each independent route out to the rest
  of the pool, endpoints excluded (every route touches both by definition).
  Fewer than two and the route is an island.
- **`isolated_chips`** — chips welding to nothing beyond their own route.
  One is a mild tell and common: fifteen of twenty candidates carried one. Two
  or more partitions the pool visibly, and blocks the day.

Only five of twenty candidates had *zero* isolated chips, which is why the bar
is one rather than none — at zero, tone cuts left four days, not five.

## Degree prefixes: how helfin got in

`helfin` shipped, and its whole verification was presence in the hunspell list.
It is absent from SALDO, and `review` flagged it as a weak weld — a warning I
overruled without noticing what class of word it was.

`hel-` is a productive degree prefix meaning "completely". The dictionary's
coverage of it is arbitrary, which is the tell:

```
helfin ✓ SFOL ✗ SALDO      helglad ✗ SFOL ✗ SALDO
helkul ✓ SFOL ✗ SALDO      helstor ✗ SFOL ✗ SALDO
helsvensk ✓ SFOL ✓ SALDO   (genuine: "wholly Swedish")
```

The handover names the stor/halv class as universal combiners excluded **by the
degree ceiling**. Raising that ceiling from 50 to 250 for the larger corpus —
necessary, or content nouns were excluded instead — quietly reopened the gate.

SALDO's part-of-speech tags make the test measurable rather than remembered.
What share of a part's welds land on an *adjective*?

```
hel  56%      hund 13%   mat 17%   natt 20%
tok  82%      fin  17%   god  27%
```

Degree prefixes sit at 56–82%; real parts, including adjectives that compound
properly, stay under 30%. The ceiling is 40%, and the named list survives only
as the fallback for a SALDO-less run.

## Known gaps

- **SALDO absence is not a quality score.** Only about 35% of any day's welds
  appear in SALDO, and that share barely varies between good days and bad, so
  it discriminates nothing on its own. The individual `weak` list is still
  worth reading; the percentage is not worth computing.
- **Positional forms are not modelled.** `broder-` is right initially
  (broderskärlek) and wrong finally (farbroder → farbror). SALDO's *morphology*
  layer has this; the semantic lexicon shipped here does not.
- **Tone bans are a denylist**, so they only ever catch what has already been
  found once. `flyg→ställe` has now been rejected twice for the same injury
  pool — `bett`, `ben`, `brott`, `skall` — and passes every metric both times.
  The problem is the *cluster*, not any single word: `brott` is ordinary in
  `brottsplats`. SALDO is a semantic lexicon and its descriptor column could
  measure that clustering directly, which is the obvious next move.
- **A concatenation can coincide with an unrelated word.** `skydd` + `svärd`
  spells *skyddsvärd*, which is real but parses as skydds+värd, "worthy of
  protection" — an adjective, not a compound of shield and sword. SALDO's POS
  tag on the witness would catch it (a noun+noun compound that is only ever an
  adjective is suspect); not yet implemented.
