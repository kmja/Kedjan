import { describe, expect, it } from "vitest";
import { shareText } from "./share";
import { testDay } from "./testDay";
import { emptyProgress } from "./storage";

const solved = (over: Partial<ReturnType<typeof emptyProgress>> = {}) => ({
  ...emptyProgress(),
  solved: true,
  ...over,
});

describe("shareText", () => {
  it("matches the specified format", () => {
    const text = shareText(testDay, solved({ chain: ["mur", "vägg"] }));
    expect(text).toBe("Kedjan · sten → hus · 3 länkar (par 3)\n🔗🔗🔗 ⭐");
  });

  it("stars a result at or under par, and only there", () => {
    expect(shareText(testDay, solved({ chain: ["bro"] }))).toContain("🔗🔗 ⭐");
    expect(shareText(testDay, solved({ chain: ["a", "b", "c"] }))).not.toContain("⭐");
  });

  it("confesses hints", () => {
    expect(shareText(testDay, solved({ chain: ["bro"], hints: 1 }))).toContain(
      "· 1 ledtråd",
    );
    expect(shareText(testDay, solved({ chain: ["bro"], hints: 3 }))).toContain(
      "· 3 ledtrådar",
    );
  });

  it("reports failed welds as the second stat", () => {
    expect(shareText(testDay, solved({ chain: ["bro"], misses: 2 }))).toContain(
      "· 2 felförsök",
    );
  });

  it("keeps a clean line when the day was walked straight through", () => {
    const text = shareText(testDay, solved({ chain: ["bro"] }));
    expect(text).not.toContain("ledtråd");
    expect(text).not.toContain("felförsök");
  });

  it("appends the url as its own line when given one", () => {
    const text = shareText(testDay, solved({ chain: ["bro"] }), "https://kedjan.se");
    expect(text.split("\n").at(-1)).toBe("https://kedjan.se");
  });
});
