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
import { dayKey } from "./days";
import { todayISO } from "./dates";
import { plural } from "./plural";
import { praise } from "./praise";

export type Status = { kind: "ok" | "no" | "info"; msg: string };

const upper = (s: string) => s.toUpperCase();

/**
 * How many life-costing placements a day tolerates. Without a ceiling the
 * pool can simply be enumerated — tap, read the cross, remove, next.
 */
export const MAX_LIVES = 3;

/**
 * Is this joint's link already forged? Joint `i` sits between `full[i]` and
 * `full[i + 1]`, so a joint is forged exactly when that pair welds.
 */
export function isForged(day: Day, chain: readonly string[], index: number): boolean {
  const full = fullChain(day, chain);
  return index >= 0 && index + 1 < full.length && Boolean(weld(day, full[index]!, full[index + 1]!));
}

/**
 * Where a chip aimed at joint `wanted` actually lands.
 *
 * A forged link is finished: prising it apart to insert a part is a move no
 * player wants, so the board offers no target there. The default landing
 * place is the end of the chain, which may itself be forged — the first part
 * a player places often welds straight into the target — so the aim slides
 * back to the nearest link still open.
 */
export function landingJoint(day: Day, chain: readonly string[], wanted: number): number {
  if (!isForged(day, chain, wanted)) return wanted;
  for (let step = 1; step <= chain.length + 1; step++) {
    if (wanted - step >= 0 && !isForged(day, chain, wanted - step)) return wanted - step;
    if (wanted + step <= chain.length && !isForged(day, chain, wanted + step)) return wanted + step;
  }
  return wanted;
}

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
   * The chip whose last placement was refused, for the pool to shake it.
   * The nonce restarts the animation when the same chip is refused twice.
   */
  const [rejection, setRejection] = useState<{ part: string; nonce: number } | null>(null);
  /** The chip that just clipped onto the chain, for the chain to sway it. */
  const [settled, setSettled] = useState<{ part: string; nonce: number } | null>(null);
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

  // Two chains share every date, so progress is keyed by date and tier both.
  const key = day ? dayKey(day) : "";
  const stored = save.progress[key];
  /** The most parts a chain may hold: every chip there is. No link budget. */
  const maxParts = day ? day.pool.length : 0;

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
  const livesLost = progress.livesLost ?? 0;
  /** Out of lives and unsolved: the day is over. */
  const failed = !solved && livesLost >= MAX_LIVES;
  const links = chain.length + 1;
  const pool = day ? availableParts(day, chain) : [];

  /**
   * Judge the whole chain.
   *
   * Every joint between placed parts is marked. The joint *into the target*
   * is marked green the moment it holds — that weld is real information
   * whichever way the rest of the chain is going — but its red cross is
   * withheld while a part could still be added: a cross under an unfinished
   * chain says "wrong" where the honest answer is "not yet".
   */
  const judge = useCallback(
    (nextChain: string[], atCeiling: boolean): ("ok" | "broken" | null)[] => {
      if (!day || !nextChain.length) return [];
      const full = fullChain(day, nextChain);
      const wins = brokenJoints(day, nextChain).length === 0;
      return full.slice(0, -1).map((part, i) => {
        const holds = weld(day, part, full[i + 1]!);
        const isFinalJoint = i === full.length - 2;
        if (isFinalJoint && !atCeiling && !wins && !holds) return null;
        return holds ? "ok" : "broken";
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
   * The verdicts are transient — computed on each placement — but the chain
   * they judge is persisted. A stored chain arriving without them (a reload,
   * a day opened from the archive) would show bare links where the player
   * had earned checks and words, so whenever the day under judgement
   * changes, the chain it brings is judged as if it had just been laid.
   */
  const chainRef = useRef(chain);
  chainRef.current = chain;
  useEffect(() => {
    clearVerdicts();
    if (day && chainRef.current.length) applyVerdicts(chainRef.current);
  }, [key, day, applyVerdicts, clearVerdicts]);

  /**
   * Sweep out every part left welded to neither of its neighbours.
   *
   * Placement demands that a chip stick to at least one side, but a removal
   * can undo the side it was sticking by: take PAR out of kärlek-PAR-HÄST
   * and HÄST — which was holding on through parhäst alone — is left floating
   * in mid-air, attached to nothing. A part in that state was only ever in
   * the chain by someone else's weld, so it goes home to the pool with the
   * part that was holding it. Repeated until nothing floats, because the
   * part swept out can itself have been holding the next one.
   */
  const sweepStranded = useCallback(
    (parts: string[]): { kept: string[]; stranded: string[] } => {
      if (!day) return { kept: parts, stranded: [] };
      let kept = parts;
      const stranded: string[] = [];
      for (;;) {
        const full = fullChain(day, kept);
        const floater = kept.find(
          (p, i) => !weld(day, full[i]!, p) && !weld(day, p, full[i + 2]!),
        );
        if (!floater) return { kept, stranded };
        kept = kept.filter((x) => x !== floater);
        stranded.push(floater);
      }
    },
    [day],
  );

  /**
   * End the day if this chain holds — however it came to hold. A win by
   * *removing* a part is a legitimate win: taking a wrong link out of a
   * chain that was otherwise sound is exactly the kind of move the free
   * placement invites.
   */
  const finishIfSolved = useCallback(
    (next: string[]): boolean => {
      if (!day || next.length === 0 || brokenJoints(day, next).length > 0) return false;
      const alreadyCounted = Boolean(progress.solvedAt);
      patch(
        (p) => ({ ...p, solved: true, solvedAt: p.solvedAt ?? new Date().toISOString() }),
        alreadyCounted
          ? undefined
          : (s) => recordSolve(s, day.date, next.length + 1, day.par),
      );
      say({ kind: "ok", msg: praise() });
      return true;
    },
    [day, progress.solvedAt, patch, say],
  );

  /**
   * Put a part into the chain at a joint. Nothing is validated on the way
   * down — parts go in in any order, and the whole chain is judged after.
   */
  const placeAt = useCallback(
    (part: string, index?: number) => {
      if (!day || solved || failed) return;
      // Measured after the part is lifted out, so moving a part already in the
      // chain is never refused for making it longer — it does not.
      const withoutPart = chain.filter((p) => p !== part);
      if (withoutPart.length >= maxParts) {
        say({ kind: "no", msg: "Kedjan kan inte bli längre — ta bort en del först." });
        return;
      }
      const wanted = Math.min(index ?? armedJoint ?? withoutPart.length, withoutPart.length);
      const at = landingJoint(day, withoutPart, wanted);
      const next = [...withoutPart.slice(0, at), part, ...withoutPart.slice(at)];

      // A chip must stick to at least one of its neighbours. One that welds
      // with neither the word before it nor the word after it never lands:
      // it shakes off back to the pool and costs a life — that is what a
      // brute-force tap looks like. A chip that holds on one side is a real
      // move whatever the other side says.
      const fullNext = fullChain(day, next);
      const before = fullNext[at]!;
      const after = fullNext[at + 2]!;
      if (!weld(day, before, part) && !weld(day, part, after)) {
        const left = MAX_LIVES - livesLost - 1;
        // If the chip came out of the chain for this move, it stays out —
        // rejected means back to the pool, wherever it was lifted from.
        // And lifting it out can have stranded whatever it was holding.
        const { kept } = sweepStranded(withoutPart);
        patch((p) => ({ ...p, chain: kept, livesLost: (p.livesLost ?? 0) + 1 }));
        setRejection((r) => ({ part, nonce: (r?.nonce ?? 0) + 1 }));
        setArmedJoint(null);
        setMarked(null);
        setDimmed(new Set());
        applyVerdicts(kept);
        say({
          kind: "no",
          msg:
            left <= 0
              ? `${upper(part)} fäster varken vid ${upper(before)} eller ${upper(after)}. Kedjan brast — inga liv kvar.`
              : `${upper(part)} fäster varken vid ${upper(before)} eller ${upper(after)} · ${plural(left, "liv kvar", "liv kvar")}`,
        });
        return;
      }

      // Moving a part from one place to another can strand the part it had
      // been holding up at the old one.
      const { kept } = sweepStranded(next);
      patch((p) => ({ ...p, chain: kept }));
      setArmedJoint(null);
      setMarked(null);
      setDimmed(new Set());
      // It clipped on: the chain gives it the little swing of something
      // hung on a hook.
      setSettled((s) => ({ part, nonce: (s?.nonce ?? 0) + 1 }));

      applyVerdicts(kept);

      if (finishIfSolved(kept)) return;
      say({ kind: "info", msg: `${upper(part)} lagd i kedjan.` });
    },
    [day, solved, failed, chain, maxParts, armedJoint, livesLost, patch, say, applyVerdicts, finishIfSolved, sweepStranded],
  );

  /** Take a part back out. The chain closes up behind it. */
  const removeFrom = useCallback(
    (part: string) => {
      if (!day || solved || failed || !chain.includes(part)) return;
      const { kept, stranded } = sweepStranded(chain.filter((p) => p !== part));
      patch((p) => ({ ...p, chain: kept }));
      setMarked(null);
      setDimmed(new Set());
      applyVerdicts(kept);
      if (finishIfSolved(kept)) return;
      say({
        kind: "info",
        msg: stranded.length
          ? `${upper(part)} tillbaka i poolen — ${stranded
              .map(upper)
              .join(" och ")} satt bara fast i den och följde med.`
          : `${upper(part)} tillbaka i poolen.`,
      });
    },
    [day, solved, failed, chain, patch, say, applyVerdicts, finishIfSolved, sweepStranded],
  );

  /** Arm a joint so the next chip lands there, or disarm it. */
  const toggleJoint = useCallback(
    (index: number) => {
      // A forged link is finished work; it is not a place to aim at. The
      // board does not offer one, and neither does this.
      if (solved || !day || isForged(day, chain, index)) return;
      setArmedJoint((a) => (a === index ? null : index));
    },
    [solved, day, chain],
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
    patch((p) => ({ ...p, chain: [], solved: false, hints: 0, misses: 0, livesLost: 0 }));
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
          { ...p, chain: [], solved: false, hints: 0, misses: 0, livesLost: 0 },
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
    if (!day || solved || failed) return;
    const rung = hints % 3;

    if (rung === 0) {
      patch((p) => ({ ...p, hints: p.hints + 1 }));
      say({
        kind: "info",
        msg: `Rekommenderat: ${plural(day.par, "länk", "länkar")}.`,
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

  /** Progress keys — date#tier — of every solved chain, for the archive. */
  const solvedKeys = useMemo(
    () => new Set(Object.entries(save.progress).filter(([, p]) => p.solved).map(([k]) => k)),
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
    failed,
    livesLeft: Math.max(0, MAX_LIVES - livesLost),
    hints,
    misses,
    /** Par is part of the puzzle until the first hint is spent on it. */
    parRevealed: hints > 0 || solved,
    links,
    pool,
    marked,
    dimmed,
    rejection,
    settled,
    armedJoint,
    maxParts,
    jointMarks,
    jointStamps,
    lastMiss,
    status,
    announceKey,
    stats: save.stats,
    streak: liveStreak(save.stats, today),
    solvedKeys,
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
