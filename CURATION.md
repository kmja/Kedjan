# Curation notes

The generator proposes; a human decides. This file records what the current
`public/days.json` has been through.

## What shipped

Five days, generated from a real 250k-word Swedish dictionary and curated down
from thirteen candidates.

| # | date | day | par | pairs | solutions | opening moves |
|---|------|-----|-----|-------|-----------|----------------|
| 1 | 2026-08-02 | jul → dam | 4 | 28 | 6 | 4 |
| 2 | 2026-08-03 | hund → folk | 3 | 27 | 9 | 4 |
| 3 | 2026-08-04 | folk → hotell | 3 | 30 | 4 | 5 |
| 4 | 2026-08-05 | mat → pizza | 3 | 32 | 3 | 4 |
| 5 | 2026-08-06 | grund → gäst | 3 | 29 | 10 | 4 |

`python3 -m kedjan.cli lint ../public/days.json --dic sv_SE.dic` reports zero
errors — **every compound in every day is verified present in the dictionary.**
One warning: mat→pizza has 32 pairs against a healthy band of 20–30.

## The whole prototype calendar was cut

All eight prototype days are gone. They failed on four separate counts.

- **till → kör** — `till` is a prefix particle, flagged in playtesting.
- **grupp → synd, flyg → hård, hund → hundra** — welds that are verb
  conjugations, not compounds: *riskerar* is not risk+rar, *grupperas* is not
  grupp+ras, *värderas* is not värd+ras. Two also had `rar` as a pool chip.
- **huvud → tusen** — a pool of numerals (fyra, hundra, tjugo, två, fem, tio),
  which combine without limit exactly as colours do. Four of its welds were
  also absent from the dictionary.
- **full → rock, het → bank** — one valid opening move each, so there was no
  choice to make on move one. het→bank also rested on *hetsbrott*, which is
  hets+brott, not het+s+brott.
- **färg → broder** — *farbroder* is archaic; live Swedish is *farbror*. The
  pool also held both `far` and `fader`, two register forms of one lexeme.

## Rules added as a result

Each of these is now enforced in `kedjan/graph.py` or `kedjan/curate.py`:

| rule | what it stops |
|---|---|
| `linking_is_sound` | het+s+brott, when *hets* is itself a word |
| `NUMERALS` ban | pools that drift into arithmetic |
| `TONE_BAN` | subtitle-corpus profanity ranking as "common Swedish" |
| `CLOSED_CLASS` | jag/har/för/som as parts |
| `is_surface_form` | ögat, mans — definite and genitive forms |
| `LINKED_VERB_TAILS` | risk+e+ras spelling a conjugated verb |
| lexicon-backed weld check | any compound not actually in the dictionary |

## Known gaps

- **Register and currency are not checked.** *farbroder* is in the dictionary,
  so no existence check catches it. Distinguishing live from archaic needs
  SALDO, which is blocked by network policy here.
- **Positional forms are not modelled.** *broder-* is right initially
  (broderskärlek) and wrong finally (farbroder → farbror). This is the
  spad/spade problem the handover names, and it also needs SALDO.
- **`linking_is_sound` over-rejects.** The hunspell dictionary lists
  compound-only stems like *familje*, so familj+e+far is refused. This costs
  coverage, not correctness — a lost pair is invisible, a wrong pair is not.

## The checklist

1. `kedjan.cli lint` clean, **with `--dic`**.
2. At least three opening moves from the start, or move one is not a choice.
3. Endpoints: real lemmas, no particles, plurals, definite forms or slang.
4. Tone: read all ten chips aloud. Would you put this in front of a stranger?
5. Par matches the shortest route; 3 for weekdays, 4 for harder days.
