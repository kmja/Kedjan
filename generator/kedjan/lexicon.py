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

    def obscurity(self, word: str) -> int:
        """Frequency rank, or UNRANKED for anything off the list."""
        return self.rank.get(word, UNRANKED)


#: Affix flags that only ever appear on verbs. Derived, not guessed: measured
#: against SALDO's own part-of-speech tags over 6,957 verbs, 56,755 nouns and
#: 15,759 adjectives, these two are the only flags carried by a fifth or more
#: of verbs and by no noun and no adjective at all. The obvious wider set —
#: N, P, M, K, L — leaks into adjectives and would condemn sockersöt.
VERB_ONLY_FLAGS = frozenset("jm")


def read_dic(path: Path | str) -> tuple[set[str], set[str]]:
    """Read a hunspell .dic into (words, verb forms).

    The line format is `word/FLAGS`, and the flags are worth keeping: they
    encode the inflection paradigm, which is the only evidence available for a
    word SALDO has never recorded.
    """
    words: set[str] = set()
    verbs: set[str] = set()
    with open(path, encoding="utf-8") as fh:
        next(fh, None)  # the leading entry count
        for line in fh:
            word, _, flags = line.strip().partition("/")
            if WORD_RE.fullmatch(word) and len(word) >= 3:
                words.add(word)
                if VERB_ONLY_FLAGS & set(flags):
                    verbs.add(word)
    return words, verbs


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
    words, verb_forms = read_dic(dic_path)
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
    )
