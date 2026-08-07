import { beforeEach, describe, expect, it } from "vitest";
import { emptyStats, liveStreak, loadSave, persistSave, recordSolve } from "./storage";

describe("recordSolve", () => {
  it("counts the first solve and opens a streak", () => {
    const s = recordSolve(emptyStats(), "2026-08-06", 3, 3);
    expect(s).toMatchObject({ played: 1, solved: 1, currentStreak: 1, maxStreak: 1 });
    expect(s.linkHistogram).toEqual({ 3: 1 });
  });

  it("credits a solve under par", () => {
    expect(recordSolve(emptyStats(), "2026-08-06", 2, 3).underPar).toBe(1);
    expect(recordSolve(emptyStats(), "2026-08-06", 3, 3).underPar).toBe(0);
    expect(recordSolve(emptyStats(), "2026-08-06", 4, 3).underPar).toBe(0);
  });

  it("extends the streak on consecutive days", () => {
    let s = recordSolve(emptyStats(), "2026-08-04", 3, 3);
    s = recordSolve(s, "2026-08-05", 3, 3);
    s = recordSolve(s, "2026-08-06", 3, 3);
    expect(s.currentStreak).toBe(3);
    expect(s.maxStreak).toBe(3);
  });

  it("restarts the streak after a skipped day but keeps the record", () => {
    let s = recordSolve(emptyStats(), "2026-08-01", 3, 3);
    s = recordSolve(s, "2026-08-02", 3, 3);
    s = recordSolve(s, "2026-08-06", 3, 3);
    expect(s.currentStreak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });

  it("lets an archive solve count without rewriting the calendar streak", () => {
    let s = recordSolve(emptyStats(), "2026-08-06", 3, 3);
    s = recordSolve(s, "2026-07-14", 4, 3);
    expect(s.solved).toBe(2);
    expect(s.currentStreak).toBe(1);
    expect(s.lastSolvedDate).toBe("2026-08-06");
  });

  it("does not let an archive solve break a live streak", () => {
    let s = recordSolve(emptyStats(), "2026-08-05", 3, 3);
    s = recordSolve(s, "2026-08-06", 3, 3);
    s = recordSolve(s, "2026-01-01", 3, 3);
    expect(s.currentStreak).toBe(2);
  });
});

describe("liveStreak", () => {
  it("is zero before the first solve", () => {
    expect(liveStreak(emptyStats(), "2026-08-06")).toBe(0);
  });

  it("survives an unplayed today", () => {
    const s = recordSolve(emptyStats(), "2026-08-05", 3, 3);
    expect(liveStreak(s, "2026-08-06")).toBe(1);
  });

  it("goes cold once a whole day has been missed", () => {
    const s = recordSolve(emptyStats(), "2026-08-04", 3, 3);
    expect(liveStreak(s, "2026-08-06")).toBe(0);
    // ...but the history behind it is untouched.
    expect(s.maxStreak).toBe(1);
  });
});

describe("loadSave", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a save", () => {
    persistSave({
      progress: { "2026-08-06": { chain: ["mur"], solved: false, hints: 1, misses: 2 } },
      stats: recordSolve(emptyStats(), "2026-08-05", 3, 3),
    });
    const back = loadSave();
    expect(back.progress["2026-08-06"]?.chain).toEqual(["mur"]);
    expect(back.stats.solved).toBe(1);
  });

  it("returns empty state rather than throwing on a corrupt save", () => {
    localStorage.setItem("kedjan.v1", "{not json");
    expect(loadSave()).toEqual({ progress: {}, stats: emptyStats() });
  });

  it("backfills fields missing from an older save", () => {
    localStorage.setItem("kedjan.v1", JSON.stringify({ stats: { solved: 4 } }));
    const back = loadSave();
    expect(back.stats.solved).toBe(4);
    expect(back.stats.linkHistogram).toEqual({});
  });
});
