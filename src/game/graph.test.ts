import { describe, expect, it } from "vitest";
import {
  allSolutions,
  availableParts,
  bestNextPart,
  distanceToTarget,
  isDeadEnd,
  spellChain,
  weld,
} from "./graph";
import { day, testDay } from "./testDay";

describe("weld", () => {
  it("returns the witnessing compound for a real pair", () => {
    expect(weld(testDay, "sten", "mur")).toBe("stenmur");
  });

  it("is directional — murssten is not stenmur backwards", () => {
    expect(weld(testDay, "mur", "sten")).toBeUndefined();
  });
});

describe("availableParts", () => {
  it("drops parts already placed", () => {
    expect(availableParts(testDay, ["mur"])).toEqual(["vägg", "bro", "tak", "glas"]);
  });

  it("never offers the endpoints as chips", () => {
    const d = day({ pool: ["mur", "sten", "hus"] });
    expect(availableParts(d, [])).toEqual(["mur"]);
  });
});

describe("distanceToTarget", () => {
  it("counts the remaining links, shortest first", () => {
    expect(distanceToTarget(testDay, [], "sten")).toBe(2);
  });

  it("returns 1 when the target is one weld away", () => {
    expect(distanceToTarget(testDay, ["bro"], "bro")).toBe(1);
  });

  it("returns null from a cul-de-sac", () => {
    expect(distanceToTarget(testDay, ["tak", "glas"], "glas")).toBeNull();
  });

  it("re-solves from the player's real position, not from the start", () => {
    // Detouring through mur still leaves a route: mur → vägg → hus.
    expect(distanceToTarget(testDay, ["mur"], "mur")).toBe(2);
  });

  it("does not route through parts the player already spent", () => {
    const d = day({
      pool: ["mur", "vägg", "bro"],
      pairs: { ...testDay.pairs, "mur>bro": "murbro" },
    });
    // bro is the only one-step exit, and it has been used up.
    expect(distanceToTarget(d, ["bro", "mur"], "mur")).toBe(2); // via vägg
    const noVagg = day({ pool: ["mur", "bro"], pairs: { ...d.pairs } });
    expect(distanceToTarget(noVagg, ["bro", "mur"], "mur")).toBeNull();
  });
});

describe("isDeadEnd", () => {
  it("is false while a route fits inside the budget", () => {
    expect(isDeadEnd(testDay, [], "sten")).toBe(false);
  });

  it("is true when the target is unreachable", () => {
    expect(isDeadEnd(testDay, ["tak", "glas"], "glas")).toBe(true);
  });

  it("is true when a route exists but the budget cannot pay for it", () => {
    // Two links left to walk, one link left to spend.
    const chain = ["tak", "glas", "mur"];
    expect(distanceToTarget(testDay, chain, "mur")).toBe(2);
    expect(isDeadEnd(testDay, chain, "mur")).toBe(true);
  });
});

describe("bestNextPart", () => {
  it("marks the chip that shortens the distance", () => {
    expect(bestNextPart(testDay, [], "sten")).toBe("bro");
  });

  it("marks the target itself on the last link", () => {
    expect(bestNextPart(testDay, ["bro"], "bro")).toBe("hus");
  });

  it("returns null from a dead end", () => {
    expect(bestNextPart(testDay, ["tak", "glas"], "glas")).toBeNull();
  });
});

describe("allSolutions", () => {
  it("finds every route inside the budget, shortest first", () => {
    expect(allSolutions(testDay)).toEqual([["bro"], ["mur", "vägg"]]);
  });

  it("respects the budget", () => {
    expect(allSolutions(day({ budget: 2 }))).toEqual([["bro"]]);
  });

  it("stays inside the generator's 3-12 band on the shipped seed day", () => {
    const solutions = allSolutions(testDay);
    expect(solutions.every((s) => s.length + 1 <= testDay.budget)).toBe(true);
  });
});

describe("spellChain", () => {
  it("renders the compounds the chain spells", () => {
    expect(spellChain(testDay, ["mur", "vägg"])).toEqual([
      "stenmur",
      "murvägg",
      "vägghus",
    ]);
  });
});
