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
      screen.getByRole("button", { name: /mål hus\. koppla ihop/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("0/4 länkar")).toBeInTheDocument();
    // Three empty slots plus the goal: budget 4, nothing spent.
    expect(screen.getAllByText("··")).toHaveLength(3);
  });
});

describe("placing parts", () => {
  it("accepts a real weld and names the compound", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    await expectStatus("stenmur ✓");
    expect(screen.getByText("1/4 länkar")).toBeInTheDocument();
  });

  it("refuses a pair that is not a word, and does not spend a link", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^vägg\./i }));
    await expectStatus("STEN+VÄGG är inte ett ord.");
    expect(screen.getByText("0/4 länkar")).toBeInTheDocument();
  });

  it("offers a report link only after the game has refused something", async () => {
    const u = user();
    render(<App />);
    await board();
    expect(screen.queryByRole("link", { name: /rapportera/i })).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: /^vägg\./i }));
    expect(
      await screen.findByRole("link", { name: /är sten\+vägg ett riktigt ord/i }),
    ).toBeInTheDocument();
  });

  it("plays entirely from the keyboard", async () => {
    const u = user();
    render(<App />);
    await board();
    screen.getByRole("button", { name: /^bro\./i }).focus();
    await u.keyboard("{Enter}");
    await expectStatus("stenbro ✓");
  });
});

describe("taking parts back out of the chain", () => {
  const chip = (part: string) => screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const link = (n: number, part: string) =>
    screen.getByRole("button", { name: new RegExp(`^länk ${n}, ${part}\\.`, "i") });

  it("returns a placed part to the pool when its chain chip is clicked", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    expect(screen.queryByRole("button", { name: /^mur\./i })).not.toBeInTheDocument();

    await u.click(link(1, "mur"));
    await expectStatus("MUR tillbaka i poolen.");
    expect(chip("mur")).toBeInTheDocument();
    expect(screen.getByText("0/4 länkar")).toBeInTheDocument();
  });

  it("takes everything downstream with it when a middle part is removed", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    expect(screen.getByText("2/4 länkar")).toBeInTheDocument();

    await u.click(link(1, "tak"));
    await expectStatus("TAK och 1 del efter den togs bort.");
    expect(screen.getByText("0/4 länkar")).toBeInTheDocument();
    expect(chip("tak")).toBeInTheDocument();
    expect(chip("glas")).toBeInTheDocument();
  });

  it("pluralises the count of parts carried away", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(chip("vägg"));
    await u.click(link(1, "mur"));
    // budget 4 allows three intermediates, so only two came off here.
    await expectStatus("MUR och 1 del efter den togs bort.");
  });

  it("removes a part from the keyboard", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("bro"));
    link(1, "bro").focus();
    await u.keyboard("{Enter}");
    await expectStatus("BRO tillbaka i poolen.");
  });

  it("never offers the start or the target as removable", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    expect(screen.queryByRole("button", { name: /^länk \d+, sten\./i })).not.toBeInTheDocument();
    expect(screen.getByText("sten")).toBeInTheDocument();
  });

  it("freezes the chain once the day is solved", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("bro"));
    await u.click(screen.getByRole("button", { name: /mål hus\. koppla ihop/i }));
    await screen.findByText("stenbro → brohus");
    expect(screen.queryByRole("button", { name: /^länk 1, bro\./i })).not.toBeInTheDocument();
  });

  it("clears a hint mark that the removal invalidates", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    await u.click(screen.getByRole("button", { name: /^ledtråd/i })); // distance
    await u.click(screen.getByRole("button", { name: /^ledtråd/i })); // marks a chip
    expect(screen.getByRole("button", { name: /rätt väg vidare/i })).toBeInTheDocument();

    await u.click(link(1, "mur"));
    expect(screen.queryByRole("button", { name: /rätt väg vidare/i })).not.toBeInTheDocument();
  });
});

describe("undo", () => {
  it("returns the part to the pool", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    expect(screen.queryByRole("button", { name: /^mur\./i })).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Ångra" }));
    expect(screen.getByRole("button", { name: /^mur\./i })).toBeInTheDocument();
    expect(screen.getByText("0/4 länkar")).toBeInTheDocument();
  });

  it("is unavailable on an empty chain", async () => {
    render(<App />);
    await board();
    expect(screen.getByRole("button", { name: "Ångra" })).toBeDisabled();
  });
});

describe("hints", () => {
  it("gives the distance first, then marks the chip", async () => {
    const u = user();
    render(<App />);
    await board();
    const hintBtn = () => screen.getByRole("button", { name: /^ledtråd/i });

    await u.click(hintBtn());
    await expectStatus("Målet är 2 ord bort");

    await u.click(hintBtn());
    await expectStatus("BRO är rätt väg vidare");
    expect(
      screen.getByRole("button", { name: /ledtråd: det här är rätt väg vidare/i }),
    ).toBeInTheDocument();
  });

  it("rescues a dead end for free instead of charging a hint", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^tak\./i }));
    await u.click(screen.getByRole("button", { name: /^glas\./i }));

    await u.click(screen.getByRole("button", { name: /^ledtråd/i }));
    await expectStatus("Härifrån når du inte målet");
    // Free: the counter never moved off zero.
    expect(screen.getByRole("button", { name: /^ledtråd/i })).toHaveTextContent(
      /^Ledtråd$/,
    );
  });
});

describe("solving", () => {
  const solveUnderPar = async (u: ReturnType<typeof user>) => {
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await u.click(screen.getByRole("button", { name: /mål hus\. koppla ihop/i }));
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

describe("persistence", () => {
  it("keeps a half-built chain across a reload", async () => {
    const u = user();
    const { unmount } = render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    unmount();

    render(<App />);
    await board();
    expect(screen.getByText("1/4 länkar")).toBeInTheDocument();
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
