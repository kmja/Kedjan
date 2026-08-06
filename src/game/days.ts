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

/** Days the player is allowed to see: today and everything behind it. */
export function releasedDays(calendar: readonly Day[], today: string): Day[] {
  return calendar.filter((d) => daysBetween(d.date, today) >= 0);
}

/**
 * Today's puzzle. If the curated calendar has run dry — the pipeline is meant
 * to stay ahead of the date, but a lapse must not produce an empty screen —
 * fall back to the most recent released day.
 */
export function dayForDate(calendar: readonly Day[], today: string): Day | null {
  const released = releasedDays(calendar, today);
  return released.find((d) => d.date === today) ?? released.at(-1) ?? null;
}
