import json
from pathlib import Path

from kedjan import curate
from kedjan.curate import Level

CALENDAR = Path(__file__).resolve().parents[2] / "public" / "days.json"


def a_day(**over):
    """A day that passes every rule, so each test can break exactly one thing."""
    day = {
        "date": "2026-08-06",
        "no": 1,
        "start": "sten",
        "target": "hus",
        "par": 3,
        "budget": 4,
        "pool": ["mur", "vägg", "bro", "tak", "glas", "gård", "port", "torg", "kaj"],
        "pairs": {
            "sten>mur": "stenmur", "sten>bro": "stenbro", "sten>tak": "stentak",
            "mur>vägg": "murvägg", "mur>gård": "murgård", "mur>tak": "murtak",
            "vägg>hus": "vägghus", "vägg>mur": "väggmur",
            "bro>port": "broport", "bro>glas": "broglas",
            "port>hus": "porthus", "port>bro": "portbro", "port>glas": "portglas",
            "tak>glas": "takglas", "tak>port": "takport",
            "glas>hus": "glashus", "glas>tak": "glastak",
            "gård>torg": "gårdstorg", "gård>kaj": "gårdskaj",
            "torg>hus": "torghus", "torg>kaj": "torgkaj", "torg>gård": "torggård",
            "kaj>hus": "kajhus", "kaj>bro": "kajbro",
        },
    }
    day.update(over)
    return day


def levels(findings, level):
    return [f.message for f in findings if f.level is level]


def errors(findings):
    return levels(findings, Level.ERROR)


def warnings(findings):
    return levels(findings, Level.WARN)


def test_a_healthy_day_has_no_blocking_findings():
    assert errors(curate.check_day(a_day())) == []


def test_flags_a_direct_start_to_target_weld():
    day = a_day()
    day["pairs"]["sten>hus"] = "stenhus"
    assert any("no puzzle" in m for m in errors(curate.check_day(day)))


def test_flags_a_budget_that_is_not_par_plus_one():
    assert any("not par" in m for m in errors(curate.check_day(a_day(budget=5))))


def test_flags_a_short_pool():
    day = a_day(pool=["mur", "vägg", "bro"])
    assert any("minimum is" in m for m in errors(curate.check_day(day)))


def test_flags_an_endpoint_that_is_also_a_chip():
    day = a_day()
    day["pool"] = [*day["pool"], "hus"]
    assert any("also a pool chip" in m for m in errors(curate.check_day(day)))


def test_flags_a_prefix_particle_endpoint():
    # The till->X day flagged in playtesting; the rule now has teeth.
    day = a_day(start="till", pairs={"till>bro": "tillbro", "bro>hus": "brohus"})
    assert any("prefix particle" in m for m in errors(curate.check_day(day)))


def test_flags_a_colour_in_the_pool():
    day = a_day()
    day["pool"] = [*day["pool"][:-1], "blå"]
    assert any("colour" in m for m in errors(curate.check_day(day)))


def test_flags_a_verb_conjugation_masquerading_as_a_weld():
    # risk + foge-e + rar spells riskerar: a conjugated verb, not a compound.
    day = a_day()
    day["pairs"]["risk>rar"] = "riskerar"
    found = errors(curate.check_day(day))
    assert any("conjugates" in m for m in found)


def test_flags_a_splitter_artefact_in_the_pool():
    day = a_day()
    day["pool"] = [*day["pool"][:-1], "rar"]
    assert any("never a compound head" in m for m in errors(curate.check_day(day)))


def test_allows_a_real_noun_that_doubles_as_a_verb_tail():
    # hund + ras is hundras, a dog breed. Only the foge-e link makes it a verb.
    day = a_day()
    day["pairs"]["sten>ras"] = "stenras"
    assert errors(curate.check_day(day)) == []


def test_warns_about_an_agent_noun():
    day = a_day()
    day["pairs"]["rädda>ren"] = "räddaren"
    assert any("agent noun" in m for m in warnings(curate.check_day(day)))


def test_flags_a_witness_that_is_not_the_parts_joined():
    day = a_day()
    day["pairs"]["mur>vägg"] = "tegelvägg"
    assert any("not the parts joined" in m for m in errors(curate.check_day(day)))


def test_flags_a_witness_missing_from_the_lexicon(lex):
    day = a_day(pairs={"sten>mur": "stenmur", "mur>knas": "murknas"})
    found = errors(curate.check_day(day, lex))
    assert any("false acceptance" in m and "murknas" in m for m in found)
    assert not any("stenmur" in m for m in found)


def test_counts_solutions_from_the_shipped_pairs():
    routes = curate.solutions_within_budget(a_day())
    assert ["mur", "vägg"] in routes
    assert ["mur", "gård", "torg"] in routes
    assert all(len(r) + 1 <= 4 for r in routes)


def test_flags_a_solution_count_outside_the_band():
    day = a_day(pairs={"sten>bro": "stenbro", "bro>hus": "brohus"})
    assert any("solutions within budget" in m for m in errors(curate.check_day(day)))


def test_flags_reused_endpoints_across_a_calendar():
    days = [a_day(date="2026-08-06"), a_day(date="2026-08-07", no=2)]
    found = errors(curate.check_calendar(days))
    assert any("start is reused" in m for m in found)
    assert any("target is reused" in m for m in found)


def test_flags_two_days_sharing_a_date():
    days = [a_day(), a_day(start="fjäll", target="topp")]
    assert any("share a date" in m for m in errors(curate.check_calendar(days)))


def test_the_shipped_calendar_has_no_blocking_findings():
    days = json.loads(CALENDAR.read_text(encoding="utf-8"))
    blocking = curate.blocking(curate.check_calendar(days))
    assert blocking == [], "\n".join(str(f) for f in blocking)


def test_flags_a_numeral_in_the_pool():
    day = a_day()
    day["pool"] = [*day["pool"][:-1], "hundra"]
    assert any("numeral" in m for m in errors(curate.check_day(day)))


def test_flags_an_off_tone_endpoint():
    day = a_day(target="skit")
    assert any("off-tone" in m for m in errors(curate.check_day(day)))


def test_flags_a_register_doublet_in_one_pool():
    day = a_day()
    day["pool"] = [*day["pool"][:-2], "far", "fader"]
    assert any("register forms" in m for m in errors(curate.check_day(day)))


def test_flags_a_degree_prefix_endpoint():
    # helfin is "really nice", not a compound — hel- attaches to any adjective.
    day = a_day(start="hel")
    assert any("degree prefix" in m for m in errors(curate.check_day(day)))


def test_flags_a_degree_prefix_in_the_pool():
    day = a_day()
    day["pool"] = [*day["pool"][:-1], "jätte"]
    assert any("degree prefix" in m for m in errors(curate.check_day(day)))


def test_recurring_rejections_surface_repeat_offenders():
    from kedjan.cli import _recurring_rejections

    ledger = [
        {"start": "tok", "accepted": False, "reason": "tok- intensifier"},
        {"start": "tok", "accepted": False, "reason": "tok- intensifier across the pool"},
        {"start": "hund", "accepted": True, "reason": ""},
        {"start": "flyg", "accepted": False, "reason": "injury pool"},
    ]
    repeats = _recurring_rejections(ledger)
    assert set(repeats) == {"tok"}          # rejected twice
    assert len(repeats["tok"]) == 2         # both distinct reasons kept
