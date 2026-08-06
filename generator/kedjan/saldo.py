"""Språkbanken SALDO — the lemma inventory that decides what may be a *part*.

SALDO and the hunspell list do different jobs, and the split matters:

  SALDO  decides what a part may be. It is lemma-only, part-of-speech tagged
         and modern, so `gör` is absent (only `göra`), `farbroder` is absent
         (only `farbror`), and pronouns, numerals and proper names are labelled
         rather than guessed at.
  SFOL   decides whether a compound exists. It is far broader — 250k stems
         against SALDO's 125k — and only about a third of a typical day's
         compounds appear in SALDO at all.

So SALDO gates the nodes and the hunspell union witnesses the edges. That is
also why the concatenation-lookup augmentation survives the migration: no
single lexicon has every compound.

SALDO 2.3, © 2015 Lars Borin, Markus Forsberg, Lennart Lönngren and
Språkbanken, University of Gothenburg. Released under Creative Commons
Attribution — attribution is required wherever the data reaches a user.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

#: Parts of speech a compound part may have. Nouns carry most of the weight;
#: adjectives are common first elements (finfolk, godnatt, starkvin) and
#: perfectly good final ones (färgstark).
PART_POS = frozenset({"nn", "av"})

#: Everything a part must never be. `pm` is a proper name, `nl` a numeral, and
#: the `-m` tags mark multiword expressions. Naming these is what lets the
#: hand-maintained closed-class and numeral lists retire.
BANNED_POS = frozenset(
    {"pm", "pmm", "nl", "pn", "pp", "sn", "kn", "in", "inm", "ab", "abm", "nna",
     "nnm", "vbm", "avm", "al", "ie", "pl"}
)

#: Column layout of saldo20v03.txt, which is tab-separated and commented with #.
_BASEFORM, _POS = 4, 5


@dataclass(frozen=True)
class Saldo:
    """baseform -> the set of parts of speech SALDO records for it."""

    pos: dict[str, frozenset[str]]

    def __contains__(self, word: str) -> bool:
        return word in self.pos

    def is_part_candidate(self, word: str) -> bool:
        """A lemma SALDO records as a noun or adjective, and nothing worse.

        A word carrying both a good and a banned reading is refused: `jag` is a
        noun (the self) as well as a pronoun, and a pool chip that reads as a
        pronoun to every player is a bad chip whatever the lexicon says.
        """
        tags = self.pos.get(word)
        if not tags:
            return False
        return bool(tags & PART_POS) and not (tags & BANNED_POS)


def load(path: Path | str = "saldo_2.3/saldo20v03.txt") -> Saldo:
    pos: dict[str, set[str]] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) <= _POS:
                continue
            pos.setdefault(cols[_BASEFORM], set()).add(cols[_POS])
    return Saldo(pos={w: frozenset(tags) for w, tags in pos.items()})


def load_if_present(path: Path | str = "saldo_2.3/saldo20v03.txt") -> Saldo | None:
    """SALDO is optional: without it the pipeline falls back to the hand-built
    filters, which are strictly worse but keep the generator runnable."""
    return load(path) if Path(path).exists() else None
