from datetime import date

import pytest

from kedjan import curate
from kedjan.days import (
    Day,
    build_day,
    count_pairs,
    distances_from,
    generate,
    in_pool_welds,
    paths_between,
    schedule,
    solutions,
)
from kedjan.graph import PartGraph
from kedjan.lexicon import Lexicon

#: A graph laid out so every routing rule has something to bite on:
#: sten reaches hus in two links via bro, in three via mur/vägg, and tak/glas
#: is a cul-de-sac.
EDGES = [
    ("sten", "mur"), ("sten", "bro"), ("sten", "tak"),
    ("mur", "vägg"), ("mur", "gård"), ("vägg", "hus"),
    ("bro", "port"), ("port", "hus"), ("tak", "glas"),
    ("gård", "torg"), ("torg", "hus"), ("torg", "kaj"), ("kaj", "hus"),
]


@pytest.fixture
def graph() -> PartGraph:
    pairs = {(a, b): a + b for a, b in EDGES}
    hubs = frozenset({p for edge in EDGES for p in edge})
    adjacency: dict[str, set[str]] = {}
    for a, b in EDGES:
        adjacency.setdefault(a, set()).add(b)
    return PartGraph(pairs=pairs, hubs=hubs, adjacency=adjacency)


@pytest.fixture
def flat_lex(graph) -> Lexicon:
    parts = sorted(graph.hubs)
    return Lexicon(
        words=frozenset(parts),
        union=frozenset(parts),
        rank={p: i for i, p in enumerate(parts)},
        common=frozenset(parts),
    )


def test_distances_are_breadth_first(graph):
    dist = distances_from(graph, "sten")
    assert dist["mur"] == 1
    assert dist["hus"] == 3  # sten -> bro -> port -> hus
    assert "glas" in dist


def test_unreachable_parts_are_absent(graph):
    assert "sten" not in distances_from(graph, "glas")


def test_paths_respect_the_budget(graph):
    within_three = paths_between(graph, "sten", "hus", 3)
    assert all(len(p) <= 3 for p in within_three)
    assert ["bro", "port", "hus"] in within_three
    assert ["mur", "gård", "torg", "hus"] not in within_three


def test_paths_never_revisit_the_start(graph):
    assert all("sten" not in path for path in paths_between(graph, "sten", "hus", 4))


def test_solutions_stay_inside_the_budget(graph):
    pool = ["mur", "vägg", "bro", "port", "tak", "glas", "gård", "torg", "kaj"]
    found = solutions(graph, pool, "sten", "hus", budget=4)
    assert ["bro", "port"] in found
    assert all(len(chain) + 1 <= 4 for chain in found)


def test_count_pairs_measures_density(graph):
    assert count_pairs(graph, ["sten", "mur", "vägg"]) == 2  # sten>mur, mur>vägg


def test_in_pool_welds_counts_both_directions(graph):
    assert in_pool_welds(graph, "mur", ["sten", "vägg", "gård", "kaj"]) == 3


def test_build_day_rejects_a_graph_with_too_few_routes(graph, flat_lex):
    # Only one route reaches hus in two links, well under the 3-solution floor.
    assert build_day(graph, flat_lex, "sten", "hus", par=2) is None


def test_build_day_rejects_a_pool_it_cannot_fill(graph, flat_lex):
    assert build_day(graph, flat_lex, "tak", "hus", par=3) is None


def test_generate_never_reuses_an_endpoint(graph, flat_lex):
    days = generate(graph, flat_lex, {3: 2})
    assert len({d.start for d in days}) == len(days)
    assert len({d.target for d in days}) == len(days)


def test_day_budget_is_always_par_plus_one():
    assert Day(start="a", target="b", par=3, pool=[], pairs={}).budget == 4


def test_schedule_stamps_consecutive_dates_and_numbers():
    days = [Day("a", "b", 3, [], {}), Day("c", "d", 4, [], {})]
    schedule(days, date(2026, 8, 6), start_no=7)
    assert [(d.date, d.no) for d in days] == [
        ("2026-08-06", 7),
        ("2026-08-07", 8),
    ]


def test_generated_days_serialise_into_the_client_shape(graph, flat_lex):
    days = schedule(generate(graph, flat_lex, {3: 1}), date(2026, 8, 6))
    for day in days:
        payload = day.to_json()
        assert set(payload) >= {
            "date", "no", "start", "target", "par", "budget", "pool", "pairs",
        }
        # Whatever the generator proposes must at least satisfy its own rules.
        assert curate.blocking(curate.check_day(payload)) == []
