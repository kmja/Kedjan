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
  /**
   * The budget's slots, in order, `budget - 1` of them. A slot holds a part or
   * nothing; parts go in in any order and nothing is checked until the player
   * closes the chain onto the target. Empty slots simply drop out, so a
   * two-link answer is one filled slot and the rest left blank.
   */
  slots: (string | null)[];
  solved: boolean;
  hints: number;
  /** Chains submitted that did not hold — counted for the share line. */
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
