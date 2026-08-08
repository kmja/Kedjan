"""Karp is somebody else's server — everything here runs against a fake.

The fake speaks the contract the client was written against (the Karp 7.0
OpenAPI spec): a query response carries `total`, and which field a lexicon
indexes varies, so the client has to probe.
"""

from __future__ import annotations

import json
import urllib.parse

from kedjan import cli, karp


def fake_get(vocab: dict[str, set[str]]):
    """A Karp server whose lexicon indexes the given fields, as `_get`.

    A field the server does not index answers without a `total`, which is
    what the real API does for an unknown field path.
    """

    def _get(self, path):
        _get.calls.append(path)
        if path.startswith("/resources/"):
            return [{"resource_id": "salex"}, "saol15"]
        parsed = urllib.parse.urlparse(path)
        q = urllib.parse.parse_qs(parsed.query)["q"][0]
        _, field, word = q.split("|")
        if field not in vocab:
            return {"detail": "unknown field"}
        return {"total": 1 if word in vocab[field] else 0, "hits": []}

    _get.calls = []
    return _get


def make_karp(tmp_path, monkeypatch, vocab):
    monkeypatch.setattr(karp.Karp, "_get", fake_get(vocab))
    client = karp.Karp(cache_path=tmp_path / "cache.json")
    client.delay = 0
    return client


def test_lookup_answers_both_ways(tmp_path, monkeypatch):
    client = make_karp(tmp_path, monkeypatch, {"wf": {"hund", "stenmur"}})
    assert client.lookup("stenmur") is True
    assert client.lookup("tomslag") is False


def test_probe_settles_on_the_field_that_answers(tmp_path, monkeypatch):
    """salex declares `ortografi`, but a lexicon may index another field."""
    client = make_karp(tmp_path, monkeypatch, {"baseform": {"hund", "stenmur"}})
    assert client.lookup("stenmur") is True
    assert client._field == "baseform"


def test_probe_word_failing_everywhere_means_no_answer(tmp_path, monkeypatch):
    client = make_karp(tmp_path, monkeypatch, {})
    assert client.lookup("stenmur") is None


def test_unreachable_api_answers_none_not_false(tmp_path, monkeypatch):
    """Absence of an answer must never be recorded as absence of the word."""
    monkeypatch.setattr(karp.Karp, "_get", lambda self, path: None)
    client = karp.Karp(cache_path=tmp_path / "cache.json")
    client.delay = 0
    assert client.lookup("stenmur") is None
    assert not (tmp_path / "cache.json").exists()


def test_cache_survives_a_new_instance(tmp_path, monkeypatch):
    first = make_karp(tmp_path, monkeypatch, {"wf": {"hund", "stenmur"}})
    assert first.lookup("stenmur") is True
    assert first.lookup("tomslag") is False

    # A fresh client over the same cache file, against a dead server: both
    # remembered answers come back without a single request.
    monkeypatch.setattr(karp.Karp, "_get", lambda self, path: None)
    second = karp.Karp(cache_path=tmp_path / "cache.json")
    second.delay = 0
    assert second.lookup("stenmur") is True
    assert second.lookup("tomslag") is False


def test_list_resources_reads_both_shapes(tmp_path, monkeypatch):
    client = make_karp(tmp_path, monkeypatch, {"wf": set()})
    assert client.list_resources() == ["salex", "saol15"]


# ── dumping a whole lexicon ──────────────────────────────────────


def paged_fake_get(entries: list[dict], licence: str | None = None, fail_from: int | None = None):
    """A Karp server carrying the given entries, pageable, as `_get`."""

    def _get(self, path):
        _get.calls.append(path)
        parsed = urllib.parse.urlparse(path)
        if parsed.path.startswith("/resources/"):
            info = {"resource_id": "salex", "metadata": {}}
            if licence:
                info["metadata"]["license"] = licence
            return info
        qs = urllib.parse.parse_qs(parsed.query)
        if "q" in qs:
            return {"total": 0, "hits": []}
        start = int(qs.get("from", ["0"])[0])
        if fail_from is not None and start >= fail_from:
            return None
        size = int(qs["size"][0])
        return {"total": len(entries), "hits": entries[start : start + size]}

    _get.calls = []
    return _get


SALEX_ENTRIES = [
    {"entry": {"so": {"ortografi": "hund"}, "saol": [{"ortografi": "hund"}]}},
    {"entry": {"saol": [{"ortografi": "stenmur"}, {"ortografi": "sten"}]}},
    {"entry": {"so": {"ortografi": "mur"}}},
]


def test_dump_pages_through_the_whole_lexicon(tmp_path, monkeypatch):
    monkeypatch.setattr(karp.Karp, "_get", paged_fake_get(SALEX_ENTRIES))
    client = karp.Karp(cache_path=tmp_path / "cache.json")
    client.delay = 0
    assert client.dump(page=2) == ["hund", "mur", "sten", "stenmur"]


def test_dump_refuses_to_pass_off_a_partial_pull(tmp_path, monkeypatch):
    """A partial dump would quietly call every unlisted word a ghost."""
    monkeypatch.setattr(karp.Karp, "_get", paged_fake_get(SALEX_ENTRIES, fail_from=2))
    client = karp.Karp(cache_path=tmp_path / "cache.json")
    client.delay = 0
    assert client.dump(page=2) is None


def test_saolpull_writes_the_list_and_prints_the_licence(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(
        karp.Karp, "_get", paged_fake_get(SALEX_ENTRIES, licence="CC BY 4.0")
    )
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    out = tmp_path / "saol-words.txt"
    code = cli.main(
        ["saolpull", "--out", str(out), "--cache", str(tmp_path / "cache.json")]
    )
    assert code == 0
    assert out.read_text(encoding="utf-8") == "hund\nmur\nsten\nstenmur\n"
    printed = capsys.readouterr().out
    assert 'metadata.license: "CC BY 4.0"' in printed


def test_a_failed_dump_names_the_actual_error(tmp_path, monkeypatch, capsys):
    """A bare None cost a debugging round trip through somebody's terminal."""

    def _get(self, path):
        if path.startswith("/resources/"):
            return {"resource_id": "salex"}
        self.last_error = f"HTTP 422 on {path}: q is required"
        return None

    monkeypatch.setattr(karp.Karp, "_get", _get)
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    code = cli.main(
        ["saolpull", "--out", str(tmp_path / "w.txt"), "--cache", str(tmp_path / "c.json")]
    )
    assert code == 2
    err = capsys.readouterr().err
    assert "last error: HTTP 422" in err
    assert "q is required" in err


def test_saolpull_says_when_no_licence_is_declared(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(karp.Karp, "_get", paged_fake_get(SALEX_ENTRIES))
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    code = cli.main(
        ["saolpull", "--out", str(tmp_path / "w.txt"), "--cache", str(tmp_path / "c.json")]
    )
    assert code == 0
    assert "assume all rights reserved" in capsys.readouterr().out


# ── the saolcheck command ────────────────────────────────────────


def write_days(tmp_path, pairs: dict[str, str]):
    path = tmp_path / "days.json"
    day = {
        "date": "2026-08-07", "no": 1, "start": "sten", "target": "vägg",
        "par": 2, "budget": 4, "pool": ["mur"], "pairs": pairs,
    }
    path.write_text(json.dumps([day], ensure_ascii=False), encoding="utf-8")
    return path


def saolcheck(tmp_path, monkeypatch, vocab, *extra):
    monkeypatch.setattr(karp.Karp, "_get", fake_get(vocab))
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    days = write_days(
        tmp_path, {"sten>mur": "stenmur", "mur>vägg": "murvägg"}
    )
    return cli.main(
        ["saolcheck", "--days", str(days), "--cache", str(tmp_path / "cache.json"), *extra]
    )


def test_saolcheck_passes_a_fully_attested_calendar(tmp_path, monkeypatch, capsys):
    code = saolcheck(
        tmp_path, monkeypatch, {"wf": {"hund", "stenmur", "murvägg", "tidslinje"}}
    )
    assert code == 0
    assert "2 of 2 welds attested" in capsys.readouterr().out


def test_saolcheck_flags_a_shipped_weld_saol_lacks(tmp_path, monkeypatch, capsys):
    code = saolcheck(tmp_path, monkeypatch, {"wf": {"hund", "stenmur", "tidslinje"}})
    assert code == 1
    assert "MISSING  murvägg" in capsys.readouterr().out


def test_saolcheck_flags_a_ghost_saol_actually_knows(tmp_path, monkeypatch, capsys):
    """A ghost Karp attests was buried on a human's misreading — say so."""
    code = saolcheck(
        tmp_path, monkeypatch,
        {"wf": {"hund", "stenmur", "murvägg", "tidslinje", "tomslag"}},
    )
    assert code == 1
    assert "FALSE GHOST  tomslag" in capsys.readouterr().out


def test_saolcheck_warns_when_the_supplement_rests_on_nothing(tmp_path, monkeypatch, capsys):
    code = saolcheck(tmp_path, monkeypatch, {"wf": {"hund", "stenmur", "murvägg"}})
    captured = capsys.readouterr()
    assert code == 0  # a supplement gap warns; it does not block
    assert "tidslinje" in captured.err


def test_saolcheck_reads_a_plain_word_list(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(karp.Karp, "_get", fake_get({"wf": {"hund", "glasbåt", "tidslinje"}}))
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    words = tmp_path / "words.txt"
    words.write_text("# suspects\nglasbåt\nhetslag\n", encoding="utf-8")
    code = cli.main(
        ["saolcheck", "--words", str(words), "--cache", str(tmp_path / "cache.json")]
    )
    assert code == 1
    out = capsys.readouterr().out
    assert "1 of 2 welds attested" in out
    assert "MISSING  hetslag" in out


def test_saolcheck_lists_resources(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(karp.Karp, "_get", fake_get({"wf": set()}))
    monkeypatch.setattr(karp, "COURTESY_DELAY", 0)
    code = cli.main(
        ["saolcheck", "--list-resources", "--cache", str(tmp_path / "cache.json")]
    )
    assert code == 0
    assert "salex" in capsys.readouterr().out
