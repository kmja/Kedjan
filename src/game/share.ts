import type { Day, DayProgress } from "../types";
import { plural } from "./plural";

/**
 * The share line, as specified in the handover:
 *
 *   Kedjan · grund → skär · 3/4 länkar (par 3)
 *   🔗🔗🔗 ⭐
 *
 * Hints are confessed — a shared result that hides them isn't a result. Failed
 * welds ride along as the second stat: they're the closest thing the game has
 * to a measure of how hard the day fought back.
 */
export function shareText(day: Day, progress: DayProgress, url?: string): string {
  const links = progress.chain.length + 1;
  const notes = [
    progress.hints > 0 ? plural(progress.hints, "ledtråd", "ledtrådar") : null,
    progress.misses > 0 ? plural(progress.misses, "felförsök", "felförsök") : null,
  ].filter((n): n is string => n !== null);

  const headline =
    `Kedjan · ${day.start} → ${day.target} · ${links}/${day.budget} länkar (par ${day.par})` +
    (notes.length ? ` · ${notes.join(" · ")}` : "");

  const chain = "🔗".repeat(links) + (links <= day.par ? " ⭐" : "");

  return [headline, chain, url].filter(Boolean).join("\n");
}

export type ShareOutcome = "shared" | "copied" | "failed";

/** Native share sheet where it exists, clipboard everywhere else. */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      // A cancelled share sheet is not a failure — fall through to the clipboard
      // only if the share was actually unavailable rather than dismissed.
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
