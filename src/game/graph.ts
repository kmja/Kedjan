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

/**
 * A position is dead only if the target cannot be reached at all. There is
 * no link budget — a chain may take the long way round — so the only wall
 * left is the pool running out, and distanceToTarget already searches only
 * the chips still on the table.
 */
export function isDeadEnd(day: Day, chain: readonly string[], from: string): boolean {
  return distanceToTarget(day, chain, from) === null;
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
 * Every winning chain, of any length the pool can carry, as arrays of
 * intermediate parts. Used for the post-solve "andra vägar" reveal. The
 * curated route structure lives within par + 1 links, but with no budget a
 * longer way round is a real way to win and belongs on the map; `cap` is a
 * guard, not a design limit.
 */
export function allSolutions(day: Day, cap = 64): string[][] {
  const found: string[][] = [];
  const pool = availableParts(day, []);

  const walk = (from: string, chain: string[]): void => {
    if (found.length >= cap) return;
    if (weld(day, from, day.target)) {
      found.push([...chain]);
    }
    for (const x of pool) {
      if (chain.includes(x) || !weld(day, from, x)) continue;
      walk(x, [...chain, x]);
    }
  };

  walk(day.start, []);
  return found.sort((a, b) => a.length - b.length);
}

/** The full sequence a chain represents, endpoints included. */
export function fullChain(day: Day, chain: readonly string[]): string[] {
  return [day.start, ...chain, day.target];
}

/**
 * Indices of the joints that do not weld, over `fullChain`. Joint `i` sits
 * between element `i` and `i + 1`.
 *
 * Parts are placed freely and nothing is checked until the player closes the
 * chain onto the target, so this runs over the whole bridge at once and
 * reports every failure rather than stopping at the first.
 */
export function brokenJoints(day: Day, chain: readonly string[]): number[] {
  const full = fullChain(day, chain);
  const broken: number[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    if (!weld(day, full[i]!, full[i + 1]!)) broken.push(i);
  }
  return broken;
}

/**
 * How many links from the start hold before the first break, and the part the
 * player has effectively reached. Hints anchor here: pathfinding from the end
 * of what already works is the only position that means anything once parts
 * can be arranged out of order.
 */
export function validPrefix(day: Day, chain: readonly string[]): { length: number; at: string } {
  let at = day.start;
  let length = 0;
  for (const part of chain) {
    if (!weld(day, at, part)) break;
    at = part;
    length++;
  }
  return { length, at };
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

/**
 * Parts that still appear in some winning route, given what is already placed.
 *
 * Solutions are filtered to those that begin with the run the player has built
 * and that holds; the live set is every part those routes still need. If
 * nothing extends the current run — the player has built into a corner — every
 * solution counts, because the useful advice then is about the whole board
 * rather than about a dead position.
 */
export function livingParts(day: Day, chain: readonly string[]): Set<string> {
  const { length } = validPrefix(day, chain);
  const prefix = chain.slice(0, length);
  const all = allSolutions(day);

  const extending = all.filter(
    (route) => prefix.every((part, i) => route[i] === part),
  );
  const routes = extending.length ? extending : all;

  const live = new Set<string>();
  for (const route of routes) {
    for (const part of route.slice(prefix.length)) live.add(part);
  }
  return live;
}

/** Two chains are the same route regardless of how the player got there. */
export function sameChain(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}
