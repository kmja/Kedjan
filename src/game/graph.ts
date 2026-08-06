import type { Day } from "../types";

/**
 * The day's pair graph is the whole rule set. If `a>b` is in `pairs`, the two
 * parts fuse into the real compound stored there; if it isn't, they don't.
 * The client never guesses at Swedish morphology — the generator already did.
 */
export function weld(day: Day, a: string, b: string): string | undefined {
  return day.pairs[`${a}>${b}`];
}

/** Parts still on the table: pool minus what's already placed, minus endpoints. */
export function availableParts(day: Day, chain: readonly string[]): string[] {
  return day.pool.filter(
    (p) => !chain.includes(p) && p !== day.start && p !== day.target,
  );
}

/**
 * Breadth-first search over the day's pool graph from where the player stands.
 * Returns how many more links it takes to reach the target, or null if the
 * target is unreachable from here with the parts that remain.
 *
 * This is the entire hint engine. No authoring, no AI — it re-solves from the
 * player's actual position every time, so it stays correct after any detour.
 */
export function distanceToTarget(
  day: Day,
  chain: readonly string[],
  from: string,
): number | null {
  if (weld(day, from, day.target)) return 1;

  const avail = availableParts(day, chain);
  const dist = new Map<string, number>([[from, 0]]);
  const queue: string[] = [from];

  while (queue.length) {
    const p = queue.shift()!;
    const d = dist.get(p)!;
    for (const x of avail) {
      if (dist.has(x) || !weld(day, p, x)) continue;
      dist.set(x, d + 1);
      // Reaching x costs d+1 links; the final weld onto the target costs one more.
      if (weld(day, x, day.target)) return d + 2;
      queue.push(x);
    }
  }
  return null;
}

/** Links the player has left before the budget is spent. */
export function linksRemaining(day: Day, chain: readonly string[]): number {
  return day.budget - chain.length;
}

/**
 * A position is dead if the target cannot be reached at all, or cannot be
 * reached inside the remaining budget. Both earn the free rescue — telling a
 * player "the target is 3 words away" when they have one link left would be a
 * hint that costs them the day.
 */
export function isDeadEnd(day: Day, chain: readonly string[], from: string): boolean {
  const d = distanceToTarget(day, chain, from);
  return d === null || d > linksRemaining(day, chain);
}

/**
 * The chip that shortens the distance — second-tier hint. Prefers the most
 * connected next step so the marked chip keeps the player's options open.
 */
export function bestNextPart(
  day: Day,
  chain: readonly string[],
  from: string,
): string | null {
  const d = distanceToTarget(day, chain, from);
  if (d === null) return null;
  if (d === 1) return day.target;

  for (const x of availableParts(day, chain)) {
    if (!weld(day, from, x)) continue;
    if (distanceToTarget(day, [...chain, x], x) === d - 1) return x;
  }
  return null;
}

/**
 * Every winning chain within budget, as arrays of intermediate parts.
 * Used for the post-solve "andra vägar" reveal. The generator caps a day at
 * 12 solutions, so this is cheap; `cap` is a guard, not a design limit.
 */
export function allSolutions(day: Day, cap = 64): string[][] {
  const found: string[][] = [];
  const pool = availableParts(day, []);

  const walk = (from: string, chain: string[]): void => {
    if (found.length >= cap) return;
    if (chain.length + 1 <= day.budget && weld(day, from, day.target)) {
      found.push([...chain]);
    }
    if (chain.length + 1 >= day.budget) return;
    for (const x of pool) {
      if (chain.includes(x) || !weld(day, from, x)) continue;
      walk(x, [...chain, x]);
    }
  };

  walk(day.start, []);
  return found.sort((a, b) => a.length - b.length);
}

/** Render a chain as the compounds it spells: "grundval → valnatt → nattskär". */
export function spellChain(day: Day, chain: readonly string[]): string[] {
  const full = [day.start, ...chain, day.target];
  const words: string[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    const w = weld(day, full[i]!, full[i + 1]!);
    if (w) words.push(w);
  }
  return words;
}

/** Two chains are the same route regardless of how the player got there. */
export function sameChain(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}
