import json
from pathlib import Path

from kedjan import analysis

CALENDAR = Path(__file__).resolve().parents[2] / "public" / "days.json"


def a_day(**over):
    """sten → hus: two routes, a cul-de-sac, and a known branching profile."""
    day = {
        "start": "sten", "target": "hus", "par": 3, "budget": 4,
        "pool": ["mur", "vägg", "bro", "tak", "glas"],
        "pairs": {
            "sten>mur": "stenmur", "sten>bro": "stenbro", "sten>tak": "stentak",
            "mur>vägg": "murvägg", "vägg>hus": "vägghus", "bro>hus": "brohus",
            "tak>glas": "takglas",
        },
    }
    day.update(over)
    return day


def test_finds_every_route_shortest_first():
    assert analysis.solutions(a_day()) == [["bro"], ["mur", "vägg"]]


def test_openings_are_the_chips_that_weld_to_the_start():
    assert analysis.report(a_day()).openings == ["mur", "bro", "tak"]


def test_closings_are_the_chips_that_weld_into_the_target():
    # The mirror of openings, and the check hand curation kept forgetting.
    assert analysis.report(a_day()).closings == ["vägg", "bro"]


def test_shortest_is_the_best_route_in_links():
    assert analysis.report(a_day()).shortest == 2  # sten + bro + hus


def test_branching_counts_the_choice_at_each_step():
    # From sten: mur, bro, tak. The canonical route is one link, so one step.
    assert analysis.report(a_day()).branching == [3]


def test_branching_excludes_parts_already_used():
    day = a_day(pairs={
        "sten>mur": "stenmur", "mur>vägg": "murvägg", "mur>tak": "murtak",
        "vägg>hus": "vägghus", "tak>hus": "takhus",
    })
    # sten offers only mur; mur then offers vägg and tak.
    assert analysis.report(day).branching == [1, 2]
    assert analysis.report(day).min_branching == 1


def test_bottlenecks_are_the_parts_every_solution_needs():
    day = a_day(pairs={
        "sten>mur": "stenmur", "mur>vägg": "murvägg", "mur>tak": "murtak",
        "vägg>hus": "vägghus", "tak>hus": "takhus",
    })
    assert analysis.report(day).bottlenecks == ["mur"]


def test_no_bottleneck_when_the_routes_are_disjoint():
    assert analysis.report(a_day()).bottlenecks == []


def test_spell_renders_the_compounds():
    assert analysis.spell(a_day(), ["mur", "vägg"]) == "stenmur → murvägg → vägghus"


def test_weak_welds_need_saldo_and_are_empty_without_it():
    assert analysis.report(a_day(), None).weak_welds == []


def test_every_shipped_day_offers_a_choice_at_both_ends():
    for day in json.loads(CALENDAR.read_text(encoding="utf-8")):
        r = analysis.report(day)
        assert len(r.openings) >= 3, f"{r.label}: {len(r.openings)} openings"
        assert len(r.closings) >= 2, f"{r.label}: {len(r.closings)} closings"
        assert r.min_branching >= 2, f"{r.label}: branching {r.branching}"
        assert r.shortest == r.par, f"{r.label}: par {r.par}, shortest {r.shortest}"
