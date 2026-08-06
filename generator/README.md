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

Run `./fetch-corpora.sh`. Both files are gitignored — they are multi-megabyte
and separately licensed, so they are fetched rather than vendored.

| file | what | licence |
|------|------|---------|
| `sv_SE.dic` | [yeager/hunspell-sv](https://github.com/yeager/hunspell-sv) — hunspell stem list, upstream **SFOL 2.42** (Den stora fria ordlistan, Göran Andersson), which itself folds in Språkbanken SALDO and SAOL 15 | LGPL-3.0, attribution to SFOL required |
| `sv_50k.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), Swedish | MIT |

The `.dic` declares 279,120 entries; 249,997 survive the reader's filter
(letters only, three characters or more). Note that only stems are fetched —
the `.aff` affix rules are not applied, so inflected surface forms are absent
by design. That is what we want for a lemma-based part graph, and it is also
why the concatenation-lookup augmentation still earns its place: it asks "is
this string a word", never "how does it split".

**The frequency list is derived from film subtitles.** It ranks spoken Swedish,
so it is a good prior for "would a player recognise this" and a bad one for
tone — `skit`, `bög`, `snut` and `fan` all rank in the first few hundred. Hence
`TONE_BAN` in `graph.py`.

## Running it

```
./fetch-corpora.sh
python3 -m kedjan.cli generate --out candidates.json --first 2026-08-02 --par3 10 --par4 8
python3 -m kedjan.cli review  candidates.json
python3 -m kedjan.cli accept  candidates.json --pick fin hund hel mat djur \
        --first 2026-08-02 --dic sv_SE.dic --reject "bär=funnel through val"
python3 -m kedjan.cli lint    ../public/days.json --dic sv_SE.dic
python3 -m pytest tests -q
```

`generate` proposes and lints on the way out. `review` prints what a curator
has to judge and decides nothing. `accept` re-lints your picks and writes
nothing if anything blocks, logging every rejection and its reason to
`curation-log.json`. `lint` exits non-zero on any error and **refuses to run
without a dictionary** unless given `--no-lexicon`: the weld check is the one
that catches a compound that does not exist, and a green lint that skipped it
is worse than no lint.

The full process, and what it has caught, is in `../CURATION.md`.

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
