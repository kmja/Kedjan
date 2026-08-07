import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { testDay } from "./game/testDay";
import type { Day } from "./types";

const YESTERDAY: Day = {
  ...testDay,
  date: "2026-08-05",
  no: 1,
  start: "hav",
  target: "vind",
  pool: ["salt", "bris"],
  pairs: { "hav>salt": "havssalt", "salt>vind": "saltvind" },
};

const CALENDAR: Day[] = [YESTERDAY, { ...testDay, date: "2026-08-06", no: 2 }];

function mockCalendar(days: Day[] = CALENDAR) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(days), { status: 200 })),
  );
}

/** Waits past the calendar fetch so assertions run against a live board. */
const board = () => screen.findByRole("group", { name: /delar att välja bland/i });

/**
 * The live region is always in the DOM, so `findByRole` would resolve against
 * an empty node before the state update lands. Wait on the content instead.
 */
const expectStatus = (text: string | RegExp) =>
  waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));

beforeEach(() => {
  localStorage.clear();
  // Fake only the clock. Faking setTimeout too would starve React's scheduler
  // and make these tests flake under parallel load.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 6, 10, 0, 0));
  mockCalendar();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const user = () => userEvent.setup();

describe("the day board", () => {
  it("serves the puzzle dated today", async () => {
    render(<App />);
    const pool = await board();
    expect(screen.getByText(/#2 · torsdag 6 augusti/)).toBeInTheDocument();
    expect(within(pool).getAllByRole("button")).toHaveLength(testDay.pool.length);
  });

  it("shows an empty chain with one open joint, and never says how long it should be", async () => {
    render(<App />);
    await board();
    // The target is the foot of the bridge, not a control to press.
    expect(screen.queryByRole("button", { name: /^hus$/i })).not.toBeInTheDocument();
    // One place to add a part, and no row of gaps announcing the answer's shape.
    expect(screen.getAllByRole("button", { name: /lägg en del efter/i })).toHaveLength(1);
    expect(screen.getByText("1 länk")).toBeInTheDocument();
    // Par is part of the puzzle until a hint is spent on it. (The dev panel
    // is on under import.meta.env.DEV, so scope to the controls.)
    const controls = screen.getByRole("button", { name: /^ledtråd/i }).closest("div")!;
    expect(within(controls).queryByText(/par/i)).not.toBeInTheDocument();
  });
});

describe("building the chain", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const link = (n: number, part: string) =>
    screen.getByRole("button", { name: new RegExp(`^länk ${n}, ${part}\\.`, "i") });
  // A judged joint leads its label with the verdict, so this is unanchored.
  const joint = (after: string) =>
    screen.getByRole("button", { name: new RegExp(`lägg en del efter ${after}`, "i") });

  it("accepts a part that does not weld, without complaint", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg is not a word
    expect(link(1, "vägg")).toBeInTheDocument();
  });

  it("grows the chain a part at a time", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    expect(screen.getByText("2 länkar")).toBeInTheDocument();
    await u.click(chip("glas"));
    expect(link(1, "vägg")).toBeInTheDocument();
    expect(link(2, "glas")).toBeInTheDocument();
    expect(screen.getByText("3 länkar")).toBeInTheDocument();
  });

  it("inserts at the joint the player aimed at", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    // Aim at the joint after the start, so the next part goes in front.
    await u.click(joint("sten"));
    await u.click(chip("glas"));
    expect(link(1, "glas")).toBeInTheDocument();
    expect(link(2, "vägg")).toBeInTheDocument();
  });

  it("moves a part rather than duplicating it", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(chip("glas"));
    await u.click(joint("sten"));
    await u.click(link(2, "glas"));   // out of the chain
    await u.click(chip("glas"));      // back in, at the armed joint
    expect(link(1, "glas")).toBeInTheDocument();
    // Exactly one home: in the chain, and no longer in the pool.
    expect(screen.queryByRole("button", { name: /^glas\./i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^länk 2, glas/i })).not.toBeInTheDocument();
  });

  it("closes the chain up when a part is taken out", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(chip("glas"));
    await u.click(link(1, "vägg"));
    // glas moves up rather than leaving a hole behind.
    expect(link(1, "glas")).toBeInTheDocument();
    expect(chip("vägg")).toBeInTheDocument();
  });

  it("refuses to grow past the budget", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(chip("glas"));
    await u.click(chip("tak"));   // three parts is four links, the budget
    await u.click(chip("mur"));
    await expectStatus(/kan inte bli längre/);
  });
});

describe("judging the chain", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });

  it("marks a joint that holds as soon as a part lands", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));   // sten+mur ✓
    expect(await screen.findAllByText("länken håller")).toHaveLength(1);
  });

  it("marks a joint that does not hold", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg ✗
    expect(await screen.findAllByText("bruten länk")).toHaveLength(1);
  });

  it("withholds a verdict on the final joint while slots remain", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    // sten+mur holds; mur+hus does not, but with two slots free the honest
    // answer is "not yet", not "wrong".
    expect(screen.queryByText("bruten länk")).not.toBeInTheDocument();
  });

  it("judges the final joint once the board is full", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await expectStatus(/håller inte/);
    expect(screen.getAllByText("bruten länk").length).toBeGreaterThan(0);
  });

  it("re-judges after a part is taken back out", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    expect(await screen.findAllByText("bruten länk")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: /^länk 1, vägg\./i }));
    expect(screen.queryByText("bruten länk")).not.toBeInTheDocument();
  });

  it("finishes the day on the placement that completes the chain", async () => {
    const u = user();
    render(<App />);
    await board();
    // sten+bro ✓ and bro+hus ✓ — two links, well under the budget of four.
    await u.click(chip("bro"));
    expect(await screen.findByText("stenbro → brohus")).toBeInTheDocument();
  });

  it("counts a full board that does not hold as a felförsök", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await expectStatus(/håller inte/);

    await u.click(screen.getByRole("button", { name: "Rensa" }));
    await u.click(chip("bro"));
    await screen.findByText("stenbro → brohus");
    await u.click(screen.getByRole("button", { name: "Dela resultat" }));
    expect(await navigator.clipboard.readText()).toContain("1 felförsök");
  });

  it("plays entirely from the keyboard", async () => {
    const u = user();
    render(<App />);
    await board();
    chip("bro").focus();
    await u.keyboard("{Enter}");
    expect(await screen.findByText("stenbro → brohus")).toBeInTheDocument();
  });
});

describe("solving", () => {
  const solveUnderPar = async (u: ReturnType<typeof user>) => {
    // Placing bro completes the chain, which is what finishes the day.
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
  };

  it("spells the chain back and calls an under-par result", async () => {
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);
    expect(await screen.findByText("stenbro → brohus")).toBeInTheDocument();
    expect(screen.getByText(/Under par — briljant!/)).toBeInTheDocument();
  });

  it("reveals how many other routes existed", async () => {
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);
    const reveal = await screen.findByRole("button", { name: /1 annan väg fanns/i });
    await u.click(reveal);
    expect(screen.getByText("sten + mur + vägg + hus")).toBeInTheDocument();
  });

  it("copies the share line to the clipboard", async () => {
    // No native share sheet in jsdom, so this exercises the clipboard fallback.
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);
    await u.click(await screen.findByRole("button", { name: "Dela resultat" }));

    expect(await screen.findByRole("button", { name: "Kopierat ✓" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(
      `Kedjan · sten → hus · 2/4 länkar (par 3)\n🔗🔗 ⭐\n${window.location.origin}`,
    );
  });
});

describe("test mode", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const solve = async (u: ReturnType<typeof user>) => {
    await u.click(chip("bro"));
    await screen.findByText("stenbro → brohus");
  };

  beforeEach(() => {
    window.history.replaceState({}, "", "/?dev=1");
  });
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.removeItem("kedjan.dev");
  });

  it("stays hidden without the flag", async () => {
    window.history.replaceState({}, "", "/?dev=0");
    render(<App />);
    await board();
    expect(screen.queryByRole("region", { name: "Testverktyg" })).not.toBeInTheDocument();
  });

  it("lists every weld in the day, so a bad one is visible at a glance", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^7 ord/i }));
    expect(screen.getByText("stenmur")).toBeInTheDocument();
    expect(screen.getByText("takglas")).toBeInTheDocument();
  });

  it("lists every solution", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^2 lösningar/i }));
    expect(screen.getByText(/stenmur → murvägg → vägghus/)).toBeInTheDocument();
  });

  it("puts a solved day back on the table", async () => {
    const u = user();
    render(<App />);
    await board();
    await solve(u);

    await u.click(screen.getByRole("button", { name: "Spela om dagen" }));
    expect(screen.queryByText("stenbro → brohus")).not.toBeInTheDocument();
    expect(chip("bro")).toBeInTheDocument();
    expect(screen.getByText("1 länk")).toBeInTheDocument();
  });

  it("does not count a replayed day twice", async () => {
    const u = user();
    render(<App />);
    await board();
    await solve(u);
    await u.click(screen.getByRole("button", { name: "Spela om dagen" }));
    await solve(u);

    // Read the stats themselves rather than the panel: the histogram also
    // renders link counts, which look like day counts in the DOM.
    const saved = JSON.parse(localStorage.getItem("kedjan.v1") ?? "{}");
    expect(saved.stats.played).toBe(1);
    expect(saved.stats.solved).toBe(1);
    expect(saved.stats.linkHistogram).toEqual({ 2: 1 });
  });

  it("cannot be replayed before the day is solved", async () => {
    render(<App />);
    await board();
    expect(screen.getByRole("button", { name: "Spela om dagen" })).toBeDisabled();
  });
});

describe("persistence", () => {
  it("keeps a half-built chain across a reload", async () => {
    const u = user();
    const { unmount } = render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    unmount();

    render(<App />);
    await board();
    expect(screen.getByText("2 länkar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^mur\./i })).not.toBeInTheDocument();
  });
});

describe("the archive", () => {
  it("lists released days and never leaks an unreleased one", async () => {
    const u = user();
    mockCalendar([...CALENDAR, { ...testDay, date: "2026-08-07", no: 3, start: "fjäll" }]);
    render(<App />);
    await board();
    await u.click(screen.getByRole("tab", { name: "Arkiv" }));

    const archive = screen.getByRole("region", { name: "Arkiv" });
    expect(within(archive).getAllByRole("button")).toHaveLength(2);
    expect(within(archive).queryByText(/fjäll/i)).not.toBeInTheDocument();
  });

  it("opens an older day for play", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("tab", { name: "Arkiv" }));
    await u.click(screen.getByRole("button", { name: /hav → vind/i }));

    expect(screen.getByText(/#1 · onsdag 5 augusti · arkiv/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^salt\./i })).toBeInTheDocument();
  });
});

describe("when the calendar cannot be fetched", () => {
  it("says so instead of showing a blank board", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Kunde inte hämta/);
  });
});
