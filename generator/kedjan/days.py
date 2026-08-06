"""Day generation.

The three measured dials are par (3 for weekdays, 4 for harder days),
valid-pairs count (a healthy band is roughly 20-30 over twelve parts), and
solution count (a hard requirement of 3-12 within budget). The single most
descriptive number for a day is the pairs-to-solutions ratio: many welds, few
escapes.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from datetime import date, timedelta

from .graph import PartGraph
from .lexicon import Lexicon
from .split import PREFIX_SET

POOL_SIZE = 10
MIN_POOL_SIZE = 9
CORE_SIZE = 8
#: Hard requirement, paid for in playtesting: fewer than three and the day is a
#: single line to find; more than twelve and the deduction evaporates.
SOLUTION_BAND = range(3, 13)
#: A good decoy is selective — it opens two to five new welds, no more.
DECOY_PAIRS = range(2, 6)
#: No pool part may weld to more than this many others in the pool.
MAX_IN_POOL_WELDS = 5
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
    if len(routes) < SOLUTION_BAND.start:
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

    found = solutions(graph, pool, start, target, budget)
    if len(found) not in SOLUTION_BAND:
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
        metrics={"valid_pairs": count_pairs(graph, all_parts), "solutions": len(found)},
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
                if day and (best is None or day.metrics["valid_pairs"] > best.metrics["valid_pairs"]):
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
