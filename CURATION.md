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
| solutions: 3–12 within budget at par 3; 2–6 **of any length** at par 4–5 | fewer is a single line to find; more and the day solves itself — see below |
| independent routes: 3 at par 3, 2 at par 4–5 | raw solution count flatters a day — see below |
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
| the witness inherits its head's word class | mor+fin does not spell a "fin" — *morfin* is morphine |

**Warnings** — for you to overrule knowingly: pair count outside 20–30, a part
every solution funnels through, welds on solution paths that SALDO does not
record, one chip welding only inside its own route, and two consecutive days
about the same thing.

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
| `poängsätt` | hunspell affix flags: a witness carrying a verb-only flag is a verb form |
| `körsätt`, `körskola` from the choir chip | a part whose string is also a *common* verb stem is barred |
| `benbrott`, `skallbrott`, `hundbett` | an injury pool in a cosy daily — cut on tone |
| `helfin`, `helkul`, `heltokig` | degree prefixes, caught by adjective-head share |
| `morfin`, `bankett`, `tonsur`, `minnesvärd` | a compound must inherit its head's word class |
| `tomslag` (caught in play, checked against SAOL/SO/SAOB by hand) | a ghost-word denylist for SFOL entries no other source will vouch for |

The two linking-morpheme rules are worth reading together. The letter between
two parts can belong to either neighbour, and if it belongs to one, the
compound is not `a+b` at all:

```
het   + s + brott   is really  hets + brott     (hets is a word)
tok   + s + vår     is really  tok  + svår      (svår is a word)
strid + s + vagn    really is  strid-s-vagn     (neither strids nor svagn)
```

## What shipped

**An A/B calendar**: both curation modes side by side, 24 days interleaved so
every SFOL day has a lexicalized neighbour, each tagged in the app (day
header and archive rows) with the lexicon that witnessed its welds.

- **SFOL** (odd days): welds may be any compound the spellchecker's list
  carries. Denser graph, wilder pools, and the single-witness risk class that
  produced `tomslag` — 117 such welds across these twelve.
- **SALDO** (even days): welds must be lexicalized — SALDO lemmas. Zero
  single-witness welds, zero lint warnings, 72% gloss coverage, homelier
  pools; but the graph keeps only 28% of its pairs, and no related-endpoint
  day (tom→full) exists in this space. `dröm→blind` (#16) is the first
  perfect 1.000 either sweep has produced.

Days #1–22 are released for comparison play; the last two sit in the queue.
The decision this calendar exists to inform: whether lexicalized-only
becomes the standard, SFOL stays, or the middle road — lexicalized welds on
solution paths, SFOL for decoys — gets built.

## Solution count is not route diversity

The band is tiered, because every date now carries two chains. The easy
chain is par 3 under the generous 3–12 launch band, measured within budget.
The hard chain is par 4–5 under a 2–6 band measured over **every winning
route, of any length** — the game accepts any chain that holds, and the
first hard calendar proved that counting only within-budget routes flatters
a day whose escapes are merely longer than par: `tjänst→slag` carried 5
in-band routes and 25 in all, and its route map gave the game away. The
design wants *many welds, few escapes* — the weld fabric stays dense, but
most of it must lead nowhere. The sweep scores that ratio directly
(`deception`: the share of valid welds on no winning route of any length),
and every chain is SALDO-lexicalized — the SFOL/SALDO A/B test is settled
in SALDO's favour.

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

## A compound inherits its head's word class

`hund→glas` shipped for several rounds with `mor` and `fin` both in the pool,
so a player could build `mor + fin` and be told **morfin** — morphine — was
correct. Nobody caught it by eye, including me.

Swedish compounds take the word class of their final element: noun + noun makes
a noun. When the string does not, it is usually not that compound at all but an
unrelated word the parts happen to spell.

```
mor + fin     = morfin        morphine
bank + ett    = bankett       a banquet
ton + sur     = tonsur        a tonsure
minne + svärd = minnesvärd    minnes+värd, memorable
skydd + svärd = skyddsvärd    skydds+värd, worth protecting
```

The rule can only judge welds where SALDO records both the head and the
witness — about 2,300 of the graph's 5,500 hub welds — and stays silent
otherwise. Within what it can see it removes 109, or 4.7%.

## The affix flags say what a word is

The hunspell `.dic` writes `word/FLAGS`, and the flags encode the inflection
paradigm. The reader used to throw them away. They are the only evidence
available for a word SALDO has never recorded — which is exactly the case that
matters, since SALDO covers about 40% of compounds:

```
sätt/ABDY          levnadssätt/ABDY     noun paradigm
poängsätt/AjOR     köra/HKLmMNO         verb paradigm
```

Which flags mean "verb" was measured, not guessed: against SALDO's own tags
over 6,957 verbs, 56,755 nouns and 15,759 adjectives, only **j** and **m** are
carried by a fifth or more of verbs and by no noun and no adjective at all. The
obvious wider set — N, P, M, K, L — leaks into adjectives and would have
condemned `sockersöt` and `tänkvärd`. The narrow rule drops 47 hub welds
(0.9%), every one a verb: *ondgöra*, *handhälsa*, *soltorka*, *kallröka*.

## The dictionary also lists words it wants rejected

The `.dic` is a speller's file, and a speller has to know about misspellings in
order to flag them. 1,534 of its entries carry `%`, which `sv_SE.aff` declares
as `FORBIDDENWORD`:

```
FORBIDDENWORD %

barock/ADXY        hårdrock/AD        the words
barrock/%          hårrock/%AD        the misspellings, listed to be refused
```

The reader kept both. Every rule up to here was about whether a *split* was
sound — whether the parts were really the parts — and none of them could fire,
because at the bottom of the stack the question "is this a word at all" was
being answered from a list that includes words that are not. Four of the first
five shipped days welded on one of these:

| day | weld | should be |
|---|---|---|
| `kärlek→person` | `ordnatt` | — |
| `fin→vakt` | `barvakt` | — |
| `grund→rum` | `ordnatt` | — |
| `konst→band` | `hårrock`, `barrock` | hårdrock, barock |

Three flags are now honoured, read from the affix file rather than guessed:

- **`%` FORBIDDENWORD** — listed so the speller can refuse it. Not a word.
- **`¤` NEEDAFFIX** — a stem that never appears unaffixed.
- **`Z` ONLYINCOMPOUND** — a compound-initial form: `abborr-`, `adoptiv-`,
  `affärsföreståndar-`. These are 2,545 entries of exactly the positional
  morphology listed under Known gaps as missing, and they are worth revisiting
  as a source of first elements — but a form that never stands alone can never
  be a chip, and can never be what a weld spells.

`!` NOSUGGEST is deliberately not among them. It marks 2,000 words a speller
should not *offer* as a correction — `ajvar`, `akutfas`, `ablution` — which are
rare, not wrong. `glasbåt`, queried twice in review as unexplained, is one of
these: real, and rare enough that nothing else vouched for it.

Usability is judged **per entry**, not over the union of a word's flags. Words
recur on several lines with different paradigms — `blind` is both `blind/XZ`,
the compound-initial form, and `blind/OPQk`, the ordinary adjective — and
unioning the flags would condemn every word that also has a compound form.

The curation check that catches a survivor now names the cause, because "is not
in the lexicon" and "is in the lexicon, as a word to reject" are different
facts and only the second means the graph found a real entry and misread it.

## A part must not double as a common verb stem

`kör` is a choir here — SALDO records exactly one sense — but the *string*
`kör-` is also the compound-initial form of `köra`, a lemma the lemma-only rule
excludes. So the chip silently inherited `körsätt`, `körskola`, `körprov`:
welds no player who knows the choir sense could predict.

The narrow fix fails. Requiring SALDO attestation for such welds cannot tell
`körlåt` (choir song, good) from `körskola` (driving school, bad), and costs
26% of the graph. What works is barring the part when its verb twin is
*productive*, measured by frequency:

```
köra    rank    551   ->  kör barred
mata    rank  3,720   ->  mat kept
natta   rank 25,021   ->  natt kept
orda    absent        ->  ord kept
```

At a cutoff of 2,000 this bars 55 of 764 parts. It is an approximation:
SALDO's *morphology* layer records each lemma's compound-initial form and would
settle it exactly. That is the fourth distinct defect pointing at the same
missing file.

## Evidence for a weld

`review` now prints SALDO's sense beside every weld on a solution path, and the
same data ships to the test panel as `public/glosses.json`. SALDO places each
sense against two neighbours, and for a compound those two are usually its own
analysis — which makes the pair read as a definition and, more usefully, as
evidence:

```
hundmat      mat, hund              holds up
djurskydd    skydd, djur            holds up
julbord      smörgåsbord, jul       holds up
värddjur     parasit                holds up
morfin       narkotika              nothing to do with mor or fin
skyddsvärd   värd, skydda           skydds+värd, not skydd+svärd
hårfin       obetydlig              not hair that is fine
bankett      måltid, högtidlig      not bank+ett
```

About 40% of welds have an entry. **No entry is not evidence against a weld** —
it only means SALDO is silent, which is the honest state for `glasbär` and the
rest of the long tail.

### A linking morpheme belongs to a noun

`riksdag` shipped as `rik + s + dag` — and a player caught it: riks- is the
combining form of **rike**, and rik, an adjective, merely happens to spell
it. The general rule has teeth now, in the graph and the lint both: a
foge-s or foge-e weld whose claimed first part is not a noun in SALDO is
refused, because linking morphemes join noun first-elements — kärlek-s-gud,
familj-e-far — and letters that line up otherwise belong to another lemma.
The gloss was the visible tell all along: SALDO reads riksdag as "besluta,
folk", nothing to do with either claimed part.

## What a pool is about

SALDO is an association lexicon, so its links say roughly what a word is for:
`kaffe → dryck → dricka`. Following them two steps and keeping the roots two or
more chips share gives a readable summary of a pool, printed by `review`:

```
slut→teori    about  sjunga, låta
jul→skydd     about  äta, leva, dryck
```

That measures the "reads as a pool" quality this document has been asking a
human to judge by eye, and it makes one thing checkable that was previously
invisible: **two consecutive days about the same thing read as a repeat.** It
caught `hund→glas` and `jul→skydd` sitting adjacent, both about food, and they
have been reordered apart.

**It does not detect tone**, which was the hope. The recurring injury pool —
`bett`, `ben`, `brott`, `skall` — has no shared centre at all, because its tone
comes from the compounds it *builds* (benbrott, skallbrott) and not from what
its parts individually mean. At depth 5 every pool converges on the same
primitives (`vem`, `ge`, `till`) and even the coherence signal is gone.

## Hand lists lose to SALDO, and the lint found three places they had not

`INFLECTED_FORMS`, `NUMERALS` and their kin are approximations of questions
SALDO answers properly. Three inconsistencies surfaced in a single curation
pass, each caught by the lint refusing to write:

- `dubbel` reached a pool because the `NUMERALS` ban had drifted into the
  SALDO-absent fallback branch during a refactor, and SALDO tags it as an
  adjective rather than a numeral. Editorial bans — colours, numerals, tone —
  now apply on both paths, because they are judgements about what belongs in
  the game rather than facts a lexicon can settle.
- `såg` and `band` were blocked as inflected forms. They are, but they are also
  a saw and a ribbon, and `sågverk` is a perfectly good compound. Where SALDO
  records a part as a noun or adjective lemma, it now overrides the hand list.

None of these would have been noticed by eye. All three were found because
`accept` re-lints its own picks and writes nothing when anything blocks.

## Known gaps

- **SALDO absence is not a quality score.** Only about 35% of any day's welds
  appear in SALDO, and that share barely varies between good days and bad, so
  it discriminates nothing on its own. The individual `weak` list is still
  worth reading; the percentage is not worth computing.
- **Positional forms are not modelled.** `broder-` is right initially
  (broderskärlek) and wrong finally (farbroder → farbror). SALDO's *morphology*
  layer has this; the semantic lexicon shipped here does not. The `.dic`'s 2,545
  ONLYINCOMPOUND entries are a partial substitute nobody has mined yet — they
  are compound-initial forms and nothing else.
- **A word can be real and still be the wrong parts.** `marketing` is an
  English loan the dictionary lists, and the splitter reads it as `mark` + *e* +
  `ting` — both real Swedish words, a linking morpheme that is genuinely
  productive, and a noun head, so every existing rule passes it. SALDO glosses
  it *marknadsföring*, which is the tell, but only to a human reading the gloss.
  Cut `djur→domare` by hand; not caught by any check.
- **Tone bans are a denylist**, so they only ever catch what has already been
  found once. `flyg→ställe` has now been rejected twice for the same injury
  pool and passes every metric both times. SALDO's association links were tried
  for this and do not work — see above. Tone remains the human's job, and the
  ledger's repeat-offender report is the only mechanism pushing back.
- **SFOL alone is one witness, and it is sometimes wrong.** `tomslag` sat on
  two winning routes of a shipped day with an ordinary SFOL entry and no
  other attestation anywhere — SALDO's only match is *grötomslag*, which
  merely contains the letters. 117 shipped welds currently rest on SFOL
  alone; the enormous majority are real (`sånglärare`, `medelvikt`), so the
  class cannot be purged wholesale. Confirmed fakes go into `GHOST_WORDS` in
  `lexicon.py`, each with its evidence; the in-game report button is the
  channel that finds them.
- **SALDO's gaps are false rejections in lexicalized mode.** `tidslinje` is
  in SFOL and SAOL and every Swede's mouth, and SALDO has never recorded it —
  so the lexicalized mode refused it in play, the exact trust-spending failure
  the mode was meant to prevent. Worse: the `egen→linje` day was only
  structurally valid *because* of the gap (with tidslinje real, egen→tid→linje
  is under par). Hand-attested words go into `LEXICALIZED_SUPPLEMENT`, the
  mirror of `GHOST_WORDS`; the day was replaced.
- **Route joins are not scored.** A player read `egen→linje`'s map as "one
  correct way forward" per link — and a join count over the suffix-merged
  route DAG confirms it: 2 joins, against 4 for same-scored days. Nodes where
  routes flow back together should join the sweep's scorer alongside
  cross-links; until then it is a curation-time check.
- **A concatenation can coincide with an unrelated word.** `skydd` + `svärd`
  spells *skyddsvärd*, which is real but parses as skydds+värd, "worthy of
  protection" — an adjective, not a compound of shield and sword. SALDO's POS
  tag on the witness would catch it (a noun+noun compound that is only ever an
  adjective is suspect); not yet implemented.
