"""The sweep's scorer — the five curation judgements, made explicit."""

from __future__ import annotations

from kedjan.days import Day
from kedjan.saldo import Saldo
from kedjan.sweep import _band, score_day
from kedjan.analysis import report


def test_band_is_full_inside_the_sweet_range_and_zero_at_the_edges():
    assert _band(7, 2, range(6, 10), 13) == 1.0
    assert _band(2, 2, range(6, 10), 13) == 0.0
    assert _band(13, 2, range(6, 10), 13) == 0.0
    # Ramps, monotonic on both flanks.
    assert 0 < _band(4, 2, range(6, 10), 13) < _band(5, 2, range(6, 10), 13) < 1
    assert 1 > _band(10, 2, range(6, 10), 13) > _band(12, 2, range(6, 10), 13) > 0


def _tiny_day() -> Day:
    """sten→hus with two disjoint routes: mur→vägg and bro→tak."""
    pool = ["mur", "vägg", "bro", "tak"]
    pairs = {
        "sten>mur": "stenmur", "mur>vägg": "murvägg", "vägg>hus": "vägghus",
        "sten>bro": "stenbro", "bro>tak": "brotak", "tak>hus": "takhus",
        "mur>tak": "murtak", "bro>vägg": "brovägg",
    }
    return Day(
        start="sten", target="hus", par=3, pool=pool, pairs=pairs,
        metrics={"valid_pairs": len(pairs), "solutions": 2, "disjoint_routes": 2},
    )


def _payload(day: Day) -> dict:
    p = day.to_json()
    p["date"] = "2026-01-01"
    return p


def test_doubleness_counts_only_pool_chips_with_two_or_more_senses():
    day = _tiny_day()
    saldo = Saldo(pos={}, senses={"mur": frozenset({"vägg", "spel"}), "bro": frozenset({"bro"})})
    scored = score_day(day, report(_payload(day), saldo), saldo)
    # mur has two senses; bro has one and does not count.
    assert set(scored.homographs) == {"mur"}
    assert 0 < scored.subscores["doubleness"] < 1


def test_score_is_a_weighted_sum_of_its_subscores():
    day = _tiny_day()
    saldo = Saldo(pos={}, senses={})
    scored = score_day(day, report(_payload(day), saldo), saldo)
    assert scored.subscores["doubleness"] == 0.0
    assert 0 <= scored.score <= 1


def test_traps_score_nothing_when_every_opening_wins():
    """The tiny day's two openings, mur and bro, both reach hus."""
    day = _tiny_day()
    saldo = Saldo(pos={}, senses={})
    scored = score_day(day, report(_payload(day), saldo), saldo)
    assert scored.subscores["traps"] == 0.0


def test_traps_score_a_first_move_that_goes_nowhere():
    """The same day with a fourth chip, glas, that welds off sten and dies.

    It welds off the start and off mur, so a player can lay two parts down
    the wrong line — which is the whole point of the measurement.
    """
    day = _tiny_day()
    day.pool.append("glas")
    day.pairs["sten>glas"] = "stenglas"
    day.pairs["mur>glas"] = "murglas"
    day.metrics["valid_pairs"] = len(day.pairs)
    saldo = Saldo(pos={}, senses={})
    scored = score_day(day, report(_payload(day), saldo), saldo)
    assert scored.subscores["traps"] > 0


def test_deception_rewards_welds_that_lie_on_no_winning_route():
    """The tiny day's fabric: 8 welds, 6 on the two routes, 2 decoys.

    An off-route share of 2/8 sits under the floor, so a day this honest
    scores nothing for deception — the dial only opens once most of what
    welds does not win.
    """
    day = _tiny_day()
    saldo = Saldo(pos={}, senses={})
    scored = score_day(day, report(_payload(day), saldo), saldo)
    assert scored.subscores["deception"] == 0.0


def test_attested_rewards_routes_built_of_words_saldo_holds():
    """weak_welds is what the report already measures; the score turns it
    into the share of a winner's words the dictionary can actually show.

    All four ways through the tiny day count, so the two crossing welds —
    murtak and brovägg — are route words too, and a SALDO holding only the
    six obvious ones still leaves the day two short of a full mark.
    """
    day = _tiny_day()
    words = ("stenmur", "murvägg", "vägghus", "stenbro", "brotak", "takhus")
    known = Saldo(pos={w: frozenset({"nn"}) for w in words})
    thin = Saldo(pos={"stenmur": frozenset({"nn"})})
    full = score_day(day, report(_payload(day), known), known)
    sparse = score_day(day, report(_payload(day), thin), thin)
    assert full.subscores["attested"] > 0.8
    assert sparse.subscores["attested"] == 0.0
