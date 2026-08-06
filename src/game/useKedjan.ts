import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Day, DayProgress, Stats } from "../types";
import {
  allSolutions,
  availableParts,
  bestNextPart,
  distanceToTarget,
  isDeadEnd,
  linksRemaining,
  sameChain,
  weld,
} from "./graph";
import {
  emptyProgress,
  liveStreak,
  loadSave,
  persistSave,
  recordSolve,
} from "./storage";
import { todayISO } from "./dates";
import { plural } from "./plural";

export type Status = { kind: "ok" | "no" | "info"; msg: string };

const upper = (s: string) => s.toUpperCase();

export function useKedjan(day: Day | null) {
  const [save, setSave] = useState(loadSave);
  const [status, setStatus] = useState<Status | null>(null);
  const [marked, setMarked] = useState<string | null>(null);
  /**
   * The last pair the game refused. False rejections are the top quality
   * metric — every "är inte ett ord" for a word the player knows is real
   * spends trust — so the rejected pair is kept for the report button.
   */
  const [lastMiss, setLastMiss] = useState<[string, string] | null>(null);
  const today = useMemo(todayISO, []);

  // Bump on every status message so an unchanged string still re-announces.
  const [announceKey, setAnnounceKey] = useState(0);
  const say = useCallback((s: Status | null) => {
    setStatus(s);
    setAnnounceKey((k) => k + 1);
  }, []);

  useEffect(() => persistSave(save), [save]);

  const key = day?.date ?? "";
  const progress: DayProgress = save.progress[key] ?? emptyProgress();

  // Switching days clears the transient layer; the chain itself is persisted.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setStatus(null);
      setMarked(null);
      setLastMiss(null);
    }
  }, [key]);

  const patch = useCallback(
    (fn: (p: DayProgress) => DayProgress, statsFn?: (s: Stats) => Stats) => {
      setSave((prev) => ({
        progress: { ...prev.progress, [key]: fn(prev.progress[key] ?? emptyProgress()) },
        stats: statsFn ? statsFn(prev.stats) : prev.stats,
      }));
    },
    [key],
  );

  const { chain, solved, hints, misses } = progress;
  const current = day ? (solved ? day.target : chain.at(-1) ?? day.start) : "";
  const links = chain.length + (solved ? 1 : 0);
  const pool = day ? availableParts(day, chain) : [];
  const remaining = day ? linksRemaining(day, chain) : 0;

  /** Place a pool part at the end of the chain. */
  const place = useCallback(
    (part: string) => {
      if (!day || solved) return;
      // The last link is reserved for the target: an intermediate part placed
      // there could never be welded onward.
      if (chain.length >= day.budget - 1) {
        say({ kind: "no", msg: "Budgeten är full — koppla till målet eller ångra." });
        return;
      }
      const w = weld(day, current, part);
      if (!w) {
        say({ kind: "no", msg: `${upper(current)}+${upper(part)} är inte ett ord.` });
        setLastMiss([current, part]);
        patch((p) => ({ ...p, misses: p.misses + 1 }));
        return;
      }
      setMarked(null);
      setLastMiss(null);
      patch((p) => ({ ...p, chain: [...p.chain, part] }));
      say({ kind: "ok", msg: `${w} ✓` });
    },
    [day, solved, chain.length, current, say, patch],
  );

  /** Weld the current part onto the target and finish the day. */
  const finish = useCallback(() => {
    if (!day || solved) return;
    const w = weld(day, current, day.target);
    if (!w) {
      say({ kind: "no", msg: `${upper(current)}+${upper(day.target)} är inte ett ord.` });
      setLastMiss([current, day.target]);
      patch((p) => ({ ...p, misses: p.misses + 1 }));
      return;
    }
    setMarked(null);
    setLastMiss(null);
    patch(
      (p) => ({ ...p, solved: true, solvedAt: new Date().toISOString() }),
      (s) => recordSolve(s, day.date, chain.length + 1, day.par),
    );
    say({ kind: "ok", msg: `${w} ✓ — klart!` });
  }, [day, solved, current, chain.length, say, patch]);

  /**
   * Take a part back out of the chain.
   *
   * The chain is a bridge, so a part cannot be plucked from the middle and
   * leave the rest standing — every weld after it was made against a
   * neighbour that is now gone. Removing a part therefore removes everything
   * downstream of it too. One rule, always, which makes removing the last
   * part exactly an undo.
   */
  const removeFrom = useCallback(
    (part: string) => {
      if (!day || solved) return;
      const at = chain.indexOf(part);
      if (at < 0) return;

      const alsoDropped = chain.length - at - 1;
      patch((p) => ({ ...p, chain: p.chain.slice(0, at) }));
      setMarked(null);
      setLastMiss(null);
      say({
        kind: "info",
        msg: alsoDropped === 0
          ? `${upper(part)} tillbaka i poolen.`
          : `${upper(part)} och ${plural(alsoDropped, "del", "delar")} efter den togs bort.`,
      });
    },
    [day, solved, chain, say, patch],
  );

  const undo = useCallback(() => {
    const last = chain.at(-1);
    if (last) removeFrom(last);
  }, [chain, removeFrom]);

  const reset = useCallback(() => {
    if (!day || solved) return;
    patch((p) => ({ ...p, chain: [] }));
    setMarked(null);
    say({ kind: "info", msg: "Kedjan rensad." });
  }, [day, solved, say, patch]);

  /**
   * Two-tier hint. First press gives the distance, second marks the chip.
   * A dead end costs nothing — the player is told to back up instead, because
   * charging a hint for a position the game let them walk into is a swindle.
   */
  const hint = useCallback(() => {
    if (!day || solved) return;
    if (isDeadEnd(day, chain, current)) {
      say({ kind: "no", msg: "Härifrån når du inte målet — ångra dig tillbaka." });
      return;
    }
    const d = distanceToTarget(day, chain, current)!;
    if (hints % 2 === 0) {
      say({
        kind: "info",
        msg: d === 1 ? "Målet är ett enda ord bort." : `Målet är ${d} ord bort härifrån.`,
      });
    } else {
      const next = bestNextPart(day, chain, current);
      if (!next) {
        say({ kind: "no", msg: "Härifrån når du inte målet — ångra dig tillbaka." });
        return;
      }
      setMarked(next);
      say({
        kind: "info",
        msg: next === day.target
          ? `Koppla ${upper(current)} direkt till målet ⭐`
          : `${upper(next)} är rätt väg vidare ⭐`,
      });
    }
    patch((p) => ({ ...p, hints: p.hints + 1 }));
  }, [day, solved, chain, current, hints, say, patch]);

  /** Alternative routes, revealed only once the day is won. */
  const otherSolutions = useMemo(() => {
    if (!day || !solved) return [];
    return allSolutions(day).filter((s) => !sameChain(s, chain));
  }, [day, solved, chain]);

  return {
    progress,
    chain,
    solved,
    hints,
    misses,
    current,
    links,
    pool,
    remaining,
    marked,
    lastMiss,
    status,
    announceKey,
    stats: save.stats,
    streak: liveStreak(save.stats, today),
    solvedDates: useMemo(
      () => new Set(Object.entries(save.progress).filter(([, p]) => p.solved).map(([d]) => d)),
      [save.progress],
    ),
    place,
    finish,
    removeFrom,
    undo,
    reset,
    hint,
    otherSolutions,
  };
}
