"""Curation lint.

A human curation pass is mandatory before any day ships — endpoint taste, tone
and pool sanity are judgements this code cannot make. What it *can* do is stop
the reviewer wasting attention on failures the rules already describe, so the
human is left with the part that actually needs a human.

Errors block a day. Warnings are for the reviewer to overrule knowingly.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Iterable, Mapping, Sequence

from .graph import (
    COLORS,
    INFLECTED_FORMS,
    NON_HEAD_PARTS,
    NUMERALS,
    TONE_BAN,
    doublet_partner,
)
from .lexicon import Lexicon
from .split import CONNECTORS, PREFIX_SET, SUFFIX_STOP

MIN_POOL = 9
SOLUTION_BAND = range(3, 13)
#: The healthy density band measured in playtesting, over roughly twelve parts.
PAIR_BAND = range(20, 31)

#: Verb inflection tails, but only behind the foge-e link. "risk" + e + "rar"
#: spells riskerar, a conjugated verb rather than a compound — the kind of false
#: *acceptance* that teaches players the wrong rule, and it slipped into the
#: prototype's pool repeatedly.
#:
#: The link is what discriminates: plain "hund" + "ras" is hundras, a perfectly
#: good compound, because ras is a real noun. Flagging the tail alone would
#: condemn the innocent along with the guilty.
LINKED_VERB_TAILS = frozenset({"ras", "rar", "rat", "rad", "rade", "rats"})

#: -aren forms an agent noun from an infinitive (rädda -> räddaren). That is
#: derivation, not compounding.
AGENT_TAIL = "ren"


class Level(Enum):
    ERROR = "error"
    WARN = "warn"


@dataclass(frozen=True)
class Finding:
    level: Level
    day: str
    message: str

    def __str__(self) -> str:
        return f"{self.level.value:>5}  {self.day}  {self.message}"


DayLike = Mapping[str, object]


def _pool(day: DayLike) -> list[str]:
    return list(day.get("pool", []))  # type: ignore[arg-type]


def _pairs(day: DayLike) -> dict[str, str]:
    return dict(day.get("pairs", {}))  # type: ignore[arg-type]


def _label(day: DayLike) -> str:
    return f"{day.get('start')}→{day.get('target')}"


def _split_key(key: str) -> tuple[str, str]:
    a, _, b = key.partition(">")
    return a, b


def solutions_within_budget(day: DayLike) -> list[list[str]]:
    """Every winning chain, recomputed from the shipped pairs rather than trusted."""
    start, target = str(day["start"]), str(day["target"])
    budget = int(day["budget"])  # type: ignore[arg-type]
    pairs = _pairs(day)
    pool = [p for p in _pool(day) if p not in (start, target)]
    found: list[list[str]] = []

    def walk(part: str, chain: list[str]) -> None:
        if f"{part}>{target}" in pairs and len(chain) + 1 <= budget:
            found.append(list(chain))
        if len(chain) + 1 >= budget:
            return
        for nxt in pool:
            if nxt not in chain and f"{part}>{nxt}" in pairs:
                walk(nxt, [*chain, nxt])

    walk(start, [])
    return found


def check_day(day: DayLike, lex: Lexicon | None = None) -> list[Finding]:
    """Every rule that can be checked against a single day."""
    out: list[Finding] = []
    label = _label(day)
    start, target = str(day["start"]), str(day["target"])
    pool, pairs = _pool(day), _pairs(day)
    par, budget = int(day["par"]), int(day["budget"])  # type: ignore[arg-type]

    err = lambda m: out.append(Finding(Level.ERROR, label, m))  # noqa: E731
    warn = lambda m: out.append(Finding(Level.WARN, label, m))  # noqa: E731

    # ── shape ────────────────────────────────────────────────────
    if budget != par + 1:
        err(f"budget {budget} is not par {par} + 1")
    if len(pool) < MIN_POOL:
        err(f"pool has {len(pool)} parts, minimum is {MIN_POOL}")
    if len(set(pool)) != len(pool):
        err("pool contains a duplicate part")
    for endpoint in (start, target):
        if endpoint in pool:
            err(f"endpoint {endpoint!r} is also a pool chip")

    # ── the puzzle ───────────────────────────────────────────────
    if f"{start}>{target}" in pairs:
        err(f"{start}+{target} welds directly — there is no puzzle here")
    found = solutions_within_budget(day)
    if len(found) not in SOLUTION_BAND:
        err(
            f"{len(found)} solutions within budget, needs "
            f"{SOLUTION_BAND.start}-{SOLUTION_BAND.stop - 1}"
        )
    if found and min(len(s) for s in found) + 1 != par:
        shortest = min(len(s) for s in found) + 1
        warn(f"par is {par} but the shortest route is {shortest} links")
    if len(pairs) not in PAIR_BAND:
        warn(f"{len(pairs)} valid pairs, healthy band is {PAIR_BAND.start}-{PAIR_BAND.stop - 1}")

    # ── endpoint taste ───────────────────────────────────────────
    for role, endpoint in (("start", start), ("target", target)):
        if endpoint in PREFIX_SET:
            err(f"{role} {endpoint!r} is a prefix particle — flagged in playtesting")
        if endpoint in COLORS:
            err(f"{role} {endpoint!r} is a colour — a universal combiner")
        if endpoint in NUMERALS:
            err(f"{role} {endpoint!r} is a numeral — a universal combiner")
        if endpoint in TONE_BAN:
            err(f"{role} {endpoint!r} is off-tone for a general-audience daily")
        if endpoint in INFLECTED_FORMS:
            err(f"{role} {endpoint!r} is an inflected form, not a lemma")
        if endpoint in SUFFIX_STOP:
            warn(f"{role} {endpoint!r} is a derivational suffix")

    # ── pool sanity ──────────────────────────────────────────────
    for part in pool:
        if part in COLORS:
            err(f"pool part {part!r} is a colour — ambiguity without structure")
        if part in NUMERALS:
            err(f"pool part {part!r} is a numeral — numerals combine without limit")
        if part in TONE_BAN:
            err(f"pool part {part!r} is off-tone for a general-audience daily")
        if part in INFLECTED_FORMS:
            err(f"pool part {part!r} is an inflected form; parts are lemmas only")
        if part in NON_HEAD_PARTS:
            err(f"pool part {part!r} is never a compound head — a splitter artefact")

    everything = [*pool, start, target]
    for part in everything:
        partner = doublet_partner(part)
        if partner and partner in everything and part < partner:
            err(f"{part!r} and {partner!r} are register forms of one lexeme")

    # ── weld sanity ──────────────────────────────────────────────
    for key, witness in pairs.items():
        a, b = _split_key(key)
        forms = {a + b: "", **{a + c + b: c for c in CONNECTORS}}
        if witness not in forms:
            err(f"{a}+{b} is witnessed by {witness!r}, which is not the parts joined")
            continue
        link = forms[witness]
        if link == "e" and b in LINKED_VERB_TAILS:
            err(f"{witness!r} conjugates {a!r} — {a}+{b} is not a compound")
        elif b in NON_HEAD_PARTS:
            warn(f"{witness!r} ends in {b!r}, which is rarely a compound head")
        elif b == AGENT_TAIL and a.endswith("a"):
            warn(f"{witness!r} looks like an agent noun ({a} + -aren), not a compound")
        if lex is not None and witness not in lex.union:
            err(f"{witness!r} is not in the lexicon — a false acceptance")
        if link and len(a) < 3:
            warn(f"{witness!r} uses linking -{link}- on a very short part {a!r}")

    return out


def check_calendar(days: Sequence[DayLike], lex: Lexicon | None = None) -> list[Finding]:
    """Per-day rules plus the ones that only exist across a calendar."""
    out: list[Finding] = []
    for day in days:
        out += check_day(day, lex)

    def duplicates(values: Iterable[str]) -> set[str]:
        seen, dupes = set(), set()
        for v in values:
            (dupes if v in seen else seen).add(v)
        return dupes

    for start in sorted(duplicates(str(d["start"]) for d in days)):
        out.append(Finding(Level.ERROR, start, "start is reused across the calendar"))
    for target in sorted(duplicates(str(d["target"]) for d in days)):
        out.append(Finding(Level.ERROR, target, "target is reused across the calendar"))

    dates = [str(d.get("date", "")) for d in days if d.get("date")]
    for dupe in sorted(duplicates(dates)):
        out.append(Finding(Level.ERROR, dupe, "two days share a date"))
    if dates and dates != sorted(dates):
        out.append(Finding(Level.WARN, "calendar", "days are not in date order"))

    return out


def blocking(findings: Sequence[Finding]) -> list[Finding]:
    return [f for f in findings if f.level is Level.ERROR]
