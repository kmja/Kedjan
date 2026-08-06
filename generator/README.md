# Kedjan's data pipeline

Lexicons → compound splitting → part graph → days → curation lint.

The reference prototype was a single script. It is split here so each stage can
be tested without the multi-megabyte corpora, and so the rules learned in
playtesting live somewhere that enforces them rather than somewhere that
remembers them.

```
kedjan/lexicon.py  loading the three word lists
kedjan/split.py    recursive-minimal compound splitting
kedjan/graph.py    the pair graph, hub selection, concatenation augmentation
kedjan/days.py     day generation under the playtested constraints
kedjan/curate.py   the lint a curated calendar must pass
kedjan/cli.py      generate / lint
```

## Corpora

Fetch these into `generator/` — they are gitignored.

| file | what |
|------|------|
| `swedish.dic` | DSSO hunspell word list (affix flags stripped on read) |
| `swe_wordlist` | a larger open Swedish word list, one word per line |
| `sv_50k.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), Swedish, `word count` per line |

Splitting and the pair graph run against the DSSO set. The union of both lists
backs the concatenation-lookup augmentation, which only ever asks "is this
string a word", never "how does it split" — in the reference run it recovered
1,876 pairs that DSSO's split graph missed.

## Running it

```
python3 -m kedjan.cli generate --out candidates.json --first 2026-08-07 --start-no 5
python3 -m kedjan.cli lint ../public/days.json --dic swedish.dic
python3 -m pytest tests -q
```

`generate` writes candidates and lints them on the way out. `lint` exits
non-zero on any error, so it belongs in CI. Passing `--dic` to `lint` enables
the lexicon-backed weld check — the one that catches a structurally valid but
non-existent compound — and it is the check most worth running before a day
reaches a player.

## The heuristics, and what replaces them

Every rule in `split.py` and the `INFLECTED_FORMS` list in `graph.py` are
stand-ins for morphology this pipeline does not have. Requirement one is
migrating the part graph to **Språkbanken SALDO** (CC BY 4.0, attribution
required): lemma-based part nodes and real linking-form morphology. Keep the
augmentation even then — no single lexicon has every compound. Verify the DSSO
licence if it stays in the mix.

The suffix, prefix and inflection lists here are the prototype's, carried over
deliberately unchanged so the migration has a known baseline to diff against.

## The lint

`curate.py` is the part that did not exist in the reference script. It encodes
the playtesting rules as checks so the human curation pass — which is still
mandatory — spends its attention on taste and tone rather than on failures the
rules already describe.

Errors block a day: solution count outside 3–12, a pool under nine parts, a
direct start→target weld, a colour or a prefix particle at an endpoint, a
witness that is not its two parts joined, a verb conjugation posing as a
compound, a reused endpoint or a duplicated date. Warnings are for a reviewer
to overrule knowingly.

It caught three contaminated days in the prototype's own set on first run — see
`../CURATION.md`.
