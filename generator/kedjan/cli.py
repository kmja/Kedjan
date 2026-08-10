"""Command line: propose days, and lint what a human has curated.

    python -m kedjan.cli generate --out candidates.json --first 2026-08-07
    python -m kedjan.cli lint ../public/days.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from . import (
    analysis,
    curate,
    days as day_gen,
    graph as graph_mod,
    lexicon as lex_mod,
    saldo as saldo_mod,
    split,
)


def cmd_generate(args: argparse.Namespace) -> int:
    print("reading lexicons…", file=sys.stderr)
    lex = lex_mod.load(args.dic, args.wordlist, args.frequency)
    print(f"  {len(lex.words):,} words, {len(lex.union):,} in the union", file=sys.stderr)

    print("splitting compounds…", file=sys.stderr)
    compounds = split.compounds(lex)
    print(f"  {len(compounds):,} compounds", file=sys.stderr)

    saldo = saldo_mod.load_if_present(args.saldo)
    print(
        f"  SALDO: {len(saldo.pos):,} lemmas" if saldo
        else "  SALDO absent — falling back to the hand-built filters",
        file=sys.stderr,
    )

    print("building the part graph…", file=sys.stderr)
    graph = graph_mod.build(compounds, lex, saldo, lexicalized_only=args.lexicalized)
    print(f"  {len(graph.pairs):,} pairs over {len(graph.hubs):,} hub parts", file=sys.stderr)

    print("generating days…", file=sys.stderr)
    proposed = day_gen.generate(graph, lex, {3: args.par3, 4: args.par4})
    day_gen.schedule(proposed, date.fromisoformat(args.first), args.start_no)

    payload = [d.to_json() for d in proposed]
    Path(args.out).write_text(
        json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    for d in proposed:
        m = d.metrics
        print(
            f"par{d.par} {d.start}→{d.target}: "
            f"{m['valid_pairs']} pairs, {m['solutions']} solutions"
        )
    findings = curate.check_calendar(payload, lex, saldo)
    _report(findings)

    print(
        f"\n{len(proposed)} days written to {args.out}.\n"
        "HUMAN CURATION PASS REQUIRED before shipping: endpoint taste, tone check,\n"
        "pool sanity. The generator proposes; you decide.",
        file=sys.stderr,
    )
    return 0


def cmd_sweep(args: argparse.Namespace) -> int:
    """Rank every day the whole graph can carry. Slow, thorough, exhaustive."""
    from . import sweep as sweep_mod

    print("reading lexicons…", file=sys.stderr)
    lex = lex_mod.load(args.dic, args.wordlist, args.frequency)
    saldo = saldo_mod.load_if_present(args.saldo)
    if saldo is None:
        print("the sweep scores double meanings, which needs SALDO.", file=sys.stderr)
        return 2

    print("splitting compounds…", file=sys.stderr)
    compounds = split.compounds(lex)
    print("building the part graph…", file=sys.stderr)
    graph = graph_mod.build(compounds, lex, saldo, lexicalized_only=args.lexicalized)
    print(f"  {len(graph.pairs):,} pairs over {len(graph.hubs):,} hub parts", file=sys.stderr)

    print("sweeping every start…", file=sys.stderr)
    ranked = sweep_mod.sweep(graph, lex, saldo)
    Path(args.out).write_text(
        json.dumps(ranked, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"{len(ranked)} days ranked, written to {args.out}", file=sys.stderr)

    head = f"{'day':22} {'par':>3} {'score':>6}  {'goldi':>5} {'dens':>5} {'lur':>5} {'dubb':>5} {'fall':>5} {'ordb':>5}  {'sols':>4} {'ind':>3} {'prs':>3}  double meanings"
    print(head)
    print("-" * len(head))
    for d in ranked[: args.top]:
        sub = d["_subscores"]
        homs = ", ".join(d["_homographs"])
        print(
            f"{d['start'] + '→' + d['target']:22} {d['par']:>3} {d['_score']:>6.3f}  "
            f"{sub['goldilocks']:>5.2f} {sub['density']:>5.2f} {sub['deception']:>5.2f} "
            f"{sub['doubleness']:>5.2f} {sub['traps']:>5.2f} {sub['attested']:>5.2f}  "
            f"{d['_metrics']['solutions']:>4} {d['_metrics']['disjoint_routes']:>3} "
            f"{d['_metrics']['valid_pairs']:>3}  {homs}"
        )
    return 0


def _weld_words(args: argparse.Namespace) -> list[str]:
    """The words to verify: a plain list, or every weld the calendar ships."""
    if args.words:
        return sorted(
            {
                w
                for line in Path(args.words).read_text(encoding="utf-8").splitlines()
                if (w := line.strip()) and not w.startswith("#")
            }
        )
    payload = json.loads(Path(args.days).read_text(encoding="utf-8"))
    return sorted({word for day in payload for word in day["pairs"].values()})


def cmd_svenskacheck(args: argparse.Namespace) -> int:
    """Verify every shipped weld against svenska.se itself — SO first.

    The weld links point at svenska.se, so the site is the promise the game
    makes. SO is the dictionary that matters: it has the definitions. The
    verdict file this writes is committed, and `lint` reads it — so a check
    run on any machine with open network hardens the lint everywhere.
    """
    from . import svenska as sv_mod

    trace = (
        (lambda line: print(f"    {line}", file=sys.stderr, flush=True))
        if args.verbose
        else None
    )
    client = sv_mod.Svenska(verdicts_path=args.verdicts, trace=trace)
    client.delay = args.delay

    if args.discover:
        word = args.discover
        print(f"# what svenska.se answers for {word!r}\n")
        print(
            f"{'url':46} {'status':>6} {'bytes':>7} {'vs control':>10} "
            f"{'payload':>7}  shell in-payload"
        )
        rows = client.discover(word)
        for row in rows:
            print(
                f"{row['url'][:46]:46} {str(row['status'] or row['error'])[:6]:>6} "
                f"{row['bytes']:>7} {row['delta']:>+10} {row['payload_bytes']:>7}  "
                f"{'yes' if row['app_shell'] else '  -':5} "
                f"{'yes' if row['word_in_payload'] else '  -'}"
            )
        # The page that grew most when asked about a real word is the one
        # carrying the article. Print its payload: whatever parses these
        # welds next has to be written against it.
        best = max(rows, key=lambda r: (r["word_in_payload"], r["delta"]))
        if best["payload_bytes"]:
            print(f"\n# __NUXT_DATA__ from {best['url']} ({best['payload_bytes']} bytes)")
            print(best["payload"][: args.payload_chars])
        paths = client.sniff_api(word)
        print("\n# paths the site's own scripts name:")
        for path in paths[:40] or ["(none found)"]:
            print(f"  {path}")
        return 0

    if args.probe:
        html = client.probe(args.probe, args.dictionary)
        if html is None:
            print(client.last_error, file=sys.stderr)
            return 2
        said = {True: "article", False: "no-hit page", None: "UNREADABLE"}[
            sv_mod.reading(html)
        ]
        print(f"# f_{args.dictionary} {args.probe}: {len(html)} bytes, read as {said}")
        print(html[:3000])
        return 0

    if client.discarded:
        print(
            f"{client.discarded} verdict(s) in {args.verdicts} came from an older "
            "probe and were discarded — they are evidence about that probe, not "
            "about the words. They will be asked again.",
            file=sys.stderr,
            flush=True,
        )

    # Before asking about five hundred unknown words, ask about three known
    # ones. The first live run of this check reported every weld missing,
    # badrum and ordbok among them, because the parser had lost the site —
    # and nothing in the output said so.
    if not args.no_selftest:
        failed = client.selftest()
        if failed:
            print(
                "the probe cannot read svenska.se: "
                f"{', '.join(failed)} came back as anything but an article, and "
                "SO certainly has them. Every verdict from this run would be "
                f"noise. Run `--probe {failed[0]}` to see what the site is "
                "serving, fix the reading in svenska.py, and try again.",
                file=sys.stderr,
            )
            if client.last_error:
                print(f"last error: {client.last_error}", file=sys.stderr)
            return 2
        print(
            f"probe checked against {', '.join(sv_mod.CANARIES)} — the site "
            "still reads.",
            file=sys.stderr,
            flush=True,
        )

    words = _weld_words(args)
    cached = [w for w in words if w in client.verdicts]
    fresh = len(words) - len(cached)
    # Two requests per new word, a courtesy delay before each: say up front
    # what the wait will be, because half an hour of silence reads as a hang.
    minutes = fresh * 2 * (args.delay + 0.3) / 60
    print(
        f"{len(words)} welds: {len(cached)} already in {args.verdicts}, "
        f"{fresh} to ask svenska.se about — roughly {minutes:.0f} min at "
        f"--delay {args.delay}. Verdicts are saved word by word; Ctrl-C "
        "loses nothing.",
        file=sys.stderr,
        flush=True,
    )

    so_ok, saol_only, missing, unanswered = [], [], [], []
    for i, word in enumerate(words, 1):
        was_cached = word in client.verdicts
        verdict = client.lookup(word)
        if verdict is None:
            unanswered.append(word)
            mark = "?!"
        elif verdict["so"]:
            so_ok.append(word)
            mark = "SO"
        elif verdict["saol"]:
            saol_only.append(word)
            mark = "saol"
        else:
            missing.append(word)
            mark = "MISS"
        print(
            f"[{i}/{len(words)}] {word:24} {mark}{' (cached)' if was_cached else ''}",
            file=sys.stderr,
            flush=True,
        )
        if verdict is None and client.last_error:
            print(f"    {client.last_error}", file=sys.stderr, flush=True)
        if mark == "SO" and not was_cached:
            definition = getattr(client, "last_definition", None)
            if definition:
                print(f"SO       {word} — {definition}", flush=True)

    total = len(so_ok) + len(saol_only) + len(missing) + len(unanswered)
    print(f"\n{len(so_ok)} of {total} welds in SO.")
    for word in saol_only:
        print(f"SAOL ONLY  {word} — the link lives, but shows no definition")
    for word in missing:
        print(f"MISSING    {word} — svenska.se has no entry. The weld link breaks.")
    for word in unanswered:
        print(f"?          {word} — no answer", file=sys.stderr)
    if unanswered and client.last_error:
        print(f"last error: {client.last_error}", file=sys.stderr)

    if missing:
        return 1
    if unanswered:
        return 2
    return 0


def cmd_saolcheck(args: argparse.Namespace) -> int:
    """Ask Karp — Språkbanken's lexical API — whether the welds are in SAOL.

    Every ghost so far was found by a player-shaped human tapping a weld word
    and getting an empty svenska.se page. This asks the same question in bulk,
    before shipping. The development sandbox cannot reach spraakbanken.gu.se;
    run this from CI or a developer machine.
    """
    from . import karp as karp_mod

    client = karp_mod.Karp(
        resources=args.resources, cache_path=args.cache, api_key=args.api_key
    )

    if args.list_resources:
        ids = client.list_resources()
        if ids is None:
            print("could not reach Karp — is the network open?", file=sys.stderr)
            return 2
        # Protection decides what a key-less caller can actually query, so
        # the listing is only useful with that column on it.
        perms = client.permissions() or {}
        for rid in ids:
            state = "protected" if perms.get(rid) else "open" if rid in perms else "?"
            print(f"{rid:40} {state}")
        return 0

    words = _weld_words(args)
    attested, missing, unanswered = [], [], []
    for word in words:
        verdict = client.lookup(word)
        if verdict is None:
            unanswered.append(word)
        elif verdict:
            attested.append(word)
        else:
            missing.append(word)

    print(f"{len(attested)} of {len(words)} welds attested in {args.resources}.")
    for word in missing:
        print(f"MISSING  {word} — shipped, but {args.resources} has no entry. Ghost?")
    for word in unanswered:
        print(f"?        {word} — Karp gave no answer", file=sys.stderr)
    if unanswered and client.last_error:
        print(f"last error: {client.last_error}", file=sys.stderr)

    # The exception lists must keep earning their keep in both directions:
    # a ghost that Karp *does* know is a ghost wrongly buried, and a
    # supplement word Karp lacks is a supplement resting on nothing.
    false_ghosts = [g for g in sorted(lex_mod.GHOST_WORDS) if client.lookup(g)]
    for g in false_ghosts:
        print(f"FALSE GHOST  {g} — on GHOST_WORDS, yet {args.resources} attests it.")
    for s in sorted(lex_mod.LEXICALIZED_SUPPLEMENT):
        if client.lookup(s) is False:
            print(
                f"warning: supplement word {s} is not in {args.resources} either",
                file=sys.stderr,
            )

    if missing or false_ghosts:
        return 1
    if unanswered:
        return 2
    return 0


def _licence_lines(info: dict, prefix: str = "") -> list[str]:
    """Every key that smells like licence terms, with its path and value."""
    lines = []
    for key, value in info.items():
        path = f"{prefix}{key}"
        if "licen" in key.lower():
            lines.append(f"{path}: {json.dumps(value, ensure_ascii=False)}")
        elif isinstance(value, dict):
            lines.extend(_licence_lines(value, f"{path}."))
    return lines


def cmd_saolpull(args: argparse.Namespace) -> int:
    """Pull every written form in the lexicon and store it as a word list.

    That turns SAOL from something we ask about one word at a time into a
    local witness corpus: exact ghost detection over the whole graph, welds
    gated on real academy membership, no per-word queries.

    The word list is SAOL's material, not ours, so it is written to a
    gitignored path and the resource's own metadata is printed before the
    pull — read what it says about licensing before the file goes anywhere
    beyond this working copy.
    """
    from . import karp as karp_mod

    client = karp_mod.Karp(
        resources=args.resources, cache_path=args.cache, api_key=args.api_key
    )

    for rid in args.resources.split(","):
        info = client.resource_info(rid)
        if info is None:
            print(f"could not read metadata for {rid} — is the network open?", file=sys.stderr)
            return 2
        terms = _licence_lines(info)
        print(f"resource {rid}:")
        for line in terms:
            print(f"  {line}")
        if not terms:
            print("  metadata declares no licence field — assume all rights reserved:")
            print(f"  {json.dumps(info, ensure_ascii=False)[:600]}")

    words = client.dump(
        page=args.page,
        progress=lambda done, total: print(f"  {done}/{total}", file=sys.stderr),
    )
    if words is None:
        print("the dump did not complete — nothing written.", file=sys.stderr)
        if client.last_error:
            print(f"last error: {client.last_error}", file=sys.stderr)
        return 2

    Path(args.out).write_text("\n".join(words) + "\n", encoding="utf-8")
    print(f"{len(words)} distinct written forms from {args.resources} → {args.out}")
    return 0


def cmd_review(args: argparse.Namespace) -> int:
    """Print what a curator has to judge, and nothing else.

    The measurable part is a table; the part that needs a human — pool sanity
    and tone — is the pool printed in full, read aloud.
    """
    payload = json.loads(Path(args.days).read_text(encoding="utf-8"))
    saldo = saldo_mod.load_if_present(args.saldo)

    head = (
        f"{'day':18} {'par':>3} {'sols':>4} {'indep':>5} {'cross':>5} "
        f"{'open':>4} {'clos':>4} {'branching':>12}"
    )
    print(head)
    print("-" * len(head))
    reports = []
    for day in payload:
        r = analysis.report(day, saldo)
        reports.append((day, r))
        print(
            f"{r.label:18} {r.par:>3} {len(r.solutions):>4} {r.disjoint_routes:>5} "
            f"{r.min_cross_links:>5} {len(r.openings):>4} {len(r.closings):>4} "
            f"{str(r.branching):>12}"
        )

    for day, r in reports:
        print(f"\n{r.label}  ·  par {r.par}, budget {r.budget}")
        print(f"  pool    {', '.join(r.pool)}")
        print(f"  best    {analysis.spell(day, r.solutions[0]) if r.solutions else '—'}")
        print(
            f"  routes  {len(r.solutions)} solutions, {r.disjoint_routes} independent"
            f", cross-links {r.route_cross_links}"
        )
        print(f"  opens   {', '.join(r.winning_openings)} lead to a win")
        if r.centre:
            print(f"  about   {', '.join(r.centre)}")
        if saldo:
            multi = [
                f"{part} ({'/'.join(senses)})"
                for part in r.pool
                if (senses := saldo.homograph_senses(part))
            ]
            if multi:
                print(f"  senses  {', '.join(multi)}")
        if r.bottlenecks:
            print(f"  funnel  every solution uses {', '.join(r.bottlenecks)}")
        # Glosses are the evidence behind a judgement: SALDO's descriptor pair
        # is usually a compound's own analysis, so a gloss that has nothing to
        # do with the claimed parts is the tell.
        on_path = sorted(
            {
                day["pairs"][f"{a}>{b}"]
                for route in r.solutions
                for a, b in zip(
                    [day["start"], *route], [*route, day["target"]]
                )
            }
        )
        print("  words")
        for word in on_path:
            gloss = saldo.gloss(word) if saldo else None
            print(f"          {word:16} {gloss or '— no SALDO entry'}")

    print(
        "\nRead every pool aloud. A chip you would not use in a sentence is a\n"
        "splitter artefact; a pool that reads as one closed class is arithmetic.\n"
        "Tone and endpoint taste are yours — the table cannot see them."
    )
    return 0


def _write_glosses(days: list[dict], saldo: saldo_mod.Saldo | None, out: Path) -> int:
    """Emit the glosses for every shipped weld, for the in-game test panel.

    Kept out of days.json deliberately: a player never sees these, and the
    calendar is fetched by everyone.
    """
    if saldo is None:
        return 0
    glosses = {
        word: gloss
        for day in days
        for word in day["pairs"].values()
        if (gloss := saldo.gloss(word))
    }
    out.write_text(json.dumps(glosses, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return len(glosses)


def cmd_accept(args: argparse.Namespace) -> int:
    """Promote chosen candidates into the shipped calendar, and log the rest.

    Curation used to be a throwaway script, which meant the reasons for a cut
    lived only in whoever ran it. Rejections are recorded here so a reason that
    recurs can graduate into a rule.
    """
    candidates = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    by_start = {d["start"]: d for d in candidates}
    missing = [p for p in args.pick if p not in by_start]
    if missing:
        print(f"no candidate starting with: {', '.join(missing)}", file=sys.stderr)
        return 2

    reasons = dict(r.split("=", 1) for r in args.reject if "=" in r)
    first = date.fromisoformat(args.first)
    chosen = []
    for offset, start in enumerate(args.pick):
        d = dict(by_start[start])
        d.pop("_metrics", None)
        d["date"] = (first + timedelta(days=offset)).isoformat()
        d["no"] = args.start_no + offset
        chosen.append(
            {k: d[k] for k in ("date", "no", "start", "target", "par", "budget", "pool", "pairs")}
        )

    lex = lex_mod.load(args.dic, args.wordlist, args.frequency) if args.dic else None
    saldo = saldo_mod.load_if_present(args.saldo)
    findings = curate.check_calendar(chosen, lex, saldo)
    findings += _svenska_findings(chosen, args.svenska_verdicts)
    _report(findings)
    if curate.blocking(findings):
        print("blocking findings — nothing written.", file=sys.stderr)
        return 1

    Path(args.out).write_text(
        json.dumps(chosen, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )

    ledger_path = Path(args.ledger)
    ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else []
    for d in candidates:
        ledger.append(
            {
                "start": d["start"],
                "target": d["target"],
                "par": d["par"],
                "accepted": d["start"] in args.pick,
                "reason": reasons.get(d["start"], ""),
                "metrics": d.get("_metrics", {}),
            }
        )
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    total = sum(len(d["pairs"]) for d in chosen)
    n = _write_glosses(chosen, saldo, Path(args.out).with_name("glosses.json"))
    print(f"glosses written for {n} of {total} welds")

    for d in chosen:
        print(f"#{d['no']} {d['date']} {d['start']}→{d['target']} par{d['par']}")
    print(f"\n{len(chosen)} accepted, {len(candidates) - len(chosen)} logged as rejected.")

    # A reason that recurs is a rule waiting to be written. Say so out loud —
    # tok- was rejected by hand twice before it became a rule, and nobody
    # noticed until the ledger was read back months of edits later.
    repeats = _recurring_rejections(ledger)
    if repeats:
        print("\nRejected before, for a reason that has now recurred:", file=sys.stderr)
        for start, reasons in repeats.items():
            print(f"  {start}: {'; '.join(reasons)}", file=sys.stderr)
        print(
            "  Consider encoding these as rules rather than re-deciding them.",
            file=sys.stderr,
        )
    return 0


def _recurring_rejections(ledger: list[dict]) -> dict[str, list[str]]:
    """Starts rejected more than once, with the distinct reasons given."""
    seen: dict[str, list[str]] = {}
    for entry in ledger:
        if entry.get("accepted") or not entry.get("reason"):
            continue
        seen.setdefault(entry["start"], []).append(entry["reason"])
    return {
        start: sorted(set(reasons))
        for start, reasons in seen.items()
        if len(reasons) > 1
    }


def _svenska_findings(payload: list[dict], path_str: str) -> list[curate.Finding]:
    """svenska.se verdicts folded into a lint, when a check has been run."""
    path = Path(path_str)
    if not path.exists():
        print(
            "note: no svenska.se verdicts on disk — welds unverified against the\n"
            "site the weld links point at. Run svenskacheck where the network is open.",
            file=sys.stderr,
        )
        return []
    from . import svenska as sv_mod

    stored = json.loads(path.read_text(encoding="utf-8"))
    if stored.get("_probe") != sv_mod.PROBE_VERSION:
        # A verdict is only as good as the probe that took it, and one of
        # those has already condemned every weld in the calendar over a
        # parser fault. An older file is ignored, loudly.
        print(
            f"note: {path} was written by an older probe and says nothing "
            "about these welds. Re-run svenskacheck where the network is open.",
            file=sys.stderr,
        )
        return []
    verdicts = {k: v for k, v in stored.items() if not k.startswith("_")}
    return curate.check_svenska(payload, verdicts)


def cmd_lint(args: argparse.Namespace) -> int:
    payload = json.loads(Path(args.days).read_text(encoding="utf-8"))
    lex = None
    if args.dic:
        lex = lex_mod.load(args.dic, args.wordlist, args.frequency)
    elif not args.no_lexicon:
        print(
            "refusing to lint without a dictionary: the weld check is the one that\n"
            "catches a compound that does not exist. Pass --dic, or --no-lexicon to\n"
            "run the structural checks alone.",
            file=sys.stderr,
        )
        return 2
    saldo = saldo_mod.load_if_present(args.saldo)
    findings = curate.check_calendar(payload, lex, saldo)
    findings += _svenska_findings(payload, args.svenska_verdicts)
    _report(findings)
    if curate.blocking(findings):
        return 1
    print(f"{len(payload)} days, no blocking findings.")
    return 0


def _report(findings: list[curate.Finding]) -> None:
    if not findings:
        return
    print(file=sys.stderr)
    for finding in findings:
        print(finding, file=sys.stderr)
    errors = len(curate.blocking(findings))
    print(
        f"\n{errors} error(s), {len(findings) - errors} warning(s).",
        file=sys.stderr,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kedjan", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    corpus = argparse.ArgumentParser(add_help=False)
    corpus.add_argument("--dic", default="sv_SE.dic", help="Swedish hunspell word list")
    corpus.add_argument("--wordlist", default=None, help="optional supplementary word list")
    corpus.add_argument("--frequency", default="sv_50k.txt", help="hermitdave FrequencyWords")
    corpus.add_argument("--saldo", default="saldo_2.3/saldo20v03.txt",
                        help="Språkbanken SALDO, the lemma inventory")
    corpus.add_argument("--lexicalized", action="store_true",
                        help="welds must be SALDO lemmas, not just spellable strings")

    gen = sub.add_parser("generate", parents=[corpus], help="propose candidate days")
    gen.add_argument("--out", default="kedjan-days.json")
    gen.add_argument("--first", default=date.today().isoformat(), help="date of the first day")
    gen.add_argument("--start-no", type=int, default=1, help="puzzle number of the first day")
    gen.add_argument("--par3", type=int, default=4, help="how many par-3 days")
    gen.add_argument("--par4", type=int, default=4, help="how many par-4 days")
    gen.set_defaults(func=cmd_generate)

    sw = sub.add_parser("sweep", parents=[corpus], help="rank every day the graph can carry")
    sw.add_argument("--out", default="sweep.json")
    sw.add_argument("--top", type=int, default=30, help="rows to print")
    sw.set_defaults(func=cmd_sweep)

    sv = sub.add_parser(
        "svenskacheck",
        help="verify every shipped weld against svenska.se, SO first (needs open network)",
    )
    sv.add_argument("--days", default="../public/days.json", help="calendar to verify")
    sv.add_argument("--words", default=None,
                    help="check a plain word list (one per line) instead of the calendar")
    sv.add_argument("--verdicts", default="svenska-verdicts.json",
                    help="verdict file, committed so lint can read it everywhere")
    sv.add_argument("--discover", default=None, metavar="WORD",
                    help="ask every plausible URL about one word and report "
                         "what each answers — for when the site is rebuilt")
    sv.add_argument("--payload-chars", type=int, default=2500,
                    help="how much of the server-rendered payload --discover "
                         "prints")
    sv.add_argument("--no-selftest", action="store_true",
                    help="skip the canary words that prove the parser still "
                         "reads the site")
    sv.add_argument("--probe", default=None, metavar="WORD",
                    help="print the raw fragment for one word, to calibrate the parser")
    sv.add_argument("--dictionary", default="so", choices=("so", "saol", "saob"),
                    help="which dictionary --probe asks")
    sv.add_argument("--delay", type=float, default=1.0,
                    help="seconds between requests — it is somebody's website")
    sv.add_argument("--verbose", action="store_true",
                    help="print every HTTP request with timing and outcome")
    sv.set_defaults(func=cmd_svenskacheck)

    sc = sub.add_parser(
        "saolcheck",
        help="verify every shipped weld against SAOL via Karp (needs open network)",
    )
    sc.add_argument("--days", default="../public/days.json", help="calendar to verify")
    sc.add_argument("--words", default=None,
                    help="check a plain word list (one per line) instead of the calendar")
    sc.add_argument("--resources", default="salex",
                    help="comma-separated Karp lexicon ids to query")
    sc.add_argument("--cache", default="karp-cache.json",
                    help="where answers are remembered between runs")
    sc.add_argument("--list-resources", action="store_true",
                    help="print the lexicon ids this Karp serves, open or protected, then stop")
    sc.add_argument("--api-key", default=os.environ.get("KARP_API_KEY"),
                    help="Språkbanken API key for protected resources "
                         "(default: $KARP_API_KEY)")
    sc.set_defaults(func=cmd_saolcheck)

    sp = sub.add_parser(
        "saolpull",
        help="pull every written form in a Karp lexicon into a local word list",
    )
    sp.add_argument("--resources", default="salex", help="Karp lexicon ids to dump")
    sp.add_argument("--out", default="saol-words.txt", help="where the word list lands")
    sp.add_argument("--page", type=int, default=500, help="entries per request")
    sp.add_argument("--cache", default="karp-cache.json")
    sp.add_argument("--api-key", default=os.environ.get("KARP_API_KEY"),
                    help="Språkbanken API key for protected resources "
                         "(default: $KARP_API_KEY)")
    sp.set_defaults(func=cmd_saolpull)

    review = sub.add_parser("review", help="print what a curator has to judge")
    review.add_argument("days", help="path to candidates.json or days.json")
    review.add_argument("--saldo", default="saldo_2.3/saldo20v03.txt")
    review.set_defaults(func=cmd_review)

    accept = sub.add_parser(
        "accept", parents=[corpus], help="promote chosen candidates into the calendar"
    )
    accept.add_argument("candidates", help="path to candidates.json")
    accept.add_argument("--pick", nargs="+", required=True, metavar="START",
                        help="start words of the days to ship, in calendar order")
    accept.add_argument("--reject", nargs="*", default=[], metavar="START=REASON",
                        help="why a candidate was cut, for the ledger")
    accept.add_argument("--first", required=True, help="date of the first accepted day")
    accept.add_argument("--start-no", type=int, default=1)
    accept.add_argument("--out", default="../public/days.json")
    accept.add_argument("--ledger", default="curation-log.json")
    accept.add_argument("--svenska-verdicts", default="svenska-verdicts.json")
    accept.set_defaults(func=cmd_accept)

    lint = sub.add_parser("lint", help="check a curated calendar against the rules")
    lint.add_argument("days", help="path to days.json")
    lint.add_argument("--dic", default=None, help="enable the lexicon-backed weld check")
    lint.add_argument("--wordlist", default=None)
    lint.add_argument("--frequency", default="sv_50k.txt")
    lint.add_argument("--saldo", default="saldo_2.3/saldo20v03.txt")
    lint.add_argument("--no-lexicon", action="store_true",
                      help="run the structural checks without a dictionary")
    lint.add_argument("--svenska-verdicts", default="svenska-verdicts.json")
    lint.set_defaults(func=cmd_lint)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
