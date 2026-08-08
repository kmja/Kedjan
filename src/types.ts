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
  /**
   * Which lexicon witnessed this day's welds — a temporary A/B label while
   * the two curation modes are compared in play. "sfol" accepts any compound
   * the spellchecker's list carries; "saldo" only compounds established
   * enough to be SALDO lemmas.
   */
  lexicon?: "sfol" | "saldo";
}

/** Per-day progress, persisted so a reload never costs the player their chain. */
export interface DayProgress {
  /**
   * The parts placed so far, in order, endpoints excluded. The chain grows as
   * the player builds it — there is no row of empty slots, because the number
   * of links a day needs is part of the puzzle rather than something the board
   * announces. The budget is still a ceiling; par is only revealed on request.
   */
  chain: string[];
  solved: boolean;
  hints: number;
  /** Chains submitted that did not hold — counted for the share line. */
  misses: number;
  /**
   * Set once, when the day is first solved, and never overwritten. Replaying a
   * day must not tell the stats it was solved twice, so this doubles as the
   * record of whether the day has already counted.
   */
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
