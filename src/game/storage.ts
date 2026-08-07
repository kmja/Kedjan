import type { DayProgress, Stats } from "../types";
import { daysBetween } from "./dates";

const KEY = "kedjan.v1";

interface Save {
  progress: Record<string, DayProgress>;
  stats: Stats;
}

export const emptyStats = (): Stats => ({
  played: 0,
  solved: 0,
  underPar: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastSolvedDate: null,
  linkHistogram: {},
});

export const emptyProgress = (): DayProgress => ({
  slots: [],
  solved: false,
  hints: 0,
  misses: 0,
});

/**
 * Saves written before parts could be placed out of order stored a compact
 * `chain`. Read it as slots filled from the left so an in-progress day is not
 * thrown away by the upgrade.
 */
function migrate(p: Partial<DayProgress> & { chain?: string[] }): DayProgress {
  return {
    ...emptyProgress(),
    ...p,
    slots: p.slots ?? p.chain ?? [],
  };
}

const emptySave = (): Save => ({ progress: {}, stats: emptyStats() });

/** Slots read as a sequence: empty ones simply drop out. */
export const chainOf = (p: DayProgress): string[] =>
  p.slots.filter((s): s is string => s !== null);

/**
 * Storage is best-effort: Safari private mode throws on both read and write,
 * and a player with a broken save should still get a playable puzzle rather
 * than a white screen.
 */
export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const parsed = JSON.parse(raw) as Partial<Save>;
    const progress = Object.fromEntries(
      Object.entries(parsed.progress ?? {}).map(([date, p]) => [date, migrate(p)]),
    );
    return { progress, stats: { ...emptyStats(), ...parsed.stats } };
  } catch {
    return emptySave();
  }
}

/** Wipe every day's progress and the stats. Test mode only. */
export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export function persistSave(save: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* quota or private mode — the session still plays, it just won't survive a reload */
  }
}

/**
 * Fold a finished day into the stats.
 *
 * Streaks only move forward. Solving an archive day older than the last solve
 * counts towards played/solved and the histogram but must not rewrite a streak
 * the player earned on the calendar — and must never break one either.
 */
export function recordSolve(
  stats: Stats,
  date: string,
  links: number,
  par: number,
): Stats {
  const next: Stats = {
    ...stats,
    played: stats.played + 1,
    solved: stats.solved + 1,
    underPar: stats.underPar + (links < par ? 1 : 0),
    linkHistogram: {
      ...stats.linkHistogram,
      [links]: (stats.linkHistogram[links] ?? 0) + 1,
    },
  };

  const last = stats.lastSolvedDate;
  if (last !== null && daysBetween(last, date) <= 0) return next;

  next.currentStreak = last !== null && daysBetween(last, date) === 1
    ? stats.currentStreak + 1
    : 1;
  next.maxStreak = Math.max(stats.maxStreak, next.currentStreak);
  next.lastSolvedDate = date;
  return next;
}

/**
 * A streak is live only while the last solve is today or yesterday. Stored
 * streaks go stale silently, so this is applied at read time rather than
 * written back — the player's history stays intact.
 */
export function liveStreak(stats: Stats, today: string): number {
  if (stats.lastSolvedDate === null) return 0;
  return daysBetween(stats.lastSolvedDate, today) <= 1 ? stats.currentStreak : 0;
}
