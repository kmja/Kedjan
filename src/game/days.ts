import type { Day } from "../types";
import { daysBetween } from "./dates";

/**
 * The calendar is a static file, not a bundle import, so a curated day can be
 * added or pulled without rebuilding and redeploying the client.
 */
export async function fetchCalendar(signal?: AbortSignal): Promise<Day[]> {
  const url = `${import.meta.env.BASE_URL}days.json`;
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`Kunde inte hämta dagarna (${res.status}).`);
  const days = (await res.json()) as Day[];
  return days.slice().sort((a, b) => a.date.localeCompare(b.date));
}

export type Tier = "easy" | "hard";

/** The day's tier, derived by par for data from before the field existed. */
export const tierOf = (d: Day): Tier => d.tier ?? (d.par <= 3 ? "easy" : "hard");

/** The key a day's progress is stored under — a date carries two chains. */
export const dayKey = (d: Day): string => `${d.date}#${tierOf(d)}`;

/** Days the player is allowed to see: today and everything behind it. */
export function releasedDays(calendar: readonly Day[], today: string): Day[] {
  return calendar.filter((d) => daysBetween(d.date, today) >= 0);
}

/**
 * Today's puzzle in the given tier. If the curated calendar has run dry — the
 * pipeline is meant to stay ahead of the date, but a lapse must not produce
 * an empty screen — fall back to the most recent released day, and if the
 * tier itself has no days (a calendar from before the tiers), to any.
 */
export function dayForDate(
  calendar: readonly Day[],
  today: string,
  tier: Tier = "easy",
): Day | null {
  const released = releasedDays(calendar, today);
  const inTier = released.filter((d) => tierOf(d) === tier);
  return (
    inTier.find((d) => d.date === today) ??
    inTier.at(-1) ??
    released.find((d) => d.date === today) ??
    released.at(-1) ??
    null
  );
}
