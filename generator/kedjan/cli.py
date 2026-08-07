"""Command line: propose days, and lint what a human has curated.

    python -m kedjan.cli generate --out candidates.json --first 2026-08-07
    python -m kedjan.cli lint ../public/days.json
"""

from __future__ import annotations

import argparse
import json
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
    graph = graph_mod.build(compounds, lex, saldo)
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

    gen = sub.add_parser("generate", parents=[corpus], help="propose candidate days")
    gen.add_argument("--out", default="kedjan-days.json")
    gen.add_argument("--first", default=date.today().isoformat(), help="date of the first day")
    gen.add_argument("--start-no", type=int, default=1, help="puzzle number of the first day")
    gen.add_argument("--par3", type=int, default=4, help="how many par-3 days")
    gen.add_argument("--par4", type=int, default=4, help="how many par-4 days")
    gen.set_defaults(func=cmd_generate)

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
    accept.set_defaults(func=cmd_accept)

    lint = sub.add_parser("lint", help="check a curated calendar against the rules")
    lint.add_argument("days", help="path to days.json")
    lint.add_argument("--dic", default=None, help="enable the lexicon-backed weld check")
    lint.add_argument("--wordlist", default=None)
    lint.add_argument("--frequency", default="sv_50k.txt")
    lint.add_argument("--saldo", default="saldo_2.3/saldo20v03.txt")
    lint.add_argument("--no-lexicon", action="store_true",
                      help="run the structural checks without a dictionary")
    lint.set_defaults(func=cmd_lint)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
