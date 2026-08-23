"""Corpus loading.

The reference pipeline reads three files:

  swedish.dic   DSSO hunspell word list (affix flags stripped)
  swe_wordlist  a larger open Swedish word list, one word per line
  sv_50k.txt    hermitdave/FrequencyWords for Swedish, "word count" per line

Splitting and the pair graph run against the DSSO set; the union of both lists
backs the concatenation-lookup augmentation, which only ever asks "is this
string a word", never "how does it split".

PRODUCTION NOTE: requirement one is migrating the part graph to Språkbanken
SALDO (CC BY 4.0, attribution required) for lemma-based nodes and real linking
morphology. Keep the augmentation even then — no single lexicon has every
compound. Verify the DSSO licence if it stays in the mix.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

WORD_RE = re.compile(r"[a-zåäö]+")

#: Words outside the top of the frequency list are treated as equally obscure.
UNRANKED = 10**6


@dataclass(frozen=True)
class Lexicon:
    """Everything the pipeline knows about Swedish."""

    #: The split-quality word list. Parts must come from here.
    words: frozenset[str]
    #: words plus every other open list — used only for "does this string exist".
    union: frozenset[str]
    #: word -> rank in the frequency list. Lower is commoner.
    rank: dict[str, int] = field(default_factory=dict)
    #: The commonest slice, used to let short but everyday parts through.
    common: frozenset[str] = frozenset()
    #: Words whose hunspell entry carries a verb-only affix flag. The flags
    #: encode the paradigm, so they say what a word *is* even when SALDO has
    #: never heard of it — which is how `poängsätt` is caught: it is the stem
    #: of the verb poängsätta, not a compound whose head is the noun `sätt`.
    verb_forms: frozenset[str] = frozenset()
    #: Words the dictionary lists only so a speller can reject them, or only as
    #: a compound-initial form. Kept so a curation finding can say which it is:
    #: "barrock is listed as a misspelling" is a different fact from "barrock
    #: is absent", and only the first tells you the graph found a real entry.
    forbidden: frozenset[str] = frozenset()

    def obscurity(self, word: str) -> int:
        """Frequency rank, or UNRANKED for anything off the list."""
        return self.rank.get(word, UNRANKED)


#: Affix flags that only ever appear on verbs. Derived, not guessed: measured
#: against SALDO's own part-of-speech tags over 6,957 verbs, 56,755 nouns and
#: 15,759 adjectives, these two are the only flags carried by a fifth or more
#: of verbs and by no noun and no adjective at all. The obvious wider set —
#: N, P, M, K, L — leaks into adjectives and would condemn sockersöt.
VERB_ONLY_FLAGS = frozenset("jm")

#: Flags that mean "this entry is not a word you may use on its own", read from
#: sv_SE.aff rather than guessed:
#:
#:   %  FORBIDDENWORD   listed so the speller can *reject* it. 1,534 entries,
#:                      and they are ordinary misspellings — barrock for
#:                      barock, hårrock for hårdrock, barndomsbyggd for
#:                      barndomsbygd. Reading the .dic without this flag is how
#:                      four of the first five shipped days came to contain a
#:                      weld that is not a Swedish word.
#:   ¤  NEEDAFFIX       a stem that never stands alone unaffixed.
#:   Z  ONLYINCOMPOUND  a compound-initial form: abborr-, affärsföreståndar-.
#:                      Real morphology, and the closest thing to the SALDO
#:                      morphology layer we cannot reach — but never a word by
#:                      itself, so never a chip and never a weld's result.
#:
#:   !  NOSUGGEST       a word the speller must recognise but must never
#:                      *offer*. In SFOL that is overwhelmingly profanity and
#:                      slurs: of its 2,000 entries, 50 sit inside the common
#:                      20k frequency slice that part selection draws from, and
#:                      they include neger, nigger, bögjävel, kuksugare, hora,
#:                      fitta. The rest of the tier is unreliable in a quieter
#:                      way — glasbåt and finbord are NOSUGGEST entries that no
#:                      Swedish speaker asked about them recognised, and
#:                      nothing else in the corpora vouches for either.
#:
#: NOSUGGEST was read as "rare, not wrong" on the strength of its first few
#: alphabetical entries — ablution, ajvar, akutfas. That was a sampling error:
#: the a's are the innocuous end of the list. Excluding the tier costs real
#: words (favela, shot) and is still the right trade, because TONE_BAN is a
#: hand-built denylist of 33 words that only ever catches what has already been
#: found once, and this is the same judgement made by lexicographers, in
#: machine-readable form.
UNUSABLE_FLAGS = frozenset("%¤Z!")

#: Words our corpora carry that svenska.se — SAOL, SO and SAOB together —
#: does not. The academy dictionaries are the player-facing authority: every
#: weld word in the app links straight to them, and a link that lands on
#: "Inga träffar" spends trust whatever our own files say. Each of these was
#: caught in play by a player who followed the link, and every addition names
#: its evidence here.
#:
#:   tomslag    an SFOL-only scanno: no SALDO, no frequency, no academy hit
#:              (checked 2026-08-09). SALDO's only match is grötomslag —
#:              gröt+omslag, a different word containing the letters.
#:   tryckord   real but technical — SALDO has it as a prosody term, glossed
#:              betoning — and absent from all of SAOL/SO/SAOB (checked
#:              2026-08-09 in play). Two corpora vouch; the authority the
#:              player is shown does not, so it goes.
#:   rocksjäl   SFOL-only (rock+själ/ADG), no SALDO entry, not on svenska.se
#:              (checked 2026-08-23 in play) — the same single-witness
#:              failure as tomslag, just with a more plausible-looking
#:              compound.
GHOST_WORDS = frozenset({"tomslag", "tryckord", "rocksjäl"})

#: The mirror of GHOST_WORDS, for the lexicalized mode: compounds a player
#: attested against SAOL that SALDO has simply never recorded. SALDO is a
#: lemma lexicon with gaps, and each of these is a false rejection caught in
#: play — the game's stated top quality metric. Every addition names its
#: evidence.
#:
#:   tidslinje   caught in play 2026-08-09; in SFOL and SAOL, absent from SALDO
LEXICALIZED_SUPPLEMENT = frozenset({"tidslinje"})


def read_dic(path: Path | str) -> tuple[set[str], set[str], set[str]]:
    """Read a hunspell .dic into (words, verb forms, unusable entries).

    The line format is `word/FLAGS`, and the flags are worth keeping: they
    encode the inflection paradigm, which is the only evidence available for a
    word SALDO has never recorded.

    A word may appear on several lines with different flags — `blind` is both
    a compound-initial form and an ordinary adjective — so usability is judged
    per entry and a word is kept if *any* entry stands alone.
    """
    words: set[str] = set()
    unusable: set[str] = set()
    verbs: set[str] = set()
    with open(path, encoding="utf-8") as fh:
        next(fh, None)  # the leading entry count
        for line in fh:
            word, _, flags = line.strip().partition("/")
            if not (WORD_RE.fullmatch(word) and len(word) >= 3):
                continue
            if word in GHOST_WORDS or UNUSABLE_FLAGS & set(flags):
                unusable.add(word)
                continue
            words.add(word)
            if VERB_ONLY_FLAGS & set(flags):
                verbs.add(word)
    # A word with both a plain entry and an unusable one — blind is an ordinary
    # adjective as well as a compound-initial form — is a word.
    return words, verbs, unusable - words


def read_plain(path: Path | str) -> set[str]:
    """Read a plain one-word-per-line list."""
    with open(path, encoding="utf-8") as fh:
        return {w for w in (line.strip().lower() for line in fh) if WORD_RE.fullmatch(w)}


def read_frequency(path: Path | str, common_size: int = 20_000) -> tuple[dict[str, int], set[str]]:
    """Read `word count` lines into a rank map plus the commonest slice."""
    order: list[str] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            parts = line.split()
            if parts:
                order.append(parts[0])
    return {w: i for i, w in enumerate(order)}, set(order[:common_size])


def load(
    dic_path: Path | str = "sv_SE.dic",
    wordlist_path: Path | str | None = None,
    frequency_path: Path | str = "sv_50k.txt",
) -> Lexicon:
    """Load the corpora. The supplementary word list is optional — the union
    simply collapses to the hunspell set when it is absent."""
    words, verb_forms, forbidden = read_dic(dic_path)
    union = set(words)
    if wordlist_path and Path(wordlist_path).exists():
        union |= read_plain(wordlist_path)
    rank, common = read_frequency(frequency_path)
    return Lexicon(
        words=frozenset(words),
        union=frozenset(union),
        rank=rank,
        common=frozenset(common),
        verb_forms=frozenset(verb_forms),
        forbidden=frozenset(forbidden),
    )
