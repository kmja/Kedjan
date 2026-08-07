import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Day, DayProgress, Stats } from "../types";
import {
  allSolutions,
  availableParts,
  bestNextPart,
  brokenJoints,
  distanceToTarget,
  fullChain,
  isDeadEnd,
  sameChain,
  validPrefix,
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
  /** Slot waiting for the next chip, so the keyboard can aim as a drag does. */
  const [armedSlot, setArmedSlot] = useState<number | null>(null);
  /**
   * Joints that failed the last time the player closed the chain. Cleared by
   * any edit — a mark that outlives the arrangement it described is a lie.
   */
  const [failedJoints, setFailedJoints] = useState<number[]>([]);
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
  const slotCount = day ? day.budget - 1 : 0;

  const progress: DayProgress = useMemo(() => {
    const base = stored ?? emptyProgress();
    // The budget is the authority on slot count, not whatever was saved.
    return {
      ...base,
      slots: Array.from({ length: slotCount }, (_, i) => base.slots[i] ?? null),
    };
  }, [stored, slotCount]);

  // Switching days clears the transient layer; the arrangement is persisted.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setStatus(null);
      setMarked(null);
      setArmedSlot(null);
      setFailedJoints([]);
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

  const { slots, solved, hints, misses } = progress;
  /** The arrangement as a sequence: empty slots simply drop out. */
  const chain = useMemo(() => slots.filter((s): s is string => s !== null), [slots]);
  const links = chain.length + 1;
  const pool = day ? availableParts(day, chain) : [];

  /** Any edit invalidates the last verdict. */
  const edited = useCallback(() => {
    setFailedJoints([]);
    setMarked(null);
  }, []);

  /**
   * Put a part into a slot. Nothing is validated here — parts go down in any
   * order, and the chain is judged only when the player closes it. Dropping
   * onto an occupied slot swaps rather than refuses.
   */
  const placeAt = useCallback(
    (part: string, index?: number) => {
      if (!day || solved) return;
      const at = index ?? armedSlot ?? slots.findIndex((s) => s === null);
      if (at < 0 || at >= slotCount) {
        say({ kind: "no", msg: "Alla platser är fulla — ta bort en del först." });
        return;
      }
      patch((p) => {
        const next = Array.from({ length: slotCount }, (_, i) => p.slots[i] ?? null);
        // A part lives in one slot only, so moving it vacates the old one.
        const previous = next.indexOf(part);
        if (previous >= 0) next[previous] = null;
        next[at] = part;
        return { ...p, slots: next };
      });
      setArmedSlot(null);
      edited();
      say({ kind: "info", msg: `${upper(part)} placerad på plats ${at + 1}.` });
    },
    [day, solved, armedSlot, slots, slotCount, patch, say, edited],
  );

  /** Take a part back out. It leaves a gap; nothing else is disturbed. */
  const removeFrom = useCallback(
    (part: string) => {
      if (!day || solved || !slots.includes(part)) return;
      patch((p) => ({ ...p, slots: p.slots.map((s) => (s === part ? null : s)) }));
      edited();
      say({ kind: "info", msg: `${upper(part)} tillbaka i poolen.` });
    },
    [day, solved, slots, patch, say, edited],
  );

  /** Clicking a slot empties it, or arms it to receive the next chip. */
  const toggleSlot = useCallback(
    (index: number) => {
      if (solved) return;
      const part = slots[index];
      if (part) removeFrom(part);
      else setArmedSlot((a) => (a === index ? null : index));
    },
    [solved, slots, removeFrom],
  );

  /**
   * Close the chain onto the target — the final link, and the only moment
   * anything is checked. Every joint is judged at once and every failure is
   * reported, rather than halting the player at the first one.
   */
  const submit = useCallback(() => {
    if (!day || solved) return;
    if (!chain.length) {
      say({ kind: "no", msg: "Lägg minst en del i kedjan först." });
      return;
    }

    const broken = brokenJoints(day, chain);
    if (broken.length === 0) {
      setMarked(null);
      setFailedJoints([]);
      // A replayed day must not count twice, so the stats only move on the
      // first solve — `solvedAt` is written once and never overwritten.
      const alreadyCounted = Boolean(progress.solvedAt);
      patch(
        (p) => ({ ...p, solved: true, solvedAt: p.solvedAt ?? new Date().toISOString() }),
        alreadyCounted
          ? undefined
          : (s) => recordSolve(s, day.date, chain.length + 1, day.par),
      );
      say({ kind: "ok", msg: "Kedjan håller — klart!" });
      return;
    }

    const full = fullChain(day, chain);
    const named = broken.slice(0, 2).map((i) => `${upper(full[i]!)}+${upper(full[i + 1]!)}`);
    const rest = broken.length - named.length;
    setFailedJoints(broken);
    patch((p) => ({ ...p, misses: p.misses + 1 }));
    say({
      kind: "no",
      msg:
        named.join(" och ") +
        (rest > 0 ? ` och ${plural(rest, "länk till", "länkar till")}` : "") +
        " håller inte.",
    });
  }, [day, solved, chain, progress.solvedAt, patch, say]);

  /**
   * Put a solved day back on the table. Test mode only: the stats keep the
   * first result, so this buys a fresh board without rewriting history.
   */
  const replay = useCallback(() => {
    if (!day) return;
    patch((p) => ({ ...p, slots: p.slots.map(() => null), solved: false }));
    setArmedSlot(null);
    edited();
    say({ kind: "info", msg: "Dagen är öppen igen — statistiken står kvar." });
  }, [day, patch, say, edited]);

  const reset = useCallback(() => {
    if (!day || solved || !chain.length) return;
    patch((p) => ({ ...p, slots: p.slots.map(() => null) }));
    setArmedSlot(null);
    edited();
    say({ kind: "info", msg: "Kedjan rensad." });
  }, [day, solved, chain.length, patch, say, edited]);

  /**
   * Two-tier hint, anchored to the longest run that already holds — the only
   * position that means anything once parts can be arranged out of order.
   * First press gives the distance from there, second marks the chip. A dead
   * end costs nothing: charging for a position the game let the player build
   * would be a swindle.
   */
  const hint = useCallback(() => {
    if (!day || solved) return;
    const { length, at } = validPrefix(day, chain);
    const consumed = chain.slice(0, length);

    if (isDeadEnd(day, consumed, at)) {
      say({ kind: "no", msg: "Härifrån når du inte målet — ta bort en del och försök igen." });
      return;
    }
    const d = distanceToTarget(day, consumed, at)!;
    const where = length === 0 ? "från starten" : `efter ${upper(at)}`;

    if (hints % 2 === 0) {
      say({
        kind: "info",
        msg: d === 1
          ? `Målet är ett enda ord bort ${where}.`
          : `Målet är ${d} ord bort ${where}.`,
      });
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
  }, [day, solved, chain, hints, say, patch]);

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
    if (!day || !failedJoints.length) return null;
    const full = fullChain(day, chain);
    const i = failedJoints[0]!;
    return [full[i]!, full[i + 1]!];
  }, [day, chain, failedJoints]);

  return {
    progress,
    slots,
    chain,
    solved,
    hints,
    misses,
    links,
    pool,
    marked,
    armedSlot,
    failedJoints,
    lastMiss,
    status,
    announceKey,
    stats: save.stats,
    streak: liveStreak(save.stats, today),
    solvedDates,
    placeAt,
    removeFrom,
    toggleSlot,
    submit,
    replay,
    reset,
    hint,
    otherSolutions,
  };
}
