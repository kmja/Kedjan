import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { testDay } from "./game/testDay";
import { JOINT_ZONE, POOL_ZONE } from "./game/useChipDrag";
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
    // Par is part of the puzzle until a hint is spent on it.
    expect(screen.queryByLabelText("par 3")).not.toBeInTheDocument();
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

  it("leaves untouched joints alone when a chip is removed", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));    // sten+mur ✓
    await u.click(chip("tak"));    // mur+tak ✗
    await u.click(chip("glas"));   // tak+glas ✓
    const before = screen
      .getAllByText("länken håller")
      .map((el) => el.closest(".verdict"));
    expect(before).toHaveLength(2); // sten+mur and tak+glas

    // Removing the FIRST chip shifts every index behind it, but tak+glas is
    // the same weld with the same verdict — it must keep the *same DOM node*,
    // or its pop animation replays on a joint the removal never touched.
    await u.click(screen.getByRole("button", { name: /^länk 1, mur\./i }));

    const after = screen
      .getAllByText("länken håller")
      .map((el) => el.closest(".verdict"));
    expect(after).toContain(before[1]);   // tak+glas untouched
    expect(after).not.toContain(before[0]); // sten+mur is gone with mur
  });

  it("re-animates the joint whose weld the removal changed", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));    // sten+tak ✓
    await u.click(chip("glas"));   // tak+glas ✓
    const stenTak = screen
      .getAllByText("länken håller")[0]!
      .closest(".verdict");

    // Removing the FIRST chip closes the chain up: the top joint now judges
    // sten+glas, a different weld with a different verdict. That joint must
    // come back as a fresh node so its animation plays — position alone must
    // not carry a stamp across a change of pair.
    await u.click(screen.getByRole("button", { name: /^länk 1, tak\./i }));
    const stenGlas = (await screen.findByText("bruten länk")).closest(".verdict");
    expect(stenGlas).not.toBe(stenTak);
  });

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

  it("reveals the other routes as one branching, rejoining map", async () => {
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);   // sten → bro → hus
    const reveal = await screen.findByRole("button", { name: /1 annan väg fanns/i });
    await u.click(reveal);

    // One map, not a flat list: routes diverge after the start and funnel
    // back into a single target node — hus appears once, with both branches
    // joined into it. The played route carries a visible check.
    const tree = screen.getByLabelText("Alla vägar till målet, som ett träd");
    expect(within(tree).getByText("sten")).toBeInTheDocument();
    expect(within(tree).getByText("mur")).toBeInTheDocument();
    expect(within(tree).getByText("vägg")).toBeInTheDocument();
    expect(within(tree).getAllByText("hus")).toHaveLength(1);
    // The played branch is distinguished, and never by colour alone: it is
    // also the heavier stroke.
    expect(within(tree).getByText("bro")).toHaveAttribute("data-mine", "true");
    expect(within(tree).getByText("mur")).not.toHaveAttribute("data-mine");
    // The same routes stay readable as text, the played one named as yours.
    expect(within(tree).getByText("sten, bro, hus — din väg")).toBeInTheDocument();
    expect(within(tree).getByText("sten, mur, vägg, hus")).toBeInTheDocument();
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

  it("offers no replay before the day is solved", async () => {
    render(<App />);
    await board();
    // Replay rides on the result card, which only exists once there is a
    // result. Nothing to disable, and nothing to explain.
    expect(
      screen.queryByRole("button", { name: "Spela om dagen" }),
    ).not.toBeInTheDocument();
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

  const openArchive = async (u: ReturnType<typeof user>) =>
    u.click(screen.getByRole("tab", { name: "Arkiv" }));
  const replayAll = () =>
    screen.queryByRole("button", { name: /spela om alla klarade dagar/i });

  it("offers no bulk replay until something has been finished", async () => {
    const u = user();
    render(<App />);
    await board();
    await openArchive(u);
    expect(replayAll()).not.toBeInTheDocument();
  });

  it("puts every finished day back on the table, keeping the stats", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await screen.findByText("stenbro → brohus");

    await openArchive(u);
    await u.click(replayAll()!);
    await u.click(screen.getByRole("button", { name: "Öppna igen" }));

    await u.click(screen.getByRole("tab", { name: "Dagens" }));
    expect(screen.getByRole("button", { name: /^bro\./i })).toBeInTheDocument();
    expect(screen.queryByText("stenbro → brohus")).not.toBeInTheDocument();

    // The day was played and solved; reopening it does not un-play it, and
    // re-solving must not count it a second time either.
    const saved = JSON.parse(localStorage.getItem("kedjan.v1") ?? "{}");
    expect(saved.stats.solved).toBe(1);
    expect(saved.progress["2026-08-06"].solvedAt).toBeTruthy();
  });

  it("leaves the days alone when the reset is waved off", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await screen.findByText("stenbro → brohus");

    await openArchive(u);
    await u.click(replayAll()!);
    await u.click(screen.getByRole("button", { name: "Avbryt" }));

    await u.click(screen.getByRole("tab", { name: "Dagens" }));
    expect(screen.getByText("stenbro → brohus")).toBeInTheDocument();
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

describe("the hint ladder", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const hintButton = () => screen.getByRole("button", { name: /^ledtråd/i });

  it("sells par first, because the board no longer gives it away", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(hintButton());
    await expectStatus("Rekommenderat: 3 länkar. Du får använda 4.");

    expect(screen.getByLabelText("par 3")).toBeInTheDocument();
  });

  it("then rules out the chips that lead nowhere", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(hintButton());
    await u.click(hintButton());
    await expectStatus(/kan inte leda till målet/);

    // tak and glas are a cul-de-sac; bro, mur and vägg all sit on a solution.
    expect(chip("tak")).toHaveClass("chip--dimmed");
    expect(chip("glas")).toHaveClass("chip--dimmed");
    expect(chip("bro")).not.toHaveClass("chip--dimmed");
    expect(chip("mur")).not.toHaveClass("chip--dimmed");
  });

  it("narrows the field as the chain grows", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));      // commits to the mur -> vägg route
    await u.click(hintButton());
    await u.click(hintButton());
    // Only vägg finishes from here, so bro is ruled out too.
    expect(chip("bro")).toHaveClass("chip--dimmed");
    expect(chip("vägg")).not.toHaveClass("chip--dimmed");
  });

  it("keeps a ruled-out chip playable", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(hintButton());
    await u.click(hintButton());
    await u.click(chip("tak"));
    expect(screen.getByRole("button", { name: /^länk 1, tak\./i })).toBeInTheDocument();
  });

  it("clears the dimming as soon as the chain changes", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(hintButton());
    await u.click(hintButton());
    expect(chip("tak")).toHaveClass("chip--dimmed");
    await u.click(chip("mur"));
    expect(chip("tak")).not.toHaveClass("chip--dimmed");
  });

  it("marks the chip on the third rung", async () => {
    const u = user();
    render(<App />);
    await board();
    for (let i = 0; i < 3; i++) await u.click(hintButton());
    await expectStatus(/⭐/);
  });
});

describe("drag and drop", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const link = (n: number, part: string) =>
    screen.getByRole("button", { name: new RegExp(`^länk ${n}, ${part}\\.`, "i") });

  /** jsdom reports every rect as zero, so zones need real geometry to hit. */
  function placeZones(heightOf: (index: number) => number = () => 40) {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const zone = (this as HTMLElement).dataset?.dropZone;
      if (zone === undefined) return new DOMRect(0, 0, 0, 0);
      if (zone === POOL_ZONE) return new DOMRect(0, 900, 200, 40);
      // Joints stack down the page in index order, as they do on the board —
      // derived from the id, so a joint appearing mid-drag still lands in the
      // right place rather than wherever it was first queried.
      const i = Number(zone.slice(JOINT_ZONE.length));
      return new DOMRect(0, i * 100, 200, heightOf(i));
    };
  }

  /**
   * Each phase gets its own act, because the board reshapes mid-drag: joints
   * that only exist once a chip is in flight must render before the drop is
   * resolved against them.
   */
  const dragTo = async (source: HTMLElement, x: number, y: number) => {
    const opts = { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1 };
    await act(async () => {
      source.dispatchEvent(
        new PointerEvent("pointerdown", { ...opts, clientX: 0, clientY: 0 }),
      );
    });
    await act(async () => {
      source.dispatchEvent(new PointerEvent("pointermove", opts));
    });
    await act(async () => {
      source.dispatchEvent(new PointerEvent("pointerup", opts));
    });
  };

  // Wrapped, not passed by reference: beforeEach hands the callback Vitest's
  // test context, which would arrive as the height function.
  beforeEach(() => placeZones());

  it("drops a pool chip into the joint it was released over", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(chip("glas"));   // vägg, glas — joints 0, 1 and 2 exist
    // Deliberately joint 1, not joint 0: an index-0 drop cannot tell a working
    // parser from one that returns zero for everything.
    await dragTo(chip("tak"), 100, 120);
    expect(link(1, "vägg")).toBeInTheDocument();
    expect(link(2, "tak")).toBeInTheDocument();
    expect(link(3, "glas")).toBeInTheDocument();
  });

  it("returns a chain part to the pool when dropped there", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await dragTo(link(1, "vägg"), 100, 900);
    expect(chip("vägg")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^länk 1, vägg\./i })).not.toBeInTheDocument();
  });

  it("snaps a drop that lands on no zone to the nearest joint", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    // Released over the gap between joints, hitting neither outright.
    await dragTo(chip("glas"), 100, 70);
    expect(screen.getByRole("button", { name: /^länk \d, glas\./i })).toBeInTheDocument();
  });

  it("drops into the gap it is nearest, not the one whose centre is nearest", async () => {
    // The board grows whichever joint is open, so joints differ in height, and
    // centre distance stops being monotonic down the chain: this drop sits
    // below joint 1 yet nearer joint 1's centre than joint 2's. Resolving by
    // centre would send the chip backwards, up past a part the player had
    // already dropped it below.
    placeZones((i) => (i === 2 ? 80 : 40));
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    await u.click(chip("glas"));
    await dragTo(chip("tak"), 100, 175);
    expect(link(3, "tak")).toBeInTheDocument();
  });

  it("still takes drops from its own parts once the chain is full", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await u.click(chip("bro"));   // three parts is the budget — no room left
    // Moving a part already in the chain does not make it longer, so the
    // joints have to come back for it rather than demanding a removal first.
    await dragTo(link(3, "bro"), 100, 0);
    expect(link(1, "bro")).toBeInTheDocument();
    expect(link(2, "tak")).toBeInTheDocument();
    expect(link(3, "glas")).toBeInTheDocument();
  });

  it("does nothing when a pool chip is dropped back on the pool", async () => {
    render(<App />);
    await board();
    await dragTo(chip("glas"), 100, 900);
    expect(chip("glas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^länk 1, glas\./i })).not.toBeInTheDocument();
  });
});
