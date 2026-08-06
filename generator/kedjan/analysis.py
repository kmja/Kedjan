"""Day analysis: the numbers a curator actually needs to see.

Every metric here was a judgement made by hand during curation before it was a
function. "Only one chip welds to the start" killed two prototype days before
`openings` existed; "par says 4 but the shortest route is 5" killed a third.
Measuring them is what stops the same call being re-made from memory each
round, and inconsistently.

Nothing here decides anything. `days.py` turns some of it into hard
requirements and `curate.py` turns some into findings; the rest is for the
human, who still has the last word on taste and tone.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import combinations
from typing import Mapping, Sequence

from .saldo import Saldo

DayLike = Mapping[str, object]


def _pool(day: DayLike) -> list[str]:
    start, target = str(day["start"]), str(day["target"])
    return [p for p in day.get("pool", []) if p not in (start, target)]  # type: ignore[union-attr]


def solutions(day: DayLike) -> list[list[str]]:
    """Every winning chain within budget, shortest first."""
    start, target = str(day["start"]), str(day["target"])
    budget = int(day["budget"])  # type: ignore[arg-type]
    pairs = day.get("pairs", {})
    pool = _pool(day)
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
    return sorted(found, key=len)


def welds_from(day: DayLike, part: str, used: Sequence[str] = ()) -> list[str]:
    """Pool chips that weld after `part` and are still on the table."""
    pairs = day.get("pairs", {})
    return [p for p in _pool(day) if p not in used and f"{part}>{p}" in pairs]


@dataclass
class DayReport:
    """Everything measurable about a day, for the curator and the lint."""

    label: str
    par: int
    budget: int
    pool: list[str]
    solutions: list[list[str]]
    #: Chips that weld to the start. Fewer than three and move one is not a
    #: choice — the player is being marched, not asked.
    openings: list[str]
    #: Chips that weld into the target. The same problem at the other end.
    closings: list[str]
    #: How many chips the player can plausibly choose between at each step of
    #: the canonical route. A profile of all ones is a corridor, not a puzzle.
    branching: list[int] = field(default_factory=list)
    #: Parts that appear in *every* solution. There is no way around these, so
    #: the "several ways to win" promise is thinner than the count suggests.
    bottlenecks: list[str] = field(default_factory=list)
    #: Distinct first chips across winning routes. `openings` counts every chip
    #: that welds off the start, decoys included — this counts the ones that
    #: actually go somewhere.
    winning_openings: list[str] = field(default_factory=list)
    #: The largest set of solutions that share no intermediate chip with each
    #: other. Raw solution count flatters a day: eight routes that all funnel
    #: through the same part are one idea with variations, and a player who
    #: finds the part has finished thinking.
    disjoint_routes: int = 0
    #: Welds from each independent route out to the rest of the pool. A zero
    #: means that route is an island the player can spot by elimination.
    route_cross_links: list[int] = field(default_factory=list)
    #: Solution chips that weld to nothing outside their own route — the tell
    #: that gives a group away.
    isolated_chips: list[str] = field(default_factory=list)
    #: Welds on solution paths whose witness SALDO does not record. SALDO is a
    #: curated lexicon, so absence is a decent proxy for "marginal compound".
    weak_welds: list[str] = field(default_factory=list)
    total_welds: int = 0
    saldo_welds: int = 0

    @property
    def shortest(self) -> int:
        """Links in the best route. Should equal par, or the label is a lie."""
        return min((len(s) for s in self.solutions), default=0) + 1

    @property
    def min_branching(self) -> int:
        return min(self.branching, default=0)

    @property
    def min_cross_links(self) -> int:
        """Entanglement of the least-connected independent route."""
        return min(self.route_cross_links, default=0)

    @property
    def saldo_share(self) -> float:
        return self.saldo_welds / self.total_welds if self.total_welds else 0.0


def report(day: DayLike, saldo: Saldo | None = None) -> DayReport:
    start, target = str(day["start"]), str(day["target"])
    pairs: dict[str, str] = dict(day.get("pairs", {}))  # type: ignore[arg-type]
    found = solutions(day)

    # Branching along the canonical route: the shortest, and among equals the
    # one the generator would have shown first.
    branching: list[int] = []
    if found:
        best = found[0]
        used: list[str] = []
        for i, part in enumerate([start, *best]):
            if i:
                used.append(part)
            # The final move is onto the target, so there is no chip to choose.
            if i < len(best):
                branching.append(len(welds_from(day, part, used)))

    every = [set(s) for s in found]
    bottlenecks = sorted(set.intersection(*every)) if every else []

    independent = largest_disjoint_set(found)
    crossings = [cross_links(day, route) for route in independent]
    # A chip is a tell when it welds to nothing beyond its *own* route — that
    # is what lets a player pick the group out by elimination.
    isolated = sorted(
        {
            chip
            for route in independent
            for chip in route
            if cross_links(day, [chip], ignoring=route) == 0
        }
    )

    on_paths = set()
    for chain in found:
        seq = [start, *chain, target]
        for a, b in zip(seq, seq[1:]):
            on_paths.add(f"{a}>{b}")

    weak: list[str] = []
    saldo_welds = 0
    if saldo is not None:
        for key, witness in pairs.items():
            if witness in saldo:
                saldo_welds += 1
            elif key in on_paths:
                weak.append(witness)

    return DayReport(
        label=f"{start}→{target}",
        par=int(day["par"]),  # type: ignore[arg-type]
        budget=int(day["budget"]),  # type: ignore[arg-type]
        pool=_pool(day),
        solutions=found,
        openings=welds_from(day, start),
        closings=[p for p in _pool(day) if f"{p}>{target}" in pairs],
        branching=branching,
        bottlenecks=bottlenecks,
        winning_openings=sorted({chain[0] for chain in found if chain}),
        disjoint_routes=len(independent),
        route_cross_links=crossings,
        isolated_chips=isolated,
        weak_welds=sorted(set(weak)),
        total_welds=len(pairs),
        saldo_welds=saldo_welds,
    )


def largest_disjoint_set(routes: Sequence[Sequence[str]]) -> list[list[str]]:
    """The largest set of routes that pairwise share no intermediate chip.

    This answers "are there really different ways to win". The generator caps a
    day at twelve solutions, so the search is tiny.
    """
    if not routes:
        return []
    for size in range(len(routes), 1, -1):
        for combo in combinations(routes, size):
            if all(set(a).isdisjoint(b) for a, b in combinations(combo, 2)):
                return [list(r) for r in combo]
    return [list(routes[0])]


def max_disjoint(routes: Sequence[Sequence[str]]) -> int:
    return len(largest_disjoint_set(routes))


def cross_links(day: DayLike, group: Sequence[str], *, ignoring: Sequence[str] = ()) -> int:
    """Welds between chips inside `group` and pool chips outside it.

    Independent routes are only worth having if they are *entangled*. Three
    routes that weld only along themselves are three visible islands: a player
    who notices that hund, ben and böj join nothing else has been handed the
    answer by elimination rather than deduction. Endpoints are excluded, since
    every route touches both by definition and would look connected on that
    account alone.
    """
    pairs = day.get("pairs", {})
    inside = set(group) | set(ignoring)
    outside = [p for p in _pool(day) if p not in inside]
    return sum(
        1
        for a in group
        for b in outside
        if f"{a}>{b}" in pairs or f"{b}>{a}" in pairs
    )


def spell(day: DayLike, chain: Sequence[str]) -> str:
    """Render a route as the compounds it spells."""
    pairs = day.get("pairs", {})
    seq = [str(day["start"]), *chain, str(day["target"])]
    return " → ".join(pairs[f"{a}>{b}"] for a, b in zip(seq, seq[1:]))  # type: ignore[index]
