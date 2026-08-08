"""Day generation.

Every date carries two chains. The easy one is par 3 under the generous
3-12 solution band — the shape the game launched with. The hard one is
par 4-5 under a 2-6 band, because the first archive proved that a short
chain with many escapes solves itself. The single most descriptive number
for a day is still the pairs-to-solutions ratio: many welds, few escapes —
the hard tier just demands it.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import date, timedelta

from .analysis import cross_links, largest_disjoint_set
from .graph import PartGraph, doublet_partner
from .lexicon import Lexicon
from .split import PREFIX_SET

POOL_SIZE = 10
MIN_POOL_SIZE = 9
CORE_SIZE = 8
#: Hard requirements, by tier. Par 3 is the easy chain and keeps the generous
#: launch band. Par 4-5 is the hard chain: fewer than two solutions is a
#: single line to find, and past six the escapes multiply faster than the
#: deduction — the archive taught us that at this length even eight is a
#: walkover. Difficulty lives in the ratio: many welds, few of them a way out.
EASY_SOLUTION_BAND = range(3, 13)
HARD_SOLUTION_BAND = range(2, 7)
EASY_PAR = 3


def solution_band(par: int) -> range:
    return EASY_SOLUTION_BAND if par <= EASY_PAR else HARD_SOLUTION_BAND
#: A good decoy is selective — it opens two to five new welds, no more.
DECOY_PAIRS = range(2, 6)
#: No pool part may weld to more than this many others in the pool.
MAX_IN_POOL_WELDS = 5
#: A start that welds to one chip means move one is not a choice, and a target
#: reachable from one chip means the last move is not either. Both were found
#: in playtesting, at opposite ends of the chain; only the first was noticed.
MIN_OPENINGS = 3
MIN_CLOSINGS = 2
#: At no point on the canonical route should the player have a single option.
MIN_BRANCHING = 2
#: Solution count flatters a day — eight routes through one shared part are one
#: idea with variations — so a floor on genuinely independent routes is the
#: real requirement. It has to scale with par, because routes consume pool.
#:
#: Three disjoint routes need 3 x (par - 1) chips at minimum length. Against a
#: ten-chip pool that is six chips at par 3, leaving four for decoys, but nine
#: at par 4, leaving one — and decoys are the thinking, so a par-4 day bought
#: that way would have nothing left to deduce. Measured, not guessed: of
#: eighteen candidates generated at a floor of two, three cleared a flat floor
#: of three and every one of them was par 3.
MIN_DISJOINT_BY_PAR = {3: 3}
MIN_DISJOINT_FALLBACK = 2


def min_disjoint_routes(par: int) -> int:
    return MIN_DISJOINT_BY_PAR.get(par, MIN_DISJOINT_FALLBACK)


#: Independent routes are only worth having if they are entangled. Three routes
#: that weld only along themselves are three visible islands — spot that hund,
#: ben and böj join nothing else and elimination hands you the answer. Each
#: route must reach at least this many chips outside itself.
MIN_ROUTE_CROSS_LINKS = 2
#: At most one chip may weld solely within its own route; beyond that the pool
#: reads as separate groups and elimination replaces deduction.
MAX_ISOLATED_CHIPS = 1
MAX_ENDPOINT_OBSCURITY = 3_000
PATH_SEARCH_CAP = 3_000
SOLUTION_SEARCH_CAP = 100


@dataclass
class Day:
    """One puzzle, in the exact shape the client consumes."""

    start: str
    target: str
    par: int
    pool: list[str]
    pairs: dict[str, str]
    date: str = ""
    no: int = 0
    metrics: dict[str, int] = field(default_factory=dict)

    @property
    def budget(self) -> int:
        return self.par + 1

    def to_json(self) -> dict[str, object]:
        return {
            "date": self.date,
            "no": self.no,
            "start": self.start,
            "target": self.target,
            "par": self.par,
            "budget": self.budget,
            "pool": self.pool,
            "pairs": self.pairs,
            "_metrics": self.metrics,
        }


def distances_from(graph: PartGraph, start: str) -> dict[str, int]:
    """Breadth-first distance from a part to every part it can reach."""
    dist = {start: 0}
    queue = deque([start])
    while queue:
        part = queue.popleft()
        for neighbour in graph.adjacency.get(part, ()):
            if neighbour not in dist:
                dist[neighbour] = dist[part] + 1
                queue.append(neighbour)
    return dist


def paths_between(graph: PartGraph, start: str, target: str, max_links: int) -> list[list[str]]:
    """Every route from start to target within the link budget."""
    found: list[list[str]] = []

    def walk(part: str, chain: list[str]) -> None:
        if len(chain) >= max_links or len(found) > PATH_SEARCH_CAP:
            return
        for nxt in graph.adjacency.get(part, ()):
            if nxt in chain or nxt == start:
                continue
            if nxt == target:
                found.append([*chain, nxt])
            elif len(chain) + 1 < max_links:
                walk(nxt, [*chain, nxt])

    walk(start, [])
    return found


def count_pairs(graph: PartGraph, parts: list[str]) -> int:
    """Valid welds available among a set of parts — the day's density dial."""
    return sum(
        1 for a in parts for b in parts if a != b and graph.welds(a, b)
    )


def in_pool_welds(graph: PartGraph, part: str, parts: list[str]) -> int:
    """How many other parts this one welds to, in either direction."""
    return sum(
        1 for other in parts
        if other != part and (graph.welds(part, other) or graph.welds(other, part))
    )


def solutions(graph: PartGraph, pool: list[str], start: str, target: str, budget: int) -> list[list[str]]:
    """Winning chains through the pool, within budget."""
    found: list[list[str]] = []

    def walk(part: str, chain: list[str]) -> None:
        if len(found) >= SOLUTION_SEARCH_CAP:
            return
        if graph.welds(part, target) and len(chain) + 1 <= budget:
            found.append(list(chain))
        if len(chain) + 1 >= budget:
            return
        for nxt in pool:
            if nxt in chain or not graph.welds(part, nxt):
                continue
            walk(nxt, [*chain, nxt])

    walk(start, [])
    return found


def build_day(graph: PartGraph, lex: Lexicon, start: str, target: str, par: int) -> Day | None:
    """Assemble a day, or return None if it fails a hard requirement.

    The core is the union of diverse near-optimal paths, so there is more than
    one way to win. Decoys are then added greedily under the selectivity
    constraints learned in playtesting.
    """
    budget = par + 1
    routes = paths_between(graph, start, target, budget)
    if len(routes) < solution_band(par).start:
        return None

    routes.sort(key=lambda r: sum(lex.obscurity(p) for p in r))
    core: list[str] = []
    for route in routes:
        fresh = [p for p in route[:-1] if p not in core]
        if len(core) + len(fresh) <= CORE_SIZE:
            core += fresh
        if len(core) >= CORE_SIZE:
            break

    with_endpoints = lambda pool: [*pool, start, target]  # noqa: E731

    candidates = sorted(
        {
            other
            for anchor in [*core, start, target]
            for other in graph.hubs
            if other not in core
            and other not in (start, target)
            and (graph.welds(anchor, other) or graph.welds(other, anchor))
        },
        key=lambda p: -graph.degree(p),
    )[:200]

    pool = list(core)
    while len(pool) < POOL_SIZE and candidates:
        scored = []
        for candidate in candidates:
            trial = with_endpoints([*pool, candidate])
            added = count_pairs(graph, trial) - count_pairs(graph, with_endpoints(pool))
            if added not in DECOY_PAIRS:
                continue
            if in_pool_welds(graph, candidate, trial) > MAX_IN_POOL_WELDS:
                continue
            partner = doublet_partner(candidate)
            if partner and partner in trial:
                continue  # far and fader in one pool is a guess, not a choice
            if any(in_pool_welds(graph, p, trial) > MAX_IN_POOL_WELDS + 1 for p in with_endpoints(pool)):
                continue
            scored.append((added, -lex.obscurity(candidate), candidate))
        if not scored:
            break
        scored.sort(reverse=True)
        chosen = scored[0][2]
        pool.append(chosen)
        candidates.remove(chosen)

    if len(pool) < MIN_POOL_SIZE:
        return None

    everything = with_endpoints(pool)
    if any((doublet_partner(p) or "") in everything for p in everything):
        return None

    found = solutions(graph, pool, start, target, budget)
    if len(found) not in solution_band(par):
        return None

    day_view = {
        "start": start,
        "target": target,
        "pool": pool,
        "pairs": {
            f"{a}>{b}": "x"
            for a in [*pool, start, target]
            for b in [*pool, start, target]
            if a != b and graph.welds(a, b)
        },
    }

    # Par names the shortest route. If the pool cannot deliver one that short,
    # the label is a lie and no player can ever make par.
    if min(len(s) for s in found) + 1 != par:
        return None

    independent = largest_disjoint_set(found)
    if len(independent) < min_disjoint_routes(par):
        return None
    if any(
        cross_links(day_view, route) < MIN_ROUTE_CROSS_LINKS for route in independent
    ):
        return None
    isolated = {
        chip
        for route in independent
        for chip in route
        if cross_links(day_view, [chip], ignoring=route) == 0
    }
    if len(isolated) > MAX_ISOLATED_CHIPS:
        return None

    openings = [p for p in pool if graph.welds(start, p)]
    closings = [p for p in pool if graph.welds(p, target)]
    if len(openings) < MIN_OPENINGS or len(closings) < MIN_CLOSINGS:
        return None

    # Walk the canonical route and refuse any step offering a single chip.
    best = min(found, key=len)
    used: list[str] = []
    for i, part in enumerate([start, *best]):
        if i:
            used.append(part)
        if i < len(best):
            choices = sum(1 for p in pool if p not in used and graph.welds(part, p))
            if choices < MIN_BRANCHING:
                return None

    all_parts = with_endpoints(pool)
    pairs = {
        f"{a}>{b}": graph.pairs[(a, b)]
        for a in all_parts
        for b in all_parts
        if a != b and graph.welds(a, b)
    }
    return Day(
        start=start,
        target=target,
        par=par,
        pool=pool,
        pairs=pairs,
        metrics={
            "valid_pairs": count_pairs(graph, all_parts),
            "solutions": len(found),
            "openings": len(openings),
            "closings": len(closings),
            "disjoint_routes": len(independent),
            "min_cross_links": min(
                cross_links(day_view, route) for route in independent
            ),
            "isolated_chips": len(isolated),
        },
    )


def usable_endpoint(lex: Lexicon, graph: PartGraph, part: str) -> bool:
    """Endpoint taste the generator *can* judge. The rest is the human pass."""
    return (
        part in graph.hubs
        and lex.obscurity(part) < MAX_ENDPOINT_OBSCURITY
        and part not in PREFIX_SET  # a till->X day was flagged in playtesting
    )


def generate(
    graph: PartGraph,
    lex: Lexicon,
    counts: dict[int, int] | None = None,
) -> list[Day]:
    """Propose days, distinct in both endpoints.

    The generator proposes; a human curation pass decides. Endpoint taste, tone
    and pool sanity are judgements this code cannot make — the pipeline once
    offered "maskingevär" into a cozy garden puzzle.
    """
    counts = counts or {3: 4, 4: 4}
    used_starts: set[str] = set()
    used_targets: set[str] = set()
    days: list[Day] = []

    for par, wanted in sorted(counts.items()):
        found = 0
        for start in sorted(graph.hubs, key=lambda p: -graph.degree(p)):
            if found >= wanted:
                break
            if start in used_starts or not usable_endpoint(lex, graph, start):
                continue

            best: Day | None = None
            for target, distance in distances_from(graph, start).items():
                if distance != par or target in used_targets:
                    continue
                if not usable_endpoint(lex, graph, target):
                    continue
                # A day whose endpoints already weld has no puzzle in it.
                if graph.welds(start, target) or graph.welds(target, start):
                    continue
                day = build_day(graph, lex, start, target, par)
                if day is None:
                    continue
                # Rank by independence first: a day with more genuinely
                # different routes beats a denser one with fewer.
                rank = (day.metrics["disjoint_routes"], day.metrics["valid_pairs"])
                if best is None or rank > (
                    best.metrics["disjoint_routes"],
                    best.metrics["valid_pairs"],
                ):
                    best = day

            if best:
                days.append(best)
                used_starts.add(best.start)
                used_targets.add(best.target)
                found += 1
    return days


def schedule(days: list[Day], first: date, start_no: int = 1) -> list[Day]:
    """Stamp consecutive dates and puzzle numbers onto a curated run of days."""
    for offset, day in enumerate(days):
        day.date = (first + timedelta(days=offset)).isoformat()
        day.no = start_no + offset
    return days
