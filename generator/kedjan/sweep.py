"""Exhaustive search for the best days the whole graph can offer.

`generate` walks hubs in degree order and stops when it has enough, so most of
the graph is never looked at — it finds *acceptable* days near the top of the
degree list, not the best days anywhere. The sweep builds every day every
usable start can carry, at both pars, and ranks them.

The score makes explicit four judgements curation has been applying by hand:

  goldilocks   solution count low — two to four winning routes, still
               genuinely independent of each other. The first archive proved
               that generous solution counts make walkover days: a pool with
               eight escapes hands one over
  density      many welds among the pool chips, entangled across routes, no
               chip stranded inside its own route — the pool should read as one
               fabric, not as islands
  deception    the share of valid welds that lie on no winning route. This is
               the difficulty dial the archive was missing: welds must be easy
               to make and hard to make *count* — many welds, few escapes
  doubleness   pool chips SALDO records under more than one sense — kör the
               choir against kör the drive — which is where the game's best
               misdirection lives, because a player who has priced a chip under
               one reading has not priced it at all

Days that fail a blocking curation check are dropped before ranking, so the
list only ever contains days that `accept` would take. Taste — tone, register,
endpoint appeal — still belongs to the human reading the result.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from multiprocessing import Pool

from . import curate
from .analysis import DayReport, report
from .days import Day, build_day, distances_from, usable_endpoint
from .graph import PartGraph
from .lexicon import Lexicon
from .saldo import Saldo

#: The solution band is 2-6; its sweet bottom. One route is a single line to
#: find; past four the escapes multiply faster than the deduction does.
SWEET_SOLUTIONS = range(2, 5)
#: Independent routes saturate here — routes consume pool, and the longer the
#: par the fewer truly disjoint routes a pool this size can carry.
INDEP_CAP = {3: 4, 4: 3, 5: 2}
#: The healthy valid-pairs band is 20-30; its sweet middle.
SWEET_PAIRS = range(24, 31)
#: Route entanglement saturates here.
CROSS_CAP = 5
#: A fifth double-reading chip stops adding misdirection the fourth had.
HOMOGRAPH_CAP = 4

#: Deception is the share of valid welds on no winning route: full marks when
#: three quarters of the fabric leads nowhere, nothing below two fifths.
DECEPTION_FLOOR = 0.4
DECEPTION_CEILING = 0.75

WEIGHTS = {
    "goldilocks": 0.30,
    "density": 0.25,
    "deception": 0.25,
    "doubleness": 0.20,
}


def _band(x: int, lo: int, sweet: range, hi: int) -> float:
    """1.0 inside the sweet range, ramping linearly to 0.0 at the hard edges."""
    if x in sweet:
        return 1.0
    if x <= lo or x >= hi:
        return 0.0
    if x < sweet.start:
        return (x - lo) / (sweet.start - lo)
    return (hi - x) / (hi - (sweet.stop - 1))


@dataclass
class Scored:
    day: Day
    report: DayReport
    subscores: dict[str, float]
    homographs: dict[str, list[str]]

    @property
    def score(self) -> float:
        return sum(WEIGHTS[k] * v for k, v in self.subscores.items())

    def to_json(self) -> dict[str, object]:
        payload = self.day.to_json()
        payload["_score"] = round(self.score, 4)
        payload["_subscores"] = {k: round(v, 3) for k, v in self.subscores.items()}
        payload["_homographs"] = self.homographs
        return payload


def score_day(day: Day, rep: DayReport, saldo: Saldo) -> Scored:
    sols = len(rep.solutions)
    cap = INDEP_CAP[day.par]
    goldilocks = (
        _band(sols, 1, SWEET_SOLUTIONS, 7) + min(rep.disjoint_routes, cap) / cap
    ) / 2

    entangled = min(rep.min_cross_links, CROSS_CAP) / CROSS_CAP
    density = (
        _band(day.metrics["valid_pairs"], 17, SWEET_PAIRS, 35) + entangled
    ) / 2 - 0.2 * len(rep.isolated_chips)

    # Welds that lead somewhere, counted once; everything else is fabric that
    # welds but does not win — which is where the difficulty lives.
    on_route = {
        f"{a}>{b}"
        for route in rep.solutions
        for a, b in zip([day.start, *route], [*route, day.target])
    }
    valid = day.metrics["valid_pairs"]
    off_share = 1 - len(on_route) / valid if valid else 0.0
    deception = min(
        1.0, max(0.0, (off_share - DECEPTION_FLOOR) / (DECEPTION_CEILING - DECEPTION_FLOOR))
    )

    homographs = {
        p: senses
        for p in day.pool
        if len(senses := saldo.homograph_senses(p)) >= 2
    }
    doubleness = min(len(homographs), HOMOGRAPH_CAP) / HOMOGRAPH_CAP

    return Scored(
        day=day,
        report=rep,
        subscores={
            "goldilocks": goldilocks,
            "density": max(0.0, density),
            "deception": deception,
            "doubleness": doubleness,
        },
        homographs=homographs,
    )


# Workers inherit these by fork — the graph is too large to pickle per task.
_G: PartGraph | None = None
_LEX: Lexicon | None = None
_SALDO: Saldo | None = None


def _init(graph: PartGraph, lex: Lexicon, saldo: Saldo) -> None:
    global _G, _LEX, _SALDO
    _G, _LEX, _SALDO = graph, lex, saldo


def _sweep_start(start: str) -> list[dict[str, object]]:
    """Every acceptable day from one start, both pars, scored."""
    assert _G and _LEX and _SALDO
    out = []
    distances = distances_from(_G, start)
    # Par 3 is retired: even at two escapes a three-link day is over before the
    # pool gets to lie. Length is the other half of the difficulty.
    for par in (4, 5):
        for target, distance in distances.items():
            if distance != par or not usable_endpoint(_LEX, _G, target):
                continue
            if _G.welds(start, target) or _G.welds(target, start):
                continue
            day = build_day(_G, _LEX, start, target, par)
            if day is None:
                continue
            # Only days `accept` would take belong in a ranking — a high score
            # on a day the lint refuses is noise.
            payload = day.to_json()
            payload["date"] = "2026-01-01"
            if curate.blocking(curate.check_day(payload, _LEX, _SALDO)):
                continue
            scored = score_day(day, report(payload, _SALDO), _SALDO)
            entry = scored.to_json()
            entry["date"] = ""
            out.append(entry)
    return out


def sweep(graph: PartGraph, lex: Lexicon, saldo: Saldo, processes: int | None = None) -> list[dict[str, object]]:
    """Rank every day the graph can carry, best first."""
    starts = [h for h in sorted(graph.hubs) if usable_endpoint(lex, graph, h)]
    with Pool(
        processes or max(1, (os.cpu_count() or 2) - 1),
        initializer=_init,
        initargs=(graph, lex, saldo),
    ) as pool:
        results = pool.map(_sweep_start, starts, chunksize=4)
    days = [d for per_start in results for d in per_start]
    days.sort(key=lambda d: -float(d["_score"]))  # type: ignore[arg-type]
    return days
