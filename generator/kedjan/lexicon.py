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

    def obscurity(self, word: str) -> int:
        """Frequency rank, or UNRANKED for anything off the list."""
        return self.rank.get(word, UNRANKED)


def read_dic(path: Path | str) -> set[str]:
    """Read a hunspell .dic: a count on line one, then `word/FLAGS` per line."""
    words: set[str] = set()
    with open(path, encoding="utf-8") as fh:
        next(fh, None)  # the leading entry count
        for line in fh:
            word = line.strip().split("/")[0]
            if WORD_RE.fullmatch(word) and len(word) >= 3:
                words.add(word)
    return words


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
    dic_path: Path | str = "swedish.dic",
    wordlist_path: Path | str = "swe_wordlist",
    frequency_path: Path | str = "sv_50k.txt",
) -> Lexicon:
    words = read_dic(dic_path)
    union = words | read_plain(wordlist_path)
    rank, common = read_frequency(frequency_path)
    return Lexicon(
        words=frozenset(words),
        union=frozenset(union),
        rank=rank,
        common=frozenset(common),
    )
