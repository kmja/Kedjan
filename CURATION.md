# Curation notes

The generator proposes; a human decides. This file records what the current
`public/days.json` has been through, and what it has *not*.

## What shipped

Four days, `2026-08-03` … `2026-08-06`, carried over from the prototype's
hand-checked set.

| # | date | day | par | pairs | solutions |
|---|------|-----|-----|-------|-----------|
| 1 | 2026-08-03 | huvud → tusen | 3 | 29 | ✓ in band |
| 2 | 2026-08-04 | full → rock | 3 | 23 | ✓ in band |
| 3 | 2026-08-05 | het → bank | 3 | 26 | ✓ in band |
| 4 | 2026-08-06 | färg → broder | 4 | 23 | ✓ in band |

`python3 -m kedjan.cli lint ../public/days.json` reports zero errors.

## What was cut, and why

The prototype shipped eight days. Four were dropped:

- **till → kör** — `till` is a prefix particle. The handover records this
  exact day as flagged in playtesting, so the rule is now enforced in
  `usable_endpoint()` and in the lint.
- **grupp → synd**, **flyg → hård**, **hund → hundra** — all three carry welds
  that are verb conjugations rather than compounds: *riskerar* is not risk+rar,
  *grupperas* is not grupp+ras, *modelleras* is not modell+ras, *värderas* is
  not värd+ras. The splitter's foge-e rule manufactured them. Two of the three
  also had `rar` as a pool chip, which is not a Swedish word at all.

  These are **false acceptances** — the mirror of the false rejections the
  handover names as the top quality metric, and arguably worse: a rejection
  annoys a player, an acceptance teaches them a rule the game does not follow.

The lint rule that catches these turns on the linking morpheme, not the tail.
`hund` + `ras` is *hundras*, a perfectly good compound, because *ras* is a real
noun; it is `risk` + **e** + `ras` that spells a conjugated verb. Flagging the
tail alone condemned six innocent pairs on the first pass.

## Warnings knowingly overruled

```
warn  full→rock  start 'full' is a derivational suffix
warn  het→bank   start 'het' is a derivational suffix
```

Both are real standalone words (*full*, *het*) and both appear here as the
**start** of a chain, welding forwards. `SUFFIX_STOP` exists to stop a compound
*ending* in a derivational suffix, which is not what these days do. Kept.

## What has NOT been checked

**The lexicon-backed weld check has not been run.** `kedjan.cli lint --dic …`
verifies that every witness word actually exists in the corpus, and that is the
check that would catch a structurally valid but non-existent compound. It needs
the corpora, which are not in this repository. Until it runs, the shipped days
are structurally sound but not lexically verified — `senfull` in the full→rock
day is the kind of thing to look at first.

Run before shipping to real players:

```
cd generator
python3 -m kedjan.cli lint ../public/days.json --dic swedish.dic
```

Tone has not been re-reviewed either. The pipeline once proposed *maskingevär*
into a cozy garden puzzle; het→bank is a crime-desk day (mord, vapen, brott)
which is coherent but worth a deliberate yes.

## The checklist

For every proposed day, before it ships:

1. `kedjan.cli lint` clean, **with `--dic`**.
2. Endpoints: real lemmas, no particles, no plurals, words a player would
   volunteer unprompted.
3. Tone: does the pool hang together, and is that a tone you want that day?
4. Pool sanity: read all ten chips aloud. Anything that is not a word you would
   use in a sentence is a splitter artefact.
5. Par matches the shortest route; 3 for weekdays, 4 for harder days.
