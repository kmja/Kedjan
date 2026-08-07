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

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence

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
_PRIMARY, _BASEFORM, _POS = 1, 4, 5

#: How far to walk the association links when asking what a pool is about.
#: Measured: at depth 5 every pool converges on the same handful of primitives
#: (vem, ge, till) and the signal is gone; at 2 the music pools come back as
#: `sjunga` and the food pools as `äta`/`dricka`.
CENTRE_DEPTH = 2


@dataclass(frozen=True)
class Saldo:
    """baseform -> parts of speech, plus the association links between senses."""

    pos: dict[str, frozenset[str]]
    #: baseform -> the semantically "primary" neighbour SALDO associates it
    #: with. SALDO is an association lexicon, so following these links upward
    #: says roughly what a word is about: kaffe -> dryck, lunch -> måltid.
    primary: dict[str, str] = field(default_factory=dict)

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


    def ancestors(self, word: str, depth: int = CENTRE_DEPTH) -> list[str]:
        """The association links above a word, nearest first."""
        out: list[str] = []
        seen = {word}
        current = word
        for _ in range(depth):
            nxt = self.primary.get(current)
            if not nxt or nxt in seen:
                break
            out.append(nxt)
            seen.add(nxt)
            current = nxt
        return out

    def centre(self, words: Sequence[str], depth: int = CENTRE_DEPTH) -> list[str]:
        """What a pool is about: association roots two or more chips share.

        This measures *coherence* — the "reads as a pool" quality — and not
        tone. A pool that produces benbrott and skallbrott has no shared centre
        at all, because its tone comes from the compounds it builds rather than
        from what the parts individually mean.
        """
        hits: Counter[str] = Counter()
        for word in words:
            hits.update(set(self.ancestors(word, depth)))
        return [root for root, n in hits.most_common() if n >= 2]


def load(path: Path | str = "saldo_2.3/saldo20v03.txt") -> Saldo:
    pos: dict[str, set[str]] = {}
    primary: dict[str, str] = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("#") or not line.strip():
                continue
            cols = line.rstrip("\n").split("\t")
            if len(cols) <= _POS:
                continue
            base = cols[_BASEFORM]
            pos.setdefault(base, set()).add(cols[_POS])
            root = cols[_PRIMARY].split("..")[0]
            if base not in primary and root not in ("PRIM", base):
                primary[base] = root
    return Saldo(
        pos={w: frozenset(tags) for w, tags in pos.items()},
        primary=primary,
    )


def load_if_present(path: Path | str = "saldo_2.3/saldo20v03.txt") -> Saldo | None:
    """SALDO is optional: without it the pipeline falls back to the hand-built
    filters, which are strictly worse but keep the generator runnable."""
    return load(path) if Path(path).exists() else None
