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

**4 — Verify.** `lint` refuses to run without a dictionary unless you pass
`--no-lexicon` explicitly, because a green lint that skipped the weld check is
worse than no lint. CI runs it with `--dic` on every push.

## What the machine checks

**Hard requirements** — enforced in `days.py`, re-checked in `curate.py`, so a
day that fails one can neither be generated nor accepted.

| requirement | why |
|---|---|
| 3–12 solutions within budget | fewer is a single line to find; more and the deduction evaporates |
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

The two linking-morpheme rules are worth reading together. The letter between
two parts can belong to either neighbour, and if it belongs to one, the
compound is not `a+b` at all:

```
het   + s + brott   is really  hets + brott     (hets is a word)
tok   + s + vår     is really  tok  + svår      (svår is a word)
strid + s + vagn    really is  strid-s-vagn     (neither strids nor svagn)
```

## What shipped

Five days, curated from eighteen candidates.

| # | date | day | par | sols | open | close | branching |
|---|------|-----|-----|------|------|-------|-----------|
| 1 | 2026-08-02 | fin → tro | 4 | 8 | 4 | 2 | 4, 2, 2 |
| 2 | 2026-08-03 | hund → glas | 3 | 9 | 4 | 3 | 4, 3 |
| 3 | 2026-08-04 | hel → söt | 3 | 6 | 4 | 2 | 4, 2 |
| 4 | 2026-08-05 | mat → plikt | 3 | 7 | 5 | 2 | 5, 2 |
| 5 | 2026-08-06 | djur → gäng | 4 | 3 | 4 | 2 | 4, 2, 2 |

`lint --dic` reports zero errors. Rejections and their reasons are in
`generator/curation-log.json`.

## Known gaps

- **SALDO absence is not a quality score.** Only about 35% of any day's welds
  appear in SALDO, and that share barely varies between good days and bad, so
  it discriminates nothing on its own. The individual `weak` list is still
  worth reading; the percentage is not worth computing.
- **Positional forms are not modelled.** `broder-` is right initially
  (broderskärlek) and wrong finally (farbroder → farbror). SALDO's *morphology*
  layer has this; the semantic lexicon shipped here does not.
- **Tone bans are a denylist**, so they only ever catch what has already been
  found once.
