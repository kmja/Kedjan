import type { Day } from "../types";

/**
 * A hand-built day with a known shape, used across the logic tests:
 *
 *   sten →  bro  → hus        two links, under par
 *   sten → mur → vägg → hus   three links, on par
 *   sten → tak → glas         a cul-de-sac: glas welds to nothing
 *
 * Budget 4, so no four-link route exists — exactly two solutions.
 */
export const testDay: Day = {
  date: "2026-08-06",
  no: 1,
  start: "sten",
  target: "hus",
  par: 3,
  budget: 4,
  tier: "easy",
  pool: ["mur", "vägg", "bro", "tak", "glas"],
  pairs: {
    "sten>mur": "stenmur",
    "sten>bro": "stenbro",
    "sten>tak": "stentak",
    "mur>vägg": "murvägg",
    "vägg>hus": "vägghus",
    "bro>hus": "brohus",
    "tak>glas": "takglas",
  },
};

export const day = (over: Partial<Day> = {}): Day => ({ ...testDay, ...over });
