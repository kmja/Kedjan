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
    DEGREE_PREFIXES,
    INFLECTED_FORMS,
    NON_HEAD_PARTS,
    NUMERALS,
    TONE_BAN,
    doublet_partner,
    has_common_verb_twin,
    head_pos_consistent,
)
from .analysis import report as analyse
from .days import EASY_PAR, solution_band
from .lexicon import Lexicon
from .saldo import Saldo
from .split import CONNECTORS, PREFIX_SET, SUFFIX_STOP

MIN_POOL = 9
#: The healthy density band measured in playtesting, over roughly twelve parts.
PAIR_BAND = range(20, 31)
#: Choice at both ends of the chain, and at every step between.
MIN_OPENINGS = 3
MIN_CLOSINGS = 2
MIN_BRANCHING = 2
#: Mirrors days.py — the floor scales with par because routes consume pool.
MIN_DISJOINT_BY_PAR = {3: 3}
MIN_DISJOINT_FALLBACK = 2
#: Each independent route must reach this many chips outside itself, or it is
#: an island a player can find by elimination rather than deduction.
MIN_ROUTE_CROSS_LINKS = 2
#: Chips welding to nothing beyond their own route are tells. One is a mild
#: one and common — fifteen of twenty candidates carry it — but two or more
#: start to partition the pool into visible groups, which is the failure this
#: guards against: notice that hund, ben and böj join nothing else and
#: elimination hands you the answer.
MAX_ISOLATED_CHIPS = 1

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


def check_day(
    day: DayLike, lex: Lexicon | None = None, saldo: Saldo | None = None
) -> list[Finding]:
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
    band = solution_band(par)
    if len(found) not in band:
        err(
            f"{len(found)} solutions within budget, needs "
            f"{band.start}-{band.stop - 1} at par {par}"
        )
    # Par names the shortest route. A day whose best line is longer than par
    # is mislabelled, and no player can ever make par on it.
    if found and min(len(s) for s in found) + 1 != par:
        shortest = min(len(s) for s in found) + 1
        err(f"par is {par} but the shortest route is {shortest} links")

    r = analyse(day, saldo)
    if len(r.openings) < MIN_OPENINGS:
        err(
            f"{len(r.openings)} chip(s) weld to the start — move one is not a choice"
        )
    if len(r.closings) < MIN_CLOSINGS:
        err(
            f"{len(r.closings)} chip(s) weld into the target — the last move is not a choice"
        )
    if r.branching and r.min_branching < MIN_BRANCHING:
        err(f"branching {r.branching} — the route has a step with no alternative")
    floor = MIN_DISJOINT_BY_PAR.get(par, MIN_DISJOINT_FALLBACK)
    if r.disjoint_routes < floor:
        err(
            f"{len(r.solutions)} solutions but only {r.disjoint_routes} independent "
            f"(par {par} needs {floor}) — the rest are one route with variations"
        )
    if len(r.isolated_chips) > MAX_ISOLATED_CHIPS:
        err(
            f"{', '.join(r.isolated_chips)} weld to nothing outside their own "
            "routes — the pool falls into visible groups"
        )
    elif r.isolated_chips:
        warn(f"{r.isolated_chips[0]} welds only within its own route")
    if r.route_cross_links and r.min_cross_links < MIN_ROUTE_CROSS_LINKS:
        err(
            f"an independent route reaches only {r.min_cross_links} chip(s) outside "
            f"itself (cross-links {r.route_cross_links}) — it is an island"
        )
    if r.bottlenecks:
        warn(f"every solution passes through {', '.join(r.bottlenecks)}")
    if r.weak_welds:
        warn(f"not in SALDO, on a solution path: {', '.join(r.weak_welds[:6])}")
    if len(pairs) not in PAIR_BAND:
        warn(f"{len(pairs)} valid pairs, healthy band is {PAIR_BAND.start}-{PAIR_BAND.stop - 1}")

    # Two families of check below need SALDO's lemma inventory to be right.
    # Without it they fall back to hand-built lists that are known to be wrong
    # in places — `såg` is a saw as well as the past tense of se, `band` a
    # ribbon as well as the preterite of binda, `lång` an adjective long before
    # it is the stem of the fish-verb långa. They still run and still report,
    # but they must not *block*: CI has no SALDO, and a red build that is
    # wrong teaches you to stop reading it.
    lemma_fail = err if saldo is not None else warn
    unverified = "" if saldo is not None else " — hand list, no SALDO to check it against"

    # ── endpoint taste ───────────────────────────────────────────
    for role, endpoint in (("start", start), ("target", target)):
        if endpoint in PREFIX_SET:
            err(f"{role} {endpoint!r} is a prefix particle — flagged in playtesting")
        if endpoint in COLORS:
            err(f"{role} {endpoint!r} is a colour — a universal combiner")
        if endpoint in DEGREE_PREFIXES:
            err(f"{role} {endpoint!r} is a degree prefix — a universal combiner")
        if endpoint in NUMERALS:
            err(f"{role} {endpoint!r} is a numeral — a universal combiner")
        if endpoint in TONE_BAN:
            err(f"{role} {endpoint!r} is off-tone for a general-audience daily")
        if endpoint in INFLECTED_FORMS and not (saldo and saldo.is_part_candidate(endpoint)):
            lemma_fail(f"{role} {endpoint!r} is an inflected form, not a lemma{unverified}")
        if endpoint in SUFFIX_STOP:
            warn(f"{role} {endpoint!r} is a derivational suffix")

    # ── pool sanity ──────────────────────────────────────────────
    for part in [*pool, start, target]:
        if lex is not None and has_common_verb_twin(part, lex, saldo):
            lemma_fail(
                f"{part!r} is also the stem of the common verb {part}a — it "
                f"inherits welds from a lemma that is not in the game{unverified}"
            )

    for part in pool:
        if part in COLORS:
            err(f"pool part {part!r} is a colour — ambiguity without structure")
        if part in NUMERALS:
            err(f"pool part {part!r} is a numeral — numerals combine without limit")
        if part in TONE_BAN:
            err(f"pool part {part!r} is off-tone for a general-audience daily")
        # INFLECTED_FORMS is a hand-built approximation of "is this an
        # inflection". SALDO answers it properly, and knows that `såg` is a saw
        # as well as the past tense of se — so where SALDO can judge, it wins.
        if part in INFLECTED_FORMS and not (saldo and saldo.is_part_candidate(part)):
            lemma_fail(
                f"pool part {part!r} is an inflected form; parts are lemmas only{unverified}"
            )
        if part in DEGREE_PREFIXES:
            err(f"pool part {part!r} is a degree prefix — it modifies any adjective")
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
        # A linking morpheme joins noun first-elements. When the claimed
        # first part is no noun, the letters belong to another lemma:
        # riksdag is rike + dag, and rik — an adjective — merely happens to
        # spell the combining form riks-. Player-reported, not hypothetical.
        if (
            link
            and saldo is not None
            and a in saldo.pos
            and "nn" not in saldo.pos[a]
        ):
            err(
                f"{witness!r} is not {a} + -{link}- + {b}: {a!r} is not a noun, "
                f"so the linking -{link}- belongs to another lemma"
            )
        elif b in NON_HEAD_PARTS:
            warn(f"{witness!r} ends in {b!r}, which is rarely a compound head")
        elif b == AGENT_TAIL and a.endswith("a"):
            warn(f"{witness!r} looks like an agent noun ({a} + -aren), not a compound")
        if saldo is not None and not head_pos_consistent(b, witness, saldo):
            err(
                f"{witness!r} is not a {b!r} — it does not take its head's word "
                "class, so it is a different word the parts happen to spell"
            )
        if lex is not None and witness in lex.verb_forms:
            err(
                f"{witness!r} is a verb form, not a compound — the base form is "
                f"{witness}a, so this is not {a}+{b}"
            )
        if lex is not None and witness in lex.forbidden:
            err(
                f"{witness!r} is in the dictionary only as a word the speller "
                "must refuse or never offer — a misspelling, a form that does "
                "not stand alone, or the tier SFOL keeps profanity in"
            )
        elif lex is not None and witness not in lex.union:
            err(f"{witness!r} is not in the lexicon — a false acceptance")
        if link and len(a) < 3:
            warn(f"{witness!r} uses linking -{link}- on a very short part {a!r}")

    return out


def check_calendar(
    days: Sequence[DayLike], lex: Lexicon | None = None, saldo: Saldo | None = None
) -> list[Finding]:
    """Per-day rules plus the ones that only exist across a calendar."""
    out: list[Finding] = []
    for day in days:
        out += check_day(day, lex, saldo)

    def duplicates(values: Iterable[str]) -> set[str]:
        seen, dupes = set(), set()
        for v in values:
            (dupes if v in seen else seen).add(v)
        return dupes

    for start in sorted(duplicates(str(d["start"]) for d in days)):
        out.append(Finding(Level.ERROR, start, "start is reused across the calendar"))
    for target in sorted(duplicates(str(d["target"]) for d in days)):
        out.append(Finding(Level.ERROR, target, "target is reused across the calendar"))

    if saldo is not None:
        centres = [(str(d["start"]), saldo.centre(list(d.get("pool", [])))[:2]) for d in days]
        for (a, ca), (b, cb) in zip(centres, centres[1:]):
            shared = set(ca) & set(cb)
            if shared:
                out.append(
                    Finding(
                        Level.WARN,
                        f"{a}/{b}",
                        f"consecutive days both about {', '.join(sorted(shared))}",
                    )
                )

    # A date carries one chain per tier — an easy par-3 and a hard par-4/5.
    slots = [
        f"{d.get('date')} {'easy' if int(d['par']) <= EASY_PAR else 'hard'}"  # type: ignore[arg-type]
        for d in days
        if d.get("date")
    ]
    for dupe in sorted(duplicates(slots)):
        out.append(Finding(Level.ERROR, dupe, "two chains share a date and a tier"))
    dates = [str(d.get("date", "")) for d in days if d.get("date")]
    if dates and dates != sorted(dates):
        out.append(Finding(Level.WARN, "calendar", "days are not in date order"))

    return out


def check_svenska(
    days: Sequence[DayLike], verdicts: Mapping[str, Mapping[str, bool]]
) -> list[Finding]:
    """Apply svenska.se's verdicts to every shipped weld.

    The weld links point at svenska.se, and SO is the dictionary that makes
    them worth tapping — it has the definitions. A weld the site lacks
    entirely is a broken promise and blocks; a weld only SAOL carries keeps
    the link alive but shows no meaning, which a reviewer may accept
    knowingly; a weld nobody has asked about yet is only a warning, so a
    calendar can be linted before the check has run.
    """
    out: list[Finding] = []
    for day in days:
        label = _label(day)
        for word in sorted(set(_pairs(day).values())):
            verdict = verdicts.get(word)
            if verdict is None:
                out.append(
                    Finding(Level.WARN, label, f"{word} is unverified against svenska.se")
                )
            elif not verdict.get("so") and not verdict.get("saol"):
                out.append(
                    Finding(
                        Level.ERROR,
                        label,
                        f"{word} has no svenska.se entry — the weld link breaks",
                    )
                )
            elif not verdict.get("so"):
                out.append(
                    Finding(
                        Level.WARN,
                        label,
                        f"{word} is in SAOL but not SO — the link shows no definition",
                    )
                )
    return out


def blocking(findings: Sequence[Finding]) -> list[Finding]:
    return [f for f in findings if f.level is Level.ERROR]
