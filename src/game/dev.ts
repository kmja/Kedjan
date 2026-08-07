const KEY = "kedjan.dev";

/**
 * Test mode. Off in production unless asked for: `?dev` turns it on and sticks
 * (so a reload keeps it), `?dev=0` turns it off again. It is always on under
 * `npm run dev`.
 *
 * It exists because playtesting needs two things the game deliberately refuses
 * a player: replaying a day you have already solved, and seeing every weld at
 * once. Probing a pool one tap at a time is how `morfin` survived several
 * rounds of review.
 */
export function isDevMode(): boolean {
  try {
    const flag = new URLSearchParams(window.location.search).get("dev");
    if (flag !== null) {
      const on = flag !== "0" && flag !== "false";
      on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY);
      return on;
    }
    return import.meta.env.DEV || localStorage.getItem(KEY) === "1";
  } catch {
    return import.meta.env.DEV;
  }
}
