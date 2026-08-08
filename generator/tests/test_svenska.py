"""svenska.se is somebody's public website — everything here runs against
canned fragments shaped like the site's per-dictionary article endpoints."""

from __future__ import annotations

import json

from kedjan import cli, curate, svenska
from kedjan.curate import Level

ARTICLE = '<div class="artikel"><span class="def">mur av sten</span></div>'
NO_HIT = "<p>Sökningen gav inga svar</p>"


def fake_fetch(so: set[str], saol: set[str]):
    def _fetch(self, dictionary, word):
        _fetch.calls.append((dictionary, word))
        vocab = so if dictionary == "so" else saol
        return ARTICLE if word in vocab else NO_HIT

    _fetch.calls = []
    return _fetch


def make_client(tmp_path, monkeypatch, so, saol):
    monkeypatch.setattr(svenska.Svenska, "_fetch", fake_fetch(so, saol))
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    return client


def test_lookup_answers_per_dictionary(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur", "glasbåt"})
    assert client.lookup("stenmur") == {"so": True, "saol": True}
    assert client.lookup("glasbåt") == {"so": False, "saol": True}
    assert client.lookup("tomslag") == {"so": False, "saol": False}


def test_lookup_extracts_the_so_definition_for_the_terminal(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch, so={"stenmur"}, saol=set())
    client.lookup("stenmur")
    assert client.last_definition == "mur av sten"


def test_verdicts_persist_and_are_never_asked_twice(tmp_path, monkeypatch):
    first = make_client(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur"})
    assert first.lookup("stenmur") == {"so": True, "saol": True}

    # A fresh client over the same file, against a dead site.
    monkeypatch.setattr(svenska.Svenska, "_fetch", lambda self, d, w: None)
    second = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    second.delay = 0
    assert second.lookup("stenmur") == {"so": True, "saol": True}


def test_an_unreachable_site_answers_none_not_absent(tmp_path, monkeypatch):
    monkeypatch.setattr(svenska.Svenska, "_fetch", lambda self, d, w: None)
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    assert client.lookup("stenmur") is None
    assert not (tmp_path / "verdicts.json").exists()


# ── the verdicts inside the lint ─────────────────────────────────


def day_with(pairs: dict[str, str]) -> dict:
    return {"start": "sten", "target": "hus", "pairs": pairs}


def test_check_svenska_grades_each_weld(tmp_path):
    verdicts = {
        "stenmur": {"so": True, "saol": True},
        "murvägg": {"so": False, "saol": True},
        "tomslag": {"so": False, "saol": False},
    }
    findings = curate.check_svenska(
        [day_with({"a>b": "stenmur", "b>c": "murvägg", "c>d": "tomslag", "d>e": "okänt"})],
        verdicts,
    )
    by_level = {f.message: f.level for f in findings}
    assert by_level["tomslag has no svenska.se entry — the weld link breaks"] is Level.ERROR
    assert (
        by_level["murvägg is in SAOL but not SO — the link shows no definition"]
        is Level.WARN
    )
    assert by_level["okänt is unverified against svenska.se"] is Level.WARN
    assert not any("stenmur" in m for m in by_level)


# ── the command ──────────────────────────────────────────────────


def write_days(tmp_path, pairs):
    path = tmp_path / "days.json"
    path.write_text(
        json.dumps([{"start": "sten", "target": "hus", "pairs": pairs}]),
        encoding="utf-8",
    )
    return path


def svenskacheck(tmp_path, monkeypatch, so, saol):
    monkeypatch.setattr(svenska.Svenska, "_fetch", fake_fetch(so, saol))
    monkeypatch.setattr(svenska, "COURTESY_DELAY", 0)
    days = write_days(tmp_path, {"a>b": "stenmur", "b>c": "murvägg"})
    return cli.main(
        [
            "svenskacheck",
            "--days", str(days),
            "--verdicts", str(tmp_path / "verdicts.json"),
        ]
    )


def test_svenskacheck_passes_when_so_carries_every_weld(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur", "murvägg"}, saol=set())
    assert code == 0
    assert "2 of 2 welds in SO." in capsys.readouterr().out


def test_svenskacheck_fails_on_a_weld_the_site_lacks(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur"})
    assert code == 1
    out = capsys.readouterr().out
    assert "MISSING    murvägg" in out


def test_svenskacheck_marks_saol_only_welds_without_failing(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur", "murvägg"})
    assert code == 0
    assert "SAOL ONLY  murvägg" in capsys.readouterr().out


def test_lint_reads_the_committed_verdicts(tmp_path, monkeypatch, capsys):
    """A verdict written on one machine blocks the lint on every machine."""
    from test_curate import a_day

    days = tmp_path / "days.json"
    days.write_text(json.dumps([a_day()]), encoding="utf-8")
    verdicts = tmp_path / "verdicts.json"
    verdicts.write_text(
        json.dumps({"stenmur": {"so": False, "saol": False}}), encoding="utf-8"
    )
    code = cli.main(
        [
            "lint", str(days),
            "--no-lexicon",
            "--saldo", str(tmp_path / "absent"),
            "--svenska-verdicts", str(verdicts),
        ]
    )
    assert code == 1
    assert "stenmur has no svenska.se entry" in capsys.readouterr().err
