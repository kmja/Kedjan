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

  it("shows the budget as empty slots and the target as a goal", async () => {
    render(<App />);
    await board();
    expect(
      screen.getByRole("button", { name: /mål hus\. slut kedjan/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("0/3 placerade")).toBeInTheDocument();
    // Three empty slots plus the goal: budget 4, nothing spent.
    expect(screen.getAllByText("··")).toHaveLength(3);
  });
});

describe("placing parts freely", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const slot = (n: number) =>
    screen.getByRole("button", { name: new RegExp(`^plats ${n}, tom`, "i") });
  const placed = (n: number, part: string) =>
    screen.getByRole("button", { name: new RegExp(`^plats ${n}, ${part}\\.`, "i") });

  it("accepts a part that does not weld, without complaint", async () => {
    const u = user();
    render(<App />);
    await board();
    // STEN+VÄGG is not a word, but nothing is checked until the chain closes.
    await u.click(chip("vägg"));
    await expectStatus("VÄGG placerad på plats 1.");
    expect(placed(1, "vägg")).toBeInTheDocument();
  });

  it("fills the first free slot by default", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(chip("vägg"));
    expect(placed(1, "mur")).toBeInTheDocument();
    expect(placed(2, "vägg")).toBeInTheDocument();
  });

  it("lets the keyboard aim at a specific slot", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(slot(3));
    await u.click(chip("bro"));
    await expectStatus("BRO placerad på plats 3.");
    expect(placed(3, "bro")).toBeInTheDocument();
    // Slots 1 and 2 are still empty — order of placement is free.
    expect(slot(1)).toBeInTheDocument();
  });

  it("moves a part rather than duplicating it", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(placed(1, "mur"));   // back to the pool
    await u.click(slot(3));            // arm the far slot
    await u.click(chip("mur"));
    expect(placed(3, "mur")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^plats 1, mur/i })).not.toBeInTheDocument();
  });

  it("re-aims a placed part into another slot without duplicating it", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    expect(placed(1, "mur")).toBeInTheDocument();
    await u.click(slot(2));
    await u.click(placed(1, "mur"));
    // Removing it frees slot 1; the part exists in exactly one place at a time.
    expect(screen.getAllByRole("button", { name: /mur/i })).toHaveLength(1);
  });

  it("returns a part to the pool when its slot is activated", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(placed(1, "mur"));
    await expectStatus("MUR tillbaka i poolen.");
    expect(chip("mur")).toBeInTheDocument();
  });

  it("leaves a gap rather than shuffling the rest along", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(chip("vägg"));
    await u.click(placed(1, "mur"));
    // vägg stays where it was put.
    expect(placed(2, "vägg")).toBeInTheDocument();
    expect(slot(1)).toBeInTheDocument();
  });
});

describe("closing the chain", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const close = () =>
    screen.getByRole("button", { name: /mål hus\. slut kedjan/i });

  it("validates every joint at once and names what failed", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg is not a word
    await u.click(close());
    await expectStatus("STEN+VÄGG håller inte.");
  });

  it("reports more than one break", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("glas"));  // sten+glas ✗
    await u.click(chip("mur"));   // glas+mur ✗, mur+hus ✗
    await u.click(close());
    await expectStatus(/STEN\+GLAS och GLAS\+MUR och 1 länk till håller inte/);
  });

  it("marks the broken joints in the chain", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(close());
    expect(await screen.findAllByText("bruten länk")).toHaveLength(1);
  });

  it("clears the marks as soon as the chain is edited", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(close());
    expect(await screen.findAllByText("bruten länk")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: /^plats 1, vägg\./i }));
    expect(screen.queryByText("bruten länk")).not.toBeInTheDocument();
  });

  it("refuses to check an empty chain", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(close());
    await expectStatus("Lägg minst en del i kedjan först.");
  });

  it("solves when every joint holds, using fewer slots than the budget", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("bro"));   // sten+bro ✓, bro+hus ✓ — two links, budget 4
    await u.click(close());
    expect(await screen.findByText("stenbro → brohus")).toBeInTheDocument();
  });

  it("counts a failed check as a felförsök in the share line", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(close());
    await u.click(screen.getByRole("button", { name: /^plats 1, vägg\./i }));
    await u.click(chip("bro"));
    await u.click(close());
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
    close().focus();
    await u.keyboard("{Enter}");
    expect(await screen.findByText("stenbro → brohus")).toBeInTheDocument();
  });
});

describe("solving", () => {
  const solveUnderPar = async (u: ReturnType<typeof user>) => {
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await u.click(screen.getByRole("button", { name: /mål hus\. slut kedjan/i }));
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
  const close = () => screen.getByRole("button", { name: /mål hus\. slut kedjan/i });
  const solve = async (u: ReturnType<typeof user>) => {
    await u.click(chip("bro"));
    await u.click(close());
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
    expect(screen.getByText("0/3 placerade")).toBeInTheDocument();
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
    expect(screen.getByText("1/3 placerade")).toBeInTheDocument();
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
