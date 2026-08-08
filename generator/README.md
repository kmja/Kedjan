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
kedjan/karp.py     word-existence lookups against Språkbanken's Karp API
kedjan/cli.py      generate / lint / saolcheck
```

## Corpora

Run `./fetch-corpora.sh`. The files are gitignored — they are multi-megabyte
and separately licensed, so they are fetched rather than vendored.

| file | what | licence |
|------|------|---------|
| `sv_SE.dic` | [yeager/hunspell-sv](https://github.com/yeager/hunspell-sv) — hunspell stem list, upstream **SFOL 2.42** (Den stora fria ordlistan, Göran Andersson), which itself folds in Språkbanken SALDO and SAOL 15 | LGPL-3.0, attribution to SFOL required |
| `sv_SE.aff` | the affix file for the same dictionary — the authority for what its flag letters mean | LGPL-3.0 |
| `sv_50k.txt` | [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords), Swedish | MIT |

`saldo_2.3/` is **not** fetched: Språkbanken serves it behind a landing page
rather than a stable file URL, so it is placed by hand. Everything degrades to
the hand-built filters when it is absent, which is what CI runs on.

### Two dictionaries, and they are not independent

There are two *dictionaries* and one frequency list. SFOL and SALDO do
different jobs — SALDO decides what may be a **part**, SFOL decides whether a
**compound exists** — but they are not separate witnesses: SFOL folds SALDO in
upstream. So "SFOL has it, SALDO does not" is never two sources disagreeing.
It means the word sits in the part of SFOL that SALDO never vouched for, which
is where `glasbåt` and `finbord` were found.

The frequency list is not a third dictionary. It ranks words by how common
they are and never says whether something is a word.

### What the reader keeps

The `.dic` declares 279,120 entries. 260,167 lines pass the letters-only,
three-characters-or-more filter, spelling **249,997 distinct stems** — a word
recurs when it has several paradigms. Of those, **5,985 are dropped** for
carrying a flag that means "not a word you may use on its own", leaving
**244,012**. See CURATION.md for what those flags are and what shipped before
they were read.

Only stems are fetched — the `.aff` affix *rules* are not applied, so inflected
surface forms are absent by design. That is what we want for a lemma-based part
graph.

Note that the concatenation-lookup augmentation is currently inert: `load()`
takes a supplementary word list, no path is configured, and `union` is
therefore identical to `words`. The seam is still there; nothing is in it.

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

### Checking the welds against SAOL itself

```
python3 -m kedjan.cli saolcheck --days ../public/days.json
python3 -m kedjan.cli saolcheck --words suspects.txt
python3 -m kedjan.cli saolcheck --list-resources
```

Weld words link to svenska.se in the game, which makes the academy
dictionaries the player-facing authority: a weld whose link comes up empty is
a broken promise no matter what our corpora say. Every ghost so far —
`tomslag`, `tryckord` — was found by a human tapping that link. `saolcheck`
asks the same question in bulk through [Karp](https://spraakbanken.gu.se/karp),
Språkbanken's lexical API: it reports welds the queried lexicon lacks, flags
`GHOST_WORDS` entries the lexicon actually attests (a ghost wrongly buried),
and warns when a `LEXICALIZED_SUPPLEMENT` word rests on nothing. Answers are
cached in `karp-cache.json` so repeated runs only ask about new welds.

The development sandbox cannot reach spraakbanken.gu.se, so run it from a
machine with open network — or from the manual **SAOL check** workflow in the
Actions tab, which exists for exactly that reason.

`saolpull` goes further: it pages an unfiltered query through the whole
lexicon and writes every written form to `saol-words.txt` — SAOL as a local
witness corpus rather than a per-word question. The file is gitignored by
default because the material is Svenska Akademien's, not ours; the command
prints the resource's own licence metadata before pulling, and the manual
**SAOL pull** workflow uploads the list as a run artifact (committing it to
the branch only when its `commit` switch is flipped knowingly).

Measured against the live server: `salex` is a **protected** resource — its
metadata is public and declares no licence, and queries answer
`403 Not enough permissions`. Querying it needs a Språkbanken API key
(issued under agreement with the rights holder), passed as `--api-key` or
`$KARP_API_KEY`. `saolcheck --list-resources` prints every lexicon this Karp
serves with an open/protected column, which is where to look for material a
key-less caller can actually use.

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
