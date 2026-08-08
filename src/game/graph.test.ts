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
  it("is false while any route to the target remains", () => {
    expect(isDeadEnd(testDay, [], "sten")).toBe(false);
  });

  it("is true when the target is unreachable", () => {
    expect(isDeadEnd(testDay, ["tak", "glas"], "glas")).toBe(true);
  });

  it("is false when only a long way round exists — there is no budget", () => {
    const chain = ["tak", "glas", "mur"];
    expect(distanceToTarget(testDay, chain, "mur")).toBe(2);
    expect(isDeadEnd(testDay, chain, "mur")).toBe(false);
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
  it("finds every route, shortest first", () => {
    expect(allSolutions(testDay)).toEqual([["bro"], ["mur", "vägg"]]);
  });

  it("ignores the stored budget — a long way round is a real win", () => {
    // budget 2 would once have hidden mur→vägg; no longer.
    expect(allSolutions(day({ budget: 2 }))).toEqual([["bro"], ["mur", "vägg"]]);
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
