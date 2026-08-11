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


def test_max_disjoint_counts_routes_that_share_nothing():
    assert analysis.max_disjoint([["a"], ["b", "c"], ["a", "d"]]) == 2
    assert analysis.max_disjoint([["a"], ["b"], ["c"]]) == 3
    assert analysis.max_disjoint([]) == 0


def test_max_disjoint_is_one_when_every_route_shares_a_part():
    # Eight solutions through one shared chip are one idea with variations.
    assert analysis.max_disjoint([["a"], ["a", "b"], ["a", "c"], ["a", "d"]]) == 1


def test_report_separates_solution_count_from_independence():
    day = a_day()
    r = analysis.report(day)
    assert len(r.solutions) == 2
    assert r.disjoint_routes == 2          # [bro] and [mur, vägg] share nothing
    assert r.winning_openings == ["bro", "mur"]


def test_winning_openings_exclude_chips_that_lead_nowhere():
    r = analysis.report(a_day())
    # tak welds off the start but dead-ends at glas, so it opens nothing.
    assert "tak" in r.openings
    assert "tak" not in r.winning_openings


def test_every_shipped_day_has_two_independent_routes():
    for day in json.loads(CALENDAR.read_text(encoding="utf-8")):
        r = analysis.report(day)
        assert r.disjoint_routes >= 2, f"{r.label}: {r.disjoint_routes}"


def test_cross_links_counts_welds_out_of_a_group():
    day = a_day()
    # mur welds to vägg (inside the group) and nothing else in the pool.
    assert analysis.cross_links(day, ["mur", "vägg"]) == 0
    # Endpoints are excluded, so bro reaches nothing outside itself either.
    assert analysis.cross_links(day, ["bro"]) == 0


def test_cross_links_can_ignore_a_chips_own_route():
    day = a_day()
    # mur reaches vägg, but vägg is its own route — so nothing beyond it.
    assert analysis.cross_links(day, ["mur"]) == 1
    assert analysis.cross_links(day, ["mur"], ignoring=["mur", "vägg"]) == 0


def test_cross_links_sees_a_link_out_of_the_group():
    day = a_day()
    day["pairs"]["mur>tak"] = "murtak"
    assert analysis.cross_links(day, ["mur", "vägg"]) == 1


def test_isolated_chips_name_a_group_that_gives_itself_away():
    # Three routes that weld only along themselves are three visible islands.
    day = a_day(
        pool=["a1", "a2", "b1", "b2", "c1", "c2"],
        pairs={
            "sten>a1": "x", "a1>a2": "x", "a2>hus": "x",
            "sten>b1": "x", "b1>b2": "x", "b2>hus": "x",
            "sten>c1": "x", "c1>c2": "x", "c2>hus": "x",
        },
    )
    r = analysis.report(day)
    assert r.disjoint_routes == 3
    assert r.route_cross_links == [0, 0, 0]
    assert r.isolated_chips == ["a1", "a2", "b1", "b2", "c1", "c2"]


def test_entanglement_clears_once_the_routes_link_up():
    day = a_day(
        pool=["a1", "a2", "b1", "b2"],
        pairs={
            "sten>a1": "x", "a1>a2": "x", "a2>hus": "x",
            "sten>b1": "x", "b1>b2": "x", "b2>hus": "x",
            "a1>b2": "x", "b1>a2": "x",   # false paths crossing the routes
        },
    )
    r = analysis.report(day)
    assert r.isolated_chips == []
    assert r.min_cross_links >= 1


def test_every_shipped_route_reaches_outside_itself():
    for day in json.loads(CALENDAR.read_text(encoding="utf-8")):
        r = analysis.report(day)
        assert len(r.isolated_chips) <= 1, f"{r.label}: {r.isolated_chips}"
        assert r.min_cross_links >= 2, f"{r.label}: {r.route_cross_links}"


def _saldo_with(primary):
    from kedjan.saldo import Saldo
    return Saldo(pos={}, primary=primary)


def test_centre_names_what_a_pool_is_about():
    saldo = _saldo_with({"kaffe": "dryck", "mjölk": "dryck", "bord": "möbel"})
    assert saldo.centre(["kaffe", "mjölk", "bord"]) == ["dryck"]


def test_centre_is_silent_when_a_pool_shares_nothing():
    saldo = _saldo_with({"kaffe": "dryck", "bord": "möbel"})
    assert saldo.centre(["kaffe", "bord"]) == []


def test_ancestors_stop_at_the_requested_depth_and_never_loop():
    saldo = _saldo_with({"a": "b", "b": "c", "c": "a"})
    assert saldo.ancestors("a", depth=2) == ["b", "c"]
    assert saldo.ancestors("a", depth=9) == ["b", "c"]   # the cycle terminates


def test_pool_roles_sorts_route_from_false_path_from_decoy():
    """mur wins, tak dangles off the start, glas dangles off tak — and lus
    welds only to another unreachable chip, which no legal chain can use."""
    day = {
        "start": "sten", "target": "hus", "budget": 4,
        "pool": ["mur", "tak", "glas", "lus", "orm"],
        "pairs": {
            "sten>mur": "stenmur", "mur>hus": "murhus",
            "sten>tak": "stentak", "tak>glas": "takglas",
            "lus>orm": "lusorm",
        },
    }
    from kedjan import analysis
    roles = analysis.pool_roles(day)
    assert roles["route"] == ["mur"]
    assert roles["false_path"] == ["tak", "glas"]
    assert roles["decoy"] == ["lus", "orm"]


def test_a_backward_weld_is_still_a_way_in():
    """glas welds *into* tak (glas>tak), so a player can hang it above tak —
    reachable, not a decoy, even though nothing welds onward out of it."""
    day = {
        "start": "sten", "target": "hus", "budget": 4,
        "pool": ["tak", "glas"],
        "pairs": {"sten>tak": "stentak", "glas>tak": "glastak", "tak>hus": "takhus"},
    }
    from kedjan import analysis
    roles = analysis.pool_roles(day)
    assert roles["false_path"] == ["glas"]
    assert roles["decoy"] == []
