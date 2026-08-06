import { describe, expect, it } from "vitest";
import { dayForDate, releasedDays } from "./days";
import { daysBetween, formatShortDate, formatSwedishDate, todayISO } from "./dates";
import { day } from "./testDay";
import { allSolutions } from "./graph";
import calendar from "../../public/days.json" with { type: "json" };
import type { Day } from "../types";

const cal = [
  day({ date: "2026-08-04", no: 1 }),
  day({ date: "2026-08-05", no: 2 }),
  day({ date: "2026-08-06", no: 3 }),
  day({ date: "2026-08-07", no: 4 }),
];

describe("rotation", () => {
  it("hides days that have not been released yet", () => {
    expect(releasedDays(cal, "2026-08-05").map((d) => d.no)).toEqual([1, 2]);
  });

  it("serves the day whose date is today", () => {
    expect(dayForDate(cal, "2026-08-06")?.no).toBe(3);
  });

  it("falls back to the latest released day if the calendar runs dry", () => {
    expect(dayForDate(cal, "2026-09-01")?.no).toBe(4);
  });

  it("returns null before the calendar starts rather than leaking a future day", () => {
    expect(dayForDate(cal, "2026-01-01")).toBeNull();
  });
});

describe("dates", () => {
  it("counts whole days in both directions", () => {
    expect(daysBetween("2026-08-05", "2026-08-06")).toBe(1);
    expect(daysBetween("2026-08-06", "2026-08-05")).toBe(-1);
    expect(daysBetween("2026-08-06", "2026-08-06")).toBe(0);
  });

  it("crosses a month boundary", () => {
    expect(daysBetween("2026-07-31", "2026-08-01")).toBe(1);
  });

  it("is unaffected by the daylight-saving shift", () => {
    // Sweden springs forward on 2026-03-29.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });

  it("uses the local calendar day, not UTC", () => {
    const lateEvening = new Date(2026, 7, 6, 23, 30);
    expect(todayISO(lateEvening)).toBe("2026-08-06");
  });

  it("formats Swedish dates", () => {
    expect(formatSwedishDate("2026-08-06")).toBe("torsdag 6 augusti");
    expect(formatShortDate("2026-08-06")).toBe("6/8");
  });
});

describe("the shipped calendar", () => {
  const days = calendar as Day[];

  it("is non-empty and dated in order", () => {
    expect(days.length).toBeGreaterThan(0);
    const dates = days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("numbers days sequentially", () => {
    expect(days.map((d) => d.no)).toEqual(days.map((_, i) => i + 1));
  });

  it.each(days.map((d) => [`#${d.no} ${d.start}→${d.target}`, d] as const))(
    "%s is solvable inside its budget",
    (_label, d) => {
      expect(d.budget).toBe(d.par + 1);
      const solutions = allSolutions(d);
      // The generator's hard requirement: many welds, few escapes.
      expect(solutions.length).toBeGreaterThanOrEqual(3);
      expect(solutions.length).toBeLessThanOrEqual(12);
      // A day with a direct start→target compound has no puzzle in it.
      expect(d.pairs[`${d.start}>${d.target}`]).toBeUndefined();
    },
  );

  it.each(days.map((d) => [`#${d.no}`, d] as const))(
    "%s has a pool of at least nine parts, endpoints excluded",
    (_label, d) => {
      expect(d.pool.length).toBeGreaterThanOrEqual(9);
      expect(d.pool).not.toContain(d.start);
      expect(d.pool).not.toContain(d.target);
      expect(new Set(d.pool).size).toBe(d.pool.length);
    },
  );

  it("never repeats a start or a target", () => {
    expect(new Set(days.map((d) => d.start)).size).toBe(days.length);
    expect(new Set(days.map((d) => d.target)).size).toBe(days.length);
  });

  it("witnesses every pair with a compound that is the two parts joined", () => {
    for (const d of days) {
      for (const [key, word] of Object.entries(d.pairs)) {
        const [a, b] = key.split(">") as [string, string];
        // Allow the foge-s and foge-e linking morphemes, nothing else.
        expect([a + b, `${a}s${b}`, `${a}e${b}`]).toContain(word);
      }
    }
  });
});
