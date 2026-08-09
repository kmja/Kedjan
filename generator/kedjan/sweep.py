"""Exhaustive search for the best days the whole graph can offer.

`generate` walks hubs in degree order and stops when it has enough, so most of
the graph is never looked at — it finds *acceptable* days near the top of the
degree list, not the best days anywhere. The sweep builds every day every
usable start can carry, at both pars, and ranks them.

The score makes explicit five judgements curation has been applying by hand:

  goldilocks   solution count in its tier's sweet spot — the middle of the
               3-12 band for either tier — still genuinely independent of each
               other. The first archive proved that at short par a generous
               solution count makes walkover days, and the second proved that
               starving the hard tier of routes makes corridors
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
  attested     the share of the words on a winning route that SALDO holds
               as headwords, rather than only SFOL — the weld word is a link
               out to the dictionary, so a route built of words svenska.se
               cannot show is a promise the game does not keep
  traps        false paths: first moves off the start that weld, invite, and
               reach the target from nowhere — and how deep a player can walk
               one before the board stops offering anything. The archive's
               easy chains had none at all, which is what made them walkovers

Days that fail a blocking curation check are dropped before ranking, so the
list only ever contains days that `accept` would take. Taste — tone, register,
endpoint appeal — still belongs to the human reading the result.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from multiprocessing import Pool

from . import analysis, curate
from .analysis import DayReport, report
from .days import EASY_PAR, Day, build_day, distances_from, usable_endpoint
from .graph import PartGraph
from .lexicon import Lexicon
from .saldo import Saldo

#: Sweet solution counts by tier. The easy chain (par 3) keeps the launch
#: shape: the middle of its 3-12 band. The hard chain wants a middle of its
#: own: a handful of ways through, not two. Scoring the hard tier down to two
#: routes is what produced the corridors — a chain with one way through is not
#: hard, it is narrow, and the difficulty belongs in the traps instead.
SWEET_SOLUTIONS_EASY = range(6, 10)
SWEET_SOLUTIONS_HARD = range(3, 9)
#: Independent routes saturate here — routes consume pool, and the longer the
#: par the fewer truly disjoint routes a pool this size can carry.
INDEP_CAP = {3: 4, 4: 3, 5: 2}
#: The healthy valid-pairs band is 20-30; its sweet middle.
SWEET_PAIRS = range(24, 31)
#: Route entanglement saturates here.
CROSS_CAP = 5
#: A fifth double-reading chip stops adding misdirection the fourth had.
HOMOGRAPH_CAP = 4

#: How many false openings are worth rewarding. Two wrong turns off the start
#: is a chain a player has to read; a third adds little the second did not.
TRAP_CAP = 2
#: How deep a doomed line has to run before the trap has done its work: a
#: player who has laid three parts down has committed to the wrong reading.
TRAP_DEPTH_CAP = 3

#: Deception is the share of valid welds on no winning route: full marks when
#: three quarters of the fabric leads nowhere, nothing below two fifths.
DECEPTION_FLOOR = 0.4
DECEPTION_CEILING = 0.75

#: Attestation is the share of the words on a winning route that SALDO holds
#: as headwords. SFOL witnesses far more compounds than SALDO records, and the
#: ones only SFOL has are the marginal ones — the median day in the first
#: trap-scored sweep had SALDO for under half the words it asked a player to
#: build, and every weld word is a link out to svenska.se.
ATTESTED_FLOOR = 0.35
ATTESTED_CEILING = 0.8

WEIGHTS = {
    "goldilocks": 0.20,
    "density": 0.14,
    "deception": 0.14,
    "doubleness": 0.12,
    "traps": 0.22,
    "attested": 0.18,
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
    cap = INDEP_CAP[day.par]
    easy = day.par <= EASY_PAR
    payload = day.to_json()
    # The game accepts any chain that holds, so the hard tier is judged on
    # every winning route, however long — the within-budget count flattered
    # days whose escapes were merely longer than par.
    all_routes = curate.solutions_unlimited(payload)
    sols_band = (
        _band(len(rep.solutions), 2, SWEET_SOLUTIONS_EASY, 13)
        if easy
        else _band(len(all_routes), 1, SWEET_SOLUTIONS_HARD, 14)
    )
    goldilocks = (sols_band + min(rep.disjoint_routes, cap) / cap) / 2

    entangled = min(rep.min_cross_links, CROSS_CAP) / CROSS_CAP
    density = (
        _band(day.metrics["valid_pairs"], 17, SWEET_PAIRS, 35) + entangled
    ) / 2 - 0.2 * len(rep.isolated_chips)

    # Welds that lead somewhere — on any winning route, of any length —
    # counted once; everything else is fabric that welds but does not win,
    # which is where the difficulty lives.
    on_route = {
        f"{a}>{b}"
        for route in all_routes
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

    # The traps, weighted heaviest of the four difficulty terms: how many
    # first moves off the start look like a way in and are not, and how far a
    # player can walk one before the board runs out. A chain whose every
    # opening wins is a chain with nothing to find out — deception measured
    # over the whole fabric missed that, because dead welds deep in the pool
    # are welds nobody was tempted by.
    # The words a winner actually builds, and how many of them SALDO knows.
    # Not every weld in the pool: a marginal compound nobody has to make is
    # a decoy, one on the only way through is a word the game vouches for.
    on_route_words = {
        payload["pairs"][key]
        for route in all_routes
        for a, b in zip([day.start, *route], [*route, day.target])
        if (key := f"{a}>{b}") in payload["pairs"]
    }
    share = 1 - len(rep.weak_welds) / len(on_route_words) if on_route_words else 0.0
    attested = min(
        1.0,
        max(0.0, (share - ATTESTED_FLOOR) / (ATTESTED_CEILING - ATTESTED_FLOOR)),
    )

    false_openings, trap_depth = analysis.false_paths(payload)
    traps = (
        min(len(false_openings), TRAP_CAP) / TRAP_CAP
        + min(trap_depth, TRAP_DEPTH_CAP) / TRAP_DEPTH_CAP
    ) / 2

    return Scored(
        day=day,
        report=rep,
        subscores={
            "goldilocks": goldilocks,
            "density": max(0.0, density),
            "deception": deception,
            "doubleness": doubleness,
            "traps": traps,
            "attested": attested,
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
    # Par 3 days feed the easy tier; par 4-5 the hard one.
    for par in (3, 4, 5):
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
