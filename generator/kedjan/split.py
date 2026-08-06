"""Recursive-minimal compound splitting.

Every rule here is a heuristic standing in for morphology the pipeline does not
have. They are documented as such because the intended production replacement
is SALDO, which knows the answers these rules guess at.
"""

from __future__ import annotations

from functools import lru_cache

from .lexicon import Lexicon

#: Derivational endings. A compound must not end in one — "verksamhet" is
#: verksam + -het, a suffix, not a part the player could ever weld onward.
SUFFIX_STOP = frozenset(
    {
        "het", "era", "rad", "dig", "gen", "lig", "isk", "tet", "else", "ande",
        "ende", "ning", "are", "bar", "sam", "dom", "vis", "full",
    }
)

#: Particles and prefixes. A compound starting with one is a prefixed verb or
#: noun, not a two-part compound — and a particle makes a poor endpoint besides.
PREFIX_SET = frozenset(
    {
        "till", "upp", "åter", "inne", "utom", "van", "miss", "för", "und",
        "ned", "sam", "man", "gen", "när", "från", "mot", "före", "efter",
        "under", "över", "ute", "hem", "bort", "fram", "runt", "kring", "med",
        "själv", "in", "ur", "av", "an",
    }
)

#: Swedish linking morphemes (fogemorfem): kärlek-s-gud, familj-e-far.
CONNECTORS = ("s", "e")

#: Noun inflections. A part must be a lemma, so inflected surface forms are
#: rejected outright: lägga, never lagt or lägger.
INFLECTIONS = ("erna", "arna", "orna", "er", "ar", "or", "en", "et", "na")

MIN_PART = 3


def part_ok(lex: Lexicon, part: str) -> bool:
    """A usable part: a real word, and either common or long enough to be safe."""
    return part in lex.words and (part in lex.common or len(part) >= 4)


def looks_inflected(lex: Lexicon, word: str) -> bool:
    """True if the word is a plainly inflected form of a shorter word."""
    return any(
        word.endswith(suffix)
        and len(word[: -len(suffix)]) >= 4
        and word[: -len(suffix)] in lex.words
        for suffix in INFLECTIONS
    )


def min_split(lex: Lexicon, word: str) -> list[str] | None:
    """Split into the fewest legal parts, or None if it does not split.

    A word is never its own single part, every part is at least three letters,
    and the final part may not be a derivational suffix.
    """
    n = len(word)

    @lru_cache(maxsize=None)
    def best_from(i: int) -> tuple[str, ...] | None:
        if i == n:
            return ()
        best: tuple[str, ...] | None = None
        for j in range(i + MIN_PART, n + 1):
            if i == 0 and j == n:
                continue  # the whole word is not a split of itself
            part = word[i:j]
            if not part_ok(lex, part):
                continue
            if j == n and part in SUFFIX_STOP:
                continue

            rest = best_from(j)
            if rest is not None and (best is None or 1 + len(rest) < len(best)):
                best = (part, *rest)

            # ...or the same part followed by a linking morpheme.
            if j < n and word[j] in CONNECTORS:
                rest = best_from(j + 1)
                if rest and (best is None or 1 + len(rest) < len(best)):
                    best = (part, *rest)
        return best

    split = best_from(0)
    best_from.cache_clear()
    return list(split) if split and len(split) >= 2 else None


def compounds(lex: Lexicon) -> dict[str, list[str]]:
    """Every word in the lexicon that splits into legal parts."""
    found: dict[str, list[str]] = {}
    for word in lex.words:
        if len(word) < 6 or looks_inflected(lex, word):
            continue
        split = min_split(lex, word)
        if (
            split
            and all(len(p) >= MIN_PART for p in split)
            and split[0] not in PREFIX_SET
            and split[-1] not in SUFFIX_STOP
        ):
            found[word] = split
    return found
