/** A single day, exactly as `kedjan-generator.py` emits it. Under a kilobyte. */
export interface Day {
  /** ISO date (YYYY-MM-DD) this day is scheduled for. */
  date: string;
  /** Sequential puzzle number, shown in the share line. */
  no: number;
  start: string;
  target: string;
  /** Intended number of links. 3 for weekdays, 4 for harder days. */
  par: number;
  /** Hard cap on links. Always par + 1. */
  budget: number;
  /** The ten part-chips the player may use. */
  pool: string[];
  /** "a>b" -> the real compound that witnesses the weld. */
  pairs: Record<string, string>;
}

/** Per-day progress, persisted so a reload never costs the player their chain. */
export interface DayProgress {
  /** Intermediate parts placed so far, start and target excluded. */
  chain: string[];
  solved: boolean;
  hints: number;
  /** Rejected welds — "är inte ett ord" — counted for the share line. */
  misses: number;
  /** Set once, when the day is first solved. */
  solvedAt?: string;
}

export interface Stats {
  played: number;
  solved: number;
  /** Solved within par, i.e. under budget. */
  underPar: number;
  currentStreak: number;
  maxStreak: number;
  /** ISO date of the most recent solve, used to decide streak continuity. */
  lastSolvedDate: string | null;
  /** Link count -> how many days finished at that count. */
  linkHistogram: Record<number, number>;
}
