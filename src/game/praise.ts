/**
 * What the game says when a chain closes.
 *
 * One phrase would be one phrase a day forever, so there is a handful and
 * the win picks from it. Nothing here names the chain: the board has just
 * drawn a finished one, and the player can see that it holds.
 */
const PRAISE = [
  "Snyggt!",
  "Bra jobbat!",
  "Där satt den!",
  "Klockrent!",
  "Snyggt jobbat!",
  "Starkt!",
  "Precis så!",
  "Fint!",
] as const;

export function praise(pick = Math.random): string {
  const i = Math.floor(pick() * PRAISE.length) % PRAISE.length;
  return PRAISE[i] ?? PRAISE[0];
}
