"""The part graph: which parts weld to which, and what word proves it."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .lexicon import Lexicon
from .split import CONNECTORS

#: Surface forms that are inflections rather than lemmas. The prototype's
#: hand-list; SALDO replaces it. Parts are lemmas only — lägga, never lagt.
INFLECTED_FORMS = frozenset(
    {
        "lagt", "lagd", "lagda", "gjort", "gjord", "gjorda", "sagt", "sagd",
        "gått", "stått", "fått", "sett", "sedd", "tagit", "tagen", "gett",
        "givit", "given", "kommit", "kommen", "blivit", "varit", "hållit",
        "hållen", "skrivit", "skriven", "slagit", "slagen", "dragit", "dragen",
        "burit", "skjutit", "brutit", "vunnit", "funnit", "bundit", "läst",
        "lästa", "byggt", "kört", "köpt", "sålt", "valt", "levt", "hört",
        "rört", "känt", "satt", "lade", "gjorde", "sade", "gick", "blev",
        "höll", "skrev", "slog", "drog", "sköt", "bröt", "vann", "fann",
        "band", "satte", "köpte", "sålde", "valde", "levde", "hörde", "rörde",
        "kände", "byggde", "körde", "läste", "tog", "fick", "såg", "gav",
        "stod", "kom", "föll", "ställde", "ställt",
    }
)

#: Universal combiners. Blå welds to 93 other parts — a decoy that fits
#: everywhere adds ambiguity without structure, so colours are banned outright.
COLORS = frozenset({"blå", "grön", "gul", "röd", "vit", "svart", "brun", "grå", "rosa", "lila", "orange"})

#: Irregular plurals that slip past the suffix-based inflection test.
PLURAL_BAN = frozenset({"söner", "män", "fötter", "händer", "böcker"})

#: Hub selection. Too few welds and a part is useless; too many and it is a
#: universal combiner.
MIN_DEGREE, MAX_DEGREE = 6, 50
MAX_HUB_OBSCURITY = 5_000
HUB_LENGTH = range(3, 7)


@dataclass
class PartGraph:
    """Directed part -> part edges, each witnessed by a real compound."""

    #: (a, b) -> the compound that proves a welds to b.
    pairs: dict[tuple[str, str], str]
    #: The curated node set days are built from.
    hubs: frozenset[str]
    #: hub -> hubs it welds to, the graph day generation actually walks.
    adjacency: dict[str, set[str]]

    def degree(self, part: str) -> int:
        return len(self.adjacency.get(part, ()))

    def welds(self, a: str, b: str) -> bool:
        return (a, b) in self.pairs


def is_inflected_part(part: str, known_parts: frozenset[str]) -> bool:
    """A part that is an inflection of another part is not a lemma."""
    if part in INFLECTED_FORMS:
        return True
    return any(
        part.endswith(suffix) and part[:-2] + "a" in known_parts
        for suffix in ("er", "ar", "de")
    )


def witnessed_pairs(compounds: dict[str, list[str]], lex: Lexicon) -> dict[tuple[str, str], str]:
    """Pairs drawn from two-part compounds, each witnessed by its commonest word."""
    pairs: dict[tuple[str, str], str] = {}
    for word, split in compounds.items():
        if len(split) != 2:
            continue
        key = (split[0], split[1])
        if key not in pairs or lex.obscurity(word) < lex.obscurity(pairs[key]):
            pairs[key] = word
    return pairs


def select_hubs(pairs: dict[tuple[str, str], str], lex: Lexicon) -> frozenset[str]:
    """Simple, common, well-connected, lemma-only, no colours."""
    degree: dict[str, int] = defaultdict(int)
    for a, b in pairs:
        degree[a] += 1
        degree[b] += 1
    known = frozenset(degree)

    return frozenset(
        part
        for part, deg in degree.items()
        if MIN_DEGREE <= deg <= MAX_DEGREE
        and lex.obscurity(part) < MAX_HUB_OBSCURITY
        and len(part) in HUB_LENGTH
        and part not in COLORS
        and part not in PLURAL_BAN
        and not is_inflected_part(part, known)
    )


def augment_by_lookup(
    pairs: dict[tuple[str, str], str], hubs: frozenset[str], lex: Lexicon
) -> int:
    """Recover pairs the splitter missed by asking the lexicon directly.

    For every hub pair, test a+b and the linking-morpheme variants against the
    union lexicon. In the reference run this recovered 1,876 pairs that DSSO's
    split graph did not produce. Keep this step even after SALDO — no single
    lexicon has every compound.
    """
    recovered = 0
    for a in hubs:
        for b in hubs:
            if a == b or (a, b) in pairs:
                continue
            for candidate in (a + b, *(a + c + b for c in CONNECTORS)):
                if len(candidate) >= 7 and candidate in lex.union:
                    pairs[(a, b)] = candidate
                    recovered += 1
                    break
    return recovered


def build(compounds: dict[str, list[str]], lex: Lexicon) -> PartGraph:
    pairs = witnessed_pairs(compounds, lex)
    hubs = select_hubs(pairs, lex)
    augment_by_lookup(pairs, hubs, lex)

    adjacency: dict[str, set[str]] = defaultdict(set)
    for a, b in pairs:
        if a in hubs and b in hubs:
            adjacency[a].add(b)
    return PartGraph(pairs=pairs, hubs=hubs, adjacency=dict(adjacency))
