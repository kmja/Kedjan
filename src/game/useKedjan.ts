import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Day, DayProgress, Stats } from "../types";
import {
  allSolutions,
  availableParts,
  bestNextPart,
  brokenJoints,
  fullChain,
  isDeadEnd,
  livingParts,
  sameChain,
  validPrefix,
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
   * Chips the second hint has ruled out — those in no winning route from here.
   * Empty until that hint is bought.
   */
  const [dimmed, setDimmed] = useState<ReadonlySet<string>>(new Set());
  /**
   * The joint a part will land in next, so the keyboard can aim as a drag
   * does. Joints and insertion points are the same thing: joint `i` sits
   * between `full[i]` and `full[i + 1]`, and inserting at `i` puts a part
   * exactly there.
   */
  const [armedJoint, setArmedJoint] = useState<number | null>(null);
  /**
   * The verdict per joint of [start, ...chain, target], recomputed on every
   * placement. `null` means the joint has not been judged yet.
   */
  const [jointMarks, setJointMarks] = useState<("ok" | "broken" | null)[]>([]);
  /**
   * An animation stamp per joint, keyed by the weld the joint judges. A joint
   * keeps its stamp — and therefore its DOM node, and therefore its already
   * played animation — as long as it is judging the same pair to the same
   * verdict. Removing a chip mid-chain shifts every index after it, so the
   * stamps follow the *pairs*, not the positions: only the joints the removed
   * chip actually touched come back with a new stamp and pop again.
   */
  const [jointStamps, setJointStamps] = useState<number[]>([]);
  const stampStore = useRef({
    counter: 0,
    byPair: new Map<string, { mark: "ok" | "broken" | null; stamp: number }>(),
  });
  const today = useMemo(todayISO, []);

  // Bump on every status message so an unchanged string still re-announces.
  const [announceKey, setAnnounceKey] = useState(0);
  const say = useCallback((s: Status | null) => {
    setStatus(s);
    setAnnounceKey((k) => k + 1);
  }, []);

  useEffect(() => persistSave(save), [save]);

  const key = day?.date ?? "";
  const stored = save.progress[key];
  /** The most parts a chain may hold. Budget counts links, which is one more. */
  const maxParts = day ? day.budget - 1 : 0;

  const progress: DayProgress = useMemo(
    () => stored ?? emptyProgress(),
    [stored],
  );

  // Switching days clears the transient layer; the arrangement is persisted.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setStatus(null);
      setMarked(null);
      setArmedJoint(null);
      clearVerdicts();
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
  const links = chain.length + 1;
  const pool = day ? availableParts(day, chain) : [];

  /**
   * Judge the whole bridge.
   *
   * Every joint between placed parts is marked, but the joint *into the target*
   * is only judged once the chain cannot grow further. While a part could
   * still be added, a red cross under an unfinished bridge says "wrong" where
   * the honest answer is "not yet".
   */
  const judge = useCallback(
    (nextChain: string[], atCeiling: boolean): ("ok" | "broken" | null)[] => {
      if (!day || !nextChain.length) return [];
      const full = fullChain(day, nextChain);
      const wins = brokenJoints(day, nextChain).length === 0;
      return full.slice(0, -1).map((part, i) => {
        const isFinalJoint = i === full.length - 2;
        if (isFinalJoint && !atCeiling && !wins) return null;
        return weld(day, part, full[i + 1]!) ? "ok" : "broken";
      });
    },
    [day],
  );

  /** Judge a chain and stamp its joints, reusing stamps for unchanged welds. */
  const applyVerdicts = useCallback(
    (nextChain: string[]) => {
      if (!day) return;
      const marks = judge(nextChain, nextChain.length >= maxParts);
      const full = fullChain(day, nextChain);
      const store = stampStore.current;
      const next = new Map<string, { mark: "ok" | "broken" | null; stamp: number }>();
      const stamps = marks.map((mark, i) => {
        const pair = `${full[i]}>${full[i + 1]}`;
        const prev = store.byPair.get(pair);
        const stamp = prev && prev.mark === mark ? prev.stamp : ++store.counter;
        next.set(pair, { mark, stamp });
        return stamp;
      });
      store.byPair = next;
      setJointMarks(marks);
      setJointStamps(stamps);
    },
    [day, judge, maxParts],
  );

  const clearVerdicts = useCallback(() => {
    setJointMarks([]);
    setJointStamps([]);
    stampStore.current.byPair = new Map();
  }, []);

  /**
   * Put a part into the chain at a joint. Nothing is validated on the way
   * down — parts go in in any order, and the whole chain is judged after.
   */
  const placeAt = useCallback(
    (part: string, index?: number) => {
      if (!day || solved) return;
      // Measured after the part is lifted out, so moving a part already in the
      // chain is never refused for making it longer — it does not.
      const withoutPart = chain.filter((p) => p !== part);
      if (withoutPart.length >= maxParts) {
        say({ kind: "no", msg: "Kedjan kan inte bli längre — ta bort en del först." });
        return;
      }
      const at = Math.min(index ?? armedJoint ?? withoutPart.length, withoutPart.length);
      const next = [...withoutPart.slice(0, at), part, ...withoutPart.slice(at)];

      patch((p) => ({ ...p, chain: next }));
      setArmedJoint(null);
      setMarked(null);
      setDimmed(new Set());

      const atCeiling = next.length >= maxParts;
      applyVerdicts(next);

      const broken = brokenJoints(day, next);
      if (broken.length === 0) {
        const alreadyCounted = Boolean(progress.solvedAt);
        patch(
          (p) => ({ ...p, solved: true, solvedAt: p.solvedAt ?? new Date().toISOString() }),
          alreadyCounted
            ? undefined
            : (s) => recordSolve(s, day.date, next.length + 1, day.par),
        );
        say({ kind: "ok", msg: "Kedjan håller — klart!" });
        return;
      }
      // A chain that has run out of room and still does not hold is the only
      // arrangement worth counting as a failed attempt.
      if (atCeiling) {
        patch((p) => ({ ...p, misses: p.misses + 1 }));
        const full = fullChain(day, next);
        const named = broken.slice(0, 2).map((i) => `${upper(full[i]!)}+${upper(full[i + 1]!)}`);
        const rest = broken.length - named.length;
        say({
          kind: "no",
          msg:
            named.join(" och ") +
            (rest > 0 ? ` och ${plural(rest, "länk till", "länkar till")}` : "") +
            " håller inte.",
        });
        return;
      }
      say({ kind: "info", msg: `${upper(part)} lagd i kedjan.` });
    },
    [day, solved, chain, maxParts, armedJoint, progress.solvedAt, patch, say, applyVerdicts],
  );

  /** Take a part back out. The chain closes up behind it. */
  const removeFrom = useCallback(
    (part: string) => {
      if (!day || solved || !chain.includes(part)) return;
      const next = chain.filter((p) => p !== part);
      patch((p) => ({ ...p, chain: next }));
      setMarked(null);
      setDimmed(new Set());
      applyVerdicts(next);
      say({ kind: "info", msg: `${upper(part)} tillbaka i poolen.` });
    },
    [day, solved, chain, patch, say, applyVerdicts],
  );

  /** Arm a joint so the next chip lands there, or disarm it. */
  const toggleJoint = useCallback(
    (index: number) => {
      if (solved) return;
      setArmedJoint((a) => (a === index ? null : index));
    },
    [solved],
  );

  /**
   * Put a solved day back on the table.
   *
   * `solvedAt` is deliberately left in place. It is what marks the day as
   * already counted, so replaying explores the puzzle without inflating
   * played/solved or handing out a second streak day for the same date.
   */
  const replay = useCallback(() => {
    if (!day) return;
    patch((p) => ({ ...p, chain: [], solved: false, hints: 0, misses: 0 }));
    setArmedJoint(null);
    clearVerdicts();
    setMarked(null);
    setDimmed(new Set());
    say({ kind: "info", msg: "Dagen är öppen igen — statistiken står kvar." });
  }, [day, patch, say]);

  /** The same, for every day the player has finished. */
  const replayAll = useCallback(() => {
    setSave((prev) => ({
      ...prev,
      progress: Object.fromEntries(
        Object.entries(prev.progress).map(([date, p]) => [
          date,
          { ...p, chain: [], solved: false, hints: 0, misses: 0 },
        ]),
      ),
    }));
    setArmedJoint(null);
    clearVerdicts();
    setMarked(null);
    setDimmed(new Set());
    say({ kind: "info", msg: "Alla dagar är öppna igen — statistiken står kvar." });
  }, [say]);

  const reset = useCallback(() => {
    if (!day || solved || !chain.length) return;
    patch((p) => ({ ...p, chain: [] }));
    setArmedJoint(null);
    clearVerdicts();
    setMarked(null);
    say({ kind: "info", msg: "Kedjan rensad." });
  }, [day, solved, chain.length, patch, say]);

  /**
   * A three-rung hint ladder, cheapest first.
   *
   * The board no longer says how long a chain should be, so the first thing
   * worth buying is that number — it is the shape of the answer, and asking
   * for it is a real decision. Only then does pathfinding start: distance from
   * the end of the run that already holds, then the chip itself.
   *
   * A dead end costs nothing. Charging for a position the game let the player
   * build would be a swindle.
   */
  const hint = useCallback(() => {
    if (!day || solved) return;
    const rung = hints % 3;

    if (rung === 0) {
      patch((p) => ({ ...p, hints: p.hints + 1 }));
      say({
        kind: "info",
        msg: `Rekommenderat: ${plural(day.par, "länk", "länkar")}. Du får använda ${day.budget}.`,
      });
      return;
    }

    const { length, at } = validPrefix(day, chain);
    const consumed = chain.slice(0, length);
    if (isDeadEnd(day, consumed, at)) {
      say({ kind: "no", msg: "Härifrån når du inte målet — ta bort en del och försök igen." });
      return;
    }
    const where = length === 0 ? "från starten" : `efter ${upper(at)}`;

    if (rung === 1) {
      // Distance is redundant once par is known, so this rung takes options off
      // the table instead: every chip that appears in no winning route from
      // where the player stands is greyed out.
      const live = livingParts(day, chain);
      const dead = pool.filter((p) => !live.has(p));
      if (!dead.length) {
        say({ kind: "info", msg: "Alla delar som är kvar kan leda till målet." });
      } else {
        setDimmed(new Set(dead));
        say({
          kind: "info",
          msg: `${plural(dead.length, "del", "delar")} kan inte leda till målet — de är nedtonade.`,
        });
      }
    } else {
      const next = bestNextPart(day, consumed, at);
      if (!next) {
        say({ kind: "no", msg: "Härifrån når du inte målet — ta bort en del och försök igen." });
        return;
      }
      setMarked(next);
      say({
        kind: "info",
        msg: next === day.target
          ? `Koppla ${upper(at)} direkt till målet ⭐`
          : `${upper(next)} passar ${where} ⭐`,
      });
    }
    patch((p) => ({ ...p, hints: p.hints + 1 }));
  }, [day, solved, chain, pool, hints, say, patch]);

  /** Alternative routes, revealed only once the day is won. */
  const otherSolutions = useMemo(() => {
    if (!day || !solved) return [];
    return allSolutions(day).filter((s) => !sameChain(s, chain));
  }, [day, solved, chain]);

  const solvedDates = useMemo(
    () => new Set(Object.entries(save.progress).filter(([, p]) => p.solved).map(([d]) => d)),
    [save.progress],
  );

  /** The pair a player is most likely to dispute, for the report link. */
  const lastMiss = useMemo((): [string, string] | null => {
    if (!day) return null;
    const i = jointMarks.indexOf("broken");
    if (i < 0) return null;
    const full = fullChain(day, chain);
    const a = full[i];
    const b = full[i + 1];
    return a && b ? [a, b] : null;
  }, [day, chain, jointMarks]);

  return {
    progress,
    chain,
    solved,
    hints,
    misses,
    /** Par is part of the puzzle until the first hint is spent on it. */
    parRevealed: hints > 0 || solved,
    links,
    pool,
    marked,
    dimmed,
    armedJoint,
    maxParts,
    jointMarks,
    jointStamps,
    lastMiss,
    status,
    announceKey,
    stats: save.stats,
    streak: liveStreak(save.stats, today),
    solvedDates,
    placeAt,
    removeFrom,
    toggleJoint,
    replay,
    replayAll,
    reset,
    hint,
    otherSolutions,
  };
}
