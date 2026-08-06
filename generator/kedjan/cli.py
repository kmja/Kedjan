"""Command line: propose days, and lint what a human has curated.

    python -m kedjan.cli generate --out candidates.json --first 2026-08-07
    python -m kedjan.cli lint ../public/days.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

from . import curate, days as day_gen, graph as graph_mod, lexicon as lex_mod, saldo as saldo_mod, split


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
    findings = curate.check_calendar(payload, lex)
    _report(findings)

    print(
        f"\n{len(proposed)} days written to {args.out}.\n"
        "HUMAN CURATION PASS REQUIRED before shipping: endpoint taste, tone check,\n"
        "pool sanity. The generator proposes; you decide.",
        file=sys.stderr,
    )
    return 0


def cmd_lint(args: argparse.Namespace) -> int:
    payload = json.loads(Path(args.days).read_text(encoding="utf-8"))
    lex = None
    if args.dic:
        lex = lex_mod.load(args.dic, args.wordlist, args.frequency)
    findings = curate.check_calendar(payload, lex)
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

    lint = sub.add_parser("lint", help="check a curated calendar against the rules")
    lint.add_argument("days", help="path to days.json")
    lint.add_argument("--dic", default=None, help="enable the lexicon-backed weld check")
    lint.add_argument("--wordlist", default=None)
    lint.add_argument("--frequency", default="sv_50k.txt")
    lint.set_defaults(func=cmd_lint)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
