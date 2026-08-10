"""svenska.se is somebody's public website — everything here runs against
canned fragments shaped like the site's per-dictionary article endpoints."""

from __future__ import annotations

import json

from kedjan import cli, curate, svenska
from kedjan.curate import Level

ARTICLE = '<div class="artikel"><span class="def">mur av sten</span></div>'
#: The same article with the class keeping company, which is the shape that
#: broke the first live run.
ARTICLE_WITH_COMPANY = (
    '<div class="artikel so lang"><span class="def ordklass">mur av sten</span></div>'
)
NO_HIT = "<p>Sökningen gav inga svar</p>"
#: Neither one: a redirect stub, a cookie wall, a rewritten site.
UNREADABLE = "<html><body><script>location.href='/'</script></body></html>"
#: What svenska.se actually serves now — a client-rendered app, whatever
#: word is asked for.
APP_SHELL = (
    '<!DOCTYPE html><html lang="sv"><head>'
    '<link rel="stylesheet" href="/_nuxt/entry.B_I1Lyzb.css">'
    '<script id="__NUXT_DATA__" type="application/json">[]</script>'
    "</head><body><div id=\"__nuxt\"></div></body></html>"
)


def fake_fetch(so: set[str], saol: set[str], article: str = ARTICLE):
    """A site that knows the canaries, plus whatever the test says."""

    def _fetch(self, dictionary, word):
        _fetch.calls.append((dictionary, word))
        vocab = (so | set(svenska.CANARIES)) if dictionary == "so" else saol
        return article if word in vocab else NO_HIT

    _fetch.calls = []
    return _fetch


def make_client(tmp_path, monkeypatch, so, saol):
    monkeypatch.setattr(svenska.Svenska, "_fetch", fake_fetch(so, saol))
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    return client


def test_an_article_is_recognised_however_its_class_keeps_company():
    assert svenska.reading(ARTICLE) is True
    assert svenska.reading(ARTICLE_WITH_COMPANY) is True
    assert svenska.reading(NO_HIT) is False


def test_a_page_that_is_neither_is_no_verdict_at_all():
    """The bug that condemned a calendar: absence of a hit is not a miss."""
    assert svenska.reading(UNREADABLE) is None


def test_the_app_shell_is_named_for_what_it_is(tmp_path, monkeypatch):
    """The endpoint is gone, which is not the same as the word being gone."""
    monkeypatch.setattr(svenska.Svenska, "_fetch", lambda self, d, w: APP_SHELL)
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    assert client.lookup("ordbok") is None
    assert "app shell" in (client.last_error or "")
    assert "client-rendered" in (client.last_error or "")


def test_an_unreadable_answer_is_never_cached_as_missing(tmp_path, monkeypatch):
    monkeypatch.setattr(svenska.Svenska, "_fetch", lambda self, d, w: UNREADABLE)
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    assert client.lookup("stenmur") is None
    assert "unreadable" in (client.last_error or "")
    assert not (tmp_path / "verdicts.json").exists()


def test_verdicts_from_an_older_probe_are_discarded(tmp_path):
    path = tmp_path / "verdicts.json"
    path.write_text(
        json.dumps({"stenmur": {"so": False, "saol": False}}), encoding="utf-8"
    )
    client = svenska.Svenska(verdicts_path=path)
    assert client.verdicts == {}
    assert client.discarded == 1


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
    days = write_days(tmp_path, {"a>b": "stenmur", "b>c": "murvägg"})
    return cli.main(
        [
            "svenskacheck",
            "--days", str(days),
            "--verdicts", str(tmp_path / "verdicts.json"),
            "--delay", "0",
        ]
    )


def test_the_run_refuses_to_start_when_the_canaries_do_not_answer(
    tmp_path, monkeypatch, capsys
):
    """Five hundred missing words is a broken parser, not a broken calendar."""
    monkeypatch.setattr(svenska.Svenska, "_fetch", lambda self, d, w: UNREADABLE)
    days = write_days(tmp_path, {"a>b": "stenmur"})
    code = cli.main(
        [
            "svenskacheck",
            "--days", str(days),
            "--verdicts", str(tmp_path / "verdicts.json"),
            "--delay", "0",
        ]
    )
    assert code == 2
    err = capsys.readouterr().err
    assert "cannot read svenska.se" in err
    assert "MISSING" not in capsys.readouterr().out


def test_svenskacheck_passes_when_so_carries_every_weld(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur", "murvägg"}, saol=set())
    assert code == 0
    captured = capsys.readouterr()
    assert "2 of 2 welds in SO." in captured.out
    # A run this long must narrate itself: a plan up front, a line per word.
    assert "2 to ask svenska.se about" in captured.err
    assert "[1/2] murvägg" in captured.err
    assert "[2/2] stenmur" in captured.err


def test_svenskacheck_fails_on_a_weld_the_site_lacks(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur"})
    assert code == 1
    out = capsys.readouterr().out
    assert "MISSING    murvägg" in out


def test_svenskacheck_marks_saol_only_welds_without_failing(tmp_path, monkeypatch, capsys):
    code = svenskacheck(tmp_path, monkeypatch, so={"stenmur"}, saol={"stenmur", "murvägg"})
    assert code == 0
    assert "SAOL ONLY  murvägg" in capsys.readouterr().out


def test_lint_ignores_verdicts_an_older_probe_wrote(tmp_path, capsys):
    """The file the broken run left behind must not condemn the calendar."""
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
    assert code == 0
    assert "written by an older probe" in capsys.readouterr().err


def test_lint_reads_the_committed_verdicts(tmp_path, monkeypatch, capsys):
    """A verdict written on one machine blocks the lint on every machine."""
    from test_curate import a_day

    days = tmp_path / "days.json"
    days.write_text(json.dumps([a_day()]), encoding="utf-8")
    verdicts = tmp_path / "verdicts.json"
    verdicts.write_text(
        json.dumps(
            {
                "_probe": svenska.PROBE_VERSION,
                "stenmur": {"so": False, "saol": False},
            }
        ),
        encoding="utf-8",
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


SSR_PAGE = (
    APP_SHELL[: APP_SHELL.index("<script")]
    + '<script id="__NUXT_DATA__" type="application/json">'
    + '["Reactive",{"ord":1},"ordbok"]'
    + "</script></head><body></body></html>"
)


def test_discover_reports_what_each_candidate_answered(tmp_path, monkeypatch):
    """Evidence, not a guess: every plausible URL, and what came back."""
    answers = {
        "https://svenska.se/tri/f_so.php?sok=ordbok": (APP_SHELL, 200, None),
        "https://svenska.se/api/so?sok=ordbok": ('{"artikel": 1}', 200, None),
    }
    monkeypatch.setattr(
        svenska.Svenska,
        "_raw",
        lambda self, url: answers.get(url, (None, 404, None)),
    )
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    rows = {r["url"]: r for r in client.discover("ordbok")}

    shell = rows["https://svenska.se/tri/f_so.php?sok=ordbok"]
    assert shell["app_shell"] and shell["reads_as"] == "neither"
    api = rows["https://svenska.se/api/so?sok=ordbok"]
    assert api["json"] and not api["app_shell"]
    assert rows["https://svenska.se/so/ordbok"]["status"] == 404


def test_sniff_api_reads_the_paths_the_app_names(tmp_path, monkeypatch):
    page = '<link rel="modulepreload" as="script" href="/_nuxt/entry.js">'
    js = 'fetch("/api/artikel/so",{}) // and "/tri/legacy.php"'
    monkeypatch.setattr(
        svenska.Svenska,
        "_raw",
        lambda self, url: ((js, 200, None) if url.endswith(".js") else (page, 200, None)),
    )
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    assert client.sniff_api("ordbok") == ["/api/artikel/so", "/tri/legacy.php"]


def test_discover_measures_a_page_against_a_word_no_dictionary_holds(
    tmp_path, monkeypatch
):
    """A page that grows when asked about ordbok is carrying an article."""

    def raw(self, url):
        if "sok=" not in url:
            return APP_SHELL, 200, None
        return (SSR_PAGE if "ordbok" in url else APP_SHELL), 200, None

    monkeypatch.setattr(svenska.Svenska, "_raw", raw)
    client = svenska.Svenska(verdicts_path=tmp_path / "verdicts.json")
    client.delay = 0
    rows = {r["url"]: r for r in client.discover("ordbok")}

    grew = rows["https://svenska.se/so/?sok=ordbok"]
    assert grew["delta"] > 0
    assert grew["word_in_payload"]
    # The path form carries no query, so it answers the same shell either way.
    assert rows["https://svenska.se/so/ordbok"]["delta"] == 0


def test_interesting_path_keeps_endpoints_and_drops_assets():
    assert svenska.interesting_path("/api/artikel/so")
    assert svenska.interesting_path("https://api.example.se/v1/sok")
    assert not svenska.interesting_path("/_nuxt/entry.B_I1Lyzb.js")
    assert not svenska.interesting_path("/img/saol.png")
