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
  localStorage.setItem("kedjan.welcomed", "1");
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

describe("the welcome dialog", () => {
  it("shows the rules once, on the very first load", async () => {
    localStorage.removeItem("kedjan.welcomed");
    const u = user();
    const { unmount } = render(<App />);
    await board();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Så spelar du")).toBeInTheDocument();
    expect(within(dialog).getByText(/tre liv/i)).toBeInTheDocument();

    await u.click(within(dialog).getByRole("button", { name: "Nu spelar vi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();

    // Seen once is seen: the next visit goes straight to the board.
    render(<App />);
    await board();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("the day board", () => {
  it("labels each archive chain with its tier", async () => {
    mockCalendar([
      { ...testDay, date: "2026-08-06", no: 2, tier: "easy" },
      { ...testDay, date: "2026-08-06", no: 3, start: "glas", target: "sten",
        par: 4, budget: 5, tier: "hard",
        pairs: { "glas>tak": "glastak", "tak>mur": "takmur",
                 "mur>vägg": "murvägg", "vägg>sten": "väggsten" } },
    ]);
    render(<App />);
    await board();
    expect(screen.getByText("LÄTT")).toBeInTheDocument();
    expect(screen.getByText("SVÅR")).toBeInTheDocument();
  });

  it("switches between the day's two chains, each keeping its own board", async () => {
    const u = userEvent.setup();
    mockCalendar([
      { ...testDay, date: "2026-08-06", no: 2, tier: "easy" },
      { ...testDay, date: "2026-08-06", no: 3, start: "glas", target: "sten",
        par: 4, budget: 5, tier: "hard",
        pairs: { "glas>tak": "glastak", "tak>mur": "takmur",
                 "mur>vägg": "murvägg", "vägg>sten": "väggsten" } },
    ]);
    render(<App />);
    await board();
    expect(screen.getByText(/#2 ·/)).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Svår" }));
    expect(await screen.findByText(/#3 ·/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Svår" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await u.click(screen.getByRole("button", { name: "Lätt" }));
    expect(await screen.findByText(/#2 ·/)).toBeInTheDocument();
  });

  it("serves the puzzle dated today", async () => {
    render(<App />);
    const pool = await board();
    expect(screen.getByText(/#2 · torsdag 6 augusti/)).toBeInTheDocument();
    expect(within(pool).getAllByRole("button")).toHaveLength(testDay.pool.length);
  });

  it("shows an empty chain with one open joint, and never says how long it should be", async () => {
    render(<App />);
    await board();
    // The target is the last link's anchor, not a control to press.
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

  it("accepts a part that welds on one side only, free of charge", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg is not a word, but vägg+hus is
    expect(link(1, "vägg")).toBeInTheDocument();
    await expectStatus(/VÄGG lagd i kedjan/);
  });

  it("refuses a part that sticks to neither neighbour, and charges a life", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("glas"));  // sten+glas and glas+hus both fail
    await expectStatus(/GLAS fäster varken vid STEN eller HUS · 2 liv kvar/);
    // The chip never lands: it shakes itself off, back home in the pool.
    expect(screen.queryByRole("button", { name: /^länk 1, glas/i })).not.toBeInTheDocument();
    expect(chip("glas")).toBeInTheDocument();
  });

  it("grows the chain a part at a time", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));    // sten+tak ✓
    expect(screen.getByText("2 länkar")).toBeInTheDocument();
    await u.click(chip("glas"));   // tak+glas ✓
    expect(link(1, "tak")).toBeInTheDocument();
    expect(link(2, "glas")).toBeInTheDocument();
    expect(screen.getByText("3 länkar")).toBeInTheDocument();
  });

  it("never offers a forged link as a place to put a part", async () => {
    const u = user();
    render(<App />);
    await board();
    // sten+vägg spells nothing, so that link stays open and keeps its slot;
    // vägg+hus holds, and finished work is not a target.
    await u.click(chip("vägg"));
    expect(
      screen.getByRole("button", { name: /lägg en del efter sten/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /lägg en del efter vägg/i }),
    ).not.toBeInTheDocument();
  });

  it("lands a part on the open link when the end of the chain is forged", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // vägg+hus holds: the last link is finished
    // Aimed at nothing in particular, so it would append — but appending
    // would prise open a weld, so it goes to the link still hanging open.
    await u.click(chip("tak"));   // sten+tak ✓
    expect(link(1, "tak")).toBeInTheDocument();
    expect(link(2, "vägg")).toBeInTheDocument();
  });

  it("inserts at the joint the player aimed at", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    // Aim at the joint after the start, so the next part goes in front.
    await u.click(joint("sten"));
    await u.click(chip("tak"));   // sten+tak holds
    expect(link(1, "tak")).toBeInTheDocument();
    expect(link(2, "vägg")).toBeInTheDocument();
  });

  it("moves a part rather than duplicating it", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await u.click(link(2, "glas"));   // out of the chain
    await u.click(chip("glas"));      // and back in
    expect(link(2, "glas")).toBeInTheDocument();
    // Exactly one home: in the chain, and no longer in the pool.
    expect(screen.queryByRole("button", { name: /^glas\./i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^länk 3, glas/i })).not.toBeInTheDocument();
  });

  it("closes the chain up when a part is taken out", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await u.click(link(1, "tak"));
    // glas moves up rather than leaving a hole behind.
    expect(link(1, "glas")).toBeInTheDocument();
    expect(chip("tak")).toBeInTheDocument();
  });

  it("lets a chain run past par — the long way round is a real win", async () => {
    // A route one link over par: sten → tak → glas → bro → hus.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1,
      pairs: { ...testDay.pairs, "glas>bro": "glasbro" },
    }]);
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await u.click(chip("bro"));   // four links, over par 3 — and the day ends
    expect(await screen.findByText(/4 ord — I mål!/)).toBeInTheDocument();
  });
});

describe("the route map", () => {
  it("marks only the edges the player walked, not every edge between visited nodes", async () => {
    // A day where sten→mur→hus is a route of its own: playing the longer
    // sten→mur→vägg→hus lights mur and hus both, and the shortcut edge
    // mur→hus must NOT light up with them — it is somebody else's road.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1,
      pairs: { ...testDay.pairs, "mur>hus": "murhus" },
    }]);
    const u = user();
    render(<App />);
    await board();
    // vägg first (murhus would finish the day instantly), then mur in front.
    await u.click(screen.getByRole("button", { name: /^vägg\./i }));
    await u.click(screen.getByRole("button", { name: /lägg en del efter sten/i }));
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    await screen.findByText(/På par!/);
    await u.click(
      within(await screen.findByRole("dialog", {}, { timeout: 2000 })).getByRole("button", {
        name: "Visa resultatet",
      }),
    );
    await u.click(screen.getByRole("button", { name: /andra vägar fanns/i }));

    const tree = screen.getByLabelText("Alla vägar till målet, som ett träd");
    const mineEdges = tree.querySelectorAll('path[stroke="var(--falu)"]');
    // Exactly the three edges of sten→mur→vägg→hus — not mur→hus.
    expect(mineEdges).toHaveLength(3);
  });

  it("collapses duplicate chips where it cannot mislead, and only there", async () => {
    // liv→moder and moder→liv both weld, so the prefix tree draws four
    // chips for the pair. Merging a duplicate is allowed exactly when
    // neither copy can reach the other — one of the pair collapses, the
    // other stays duplicated because merging it would need a cycle. The
    // downward-only picture survives: no arrows, no arcs.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1, start: "jord", target: "hus",
      par: 3, budget: 4,
      pool: ["liv", "moder", "tak"],
      pairs: {
        "jord>liv": "jordliv", "jord>moder": "jordmoder",
        "liv>moder": "livmoder", "moder>liv": "moderliv",
        "liv>tak": "livtak", "moder>tak": "modertak", "tak>hus": "takhus",
      },
    }]);
    const u = user();
    render(<App />);
    await board();
    for (const part of ["liv", "tak"]) {
      await u.click(screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") }));
    }
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    const tree = within(dialog).getByLabelText("Alla vägar till målet, som ett träd");

    const livs = within(tree).getAllByText("liv").length;
    const moders = within(tree).getAllByText("moder").length;
    expect(livs + moders).toBe(3);
    expect(within(tree).getAllByText("tak")).toHaveLength(1);
    // The hybrid never draws against the flow.
    expect(tree.querySelectorAll("path[marker-end]")).toHaveLength(0);
  });

  it("leaves long detours undrawn and says how many it left out", async () => {
    // A six-link victory lap around a par-3 day is a legal win, not
    // structure. The map draws routes near par and admits the rest.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1, start: "sten", target: "hus",
      par: 3, budget: 4,
      pool: ["mur", "vägg", "tak", "glas", "port", "bok", "torn"],
      pairs: {
        "sten>mur": "stenmur", "mur>vägg": "murvägg", "vägg>hus": "vägghus",
        "sten>tak": "stentak", "tak>glas": "takglas", "glas>port": "glasport",
        "port>bok": "portbok", "bok>torn": "boktorn", "torn>hus": "tornhus",
      },
    }]);
    const u = user();
    render(<App />);
    await board();
    for (const part of ["mur", "vägg"]) {
      await u.click(screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") }));
    }
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    const tree = within(dialog).getByLabelText("Alla vägar till målet, som ett träd");

    expect(within(tree).getByText("mur")).toBeInTheDocument();
    expect(within(tree).queryByText("torn")).not.toBeInTheDocument();
    expect(
      within(dialog).getByText(/och 1 längre omväg som inte ritas/),
    ).toBeInTheDocument();
  });

  it("wraps a deep map into two columns at a chip every route shares", async () => {
    // Nine rows of mostly corridor: the map cuts at hav — the shared chip
    // nearest the middle — and continues alongside, like wrapped text.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1, start: "sten", target: "hus",
      par: 8, budget: 9,
      pool: ["alfa", "beta", "bok", "dag", "hav", "ljus", "sol", "torn"],
      pairs: {
        "sten>alfa": "stenalfa", "sten>beta": "stenbeta",
        "alfa>bok": "alfabok", "beta>bok": "betabok",
        "bok>dag": "bokdag", "dag>hav": "daghav", "hav>ljus": "havljus",
        "ljus>sol": "ljussol", "sol>torn": "soltorn", "torn>hus": "tornhus",
      },
    }]);
    const u = user();
    render(<App />);
    await board();
    for (const part of ["alfa", "bok", "dag", "hav", "ljus", "sol", "torn"]) {
      await u.click(screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") }));
    }
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    const tree = within(dialog).getByLabelText("Alla vägar till målet, som ett träd");

    // The cut chip is drawn twice: closing column one, resuming column two.
    expect(within(tree).getAllByText("hav")).toHaveLength(2);
    const attr = (part: string, name: string) =>
      Number(within(tree).getByText(part).getAttribute(name));
    // Column two runs alongside column one, not below it…
    expect(attr("ljus", "y")).toBe(attr("alfa", "y"));
    expect(attr("hus", "y")).toBe(attr("dag", "y") + 46);
    // …to its right.
    expect(attr("dag", "x")).toBeLessThan(0);
    expect(attr("sol", "x")).toBeGreaterThan(0);
  });
});

describe("the ending dialog", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });

  it("celebrates a win with the route map", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("bro"));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    expect(within(dialog).getByText("Kedjan håller!")).toBeInTheDocument();
    expect(
      within(dialog).getByLabelText("Alla vägar till målet, som ett träd"),
    ).toBeInTheDocument();
    await u.click(within(dialog).getByRole("button", { name: "Visa resultatet" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains a loss and offers a fresh try", async () => {
    const u = user();
    render(<App />);
    await board();
    // The refused chip bounces home each time, so the same tap thrice is
    // the whole brute-force loop.
    for (let i = 0; i < 3; i++) await u.click(chip("glas"));
    const dialog = await screen.findByRole("dialog", {}, { timeout: 2000 });
    expect(within(dialog).getByText("Kedjan brast")).toBeInTheDocument();
    expect(within(dialog).getByText(/fäste varken vid delen före eller efter/)).toBeInTheDocument();

    await u.click(within(dialog).getByRole("button", { name: "Försök igen" }));
    await board();
    expect(screen.getByLabelText("3 liv kvar")).toBeInTheDocument();
  });

  it("does not reopen for a day that loads already solved", async () => {
    const u = user();
    const { unmount } = render(<App />);
    await board();
    await u.click(chip("bro"));
    await screen.findByRole("dialog", {}, { timeout: 2000 });
    unmount();

    render(<App />);
    await screen.findByText(/Under par — briljant!/);
    await new Promise((r) => setTimeout(r, 800));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("lives", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });

  it("judges a chip by its own two neighbours, not the whole board", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));   // sten+mur ✓ — free
    await expectStatus(/MUR lagd i kedjan/);
    await u.click(chip("tak"));   // sticks to neither mur nor hus — one life
    await expectStatus(/TAK fäster varken vid MUR eller HUS · 2 liv kvar/);
    expect(chip("tak")).toBeInTheDocument(); // bounced home
    // bro fails backward onto mur but holds into hus — a real move, free.
    await u.click(chip("bro"));
    await expectStatus(/BRO lagd i kedjan/);
    expect(screen.getByLabelText("2 liv kvar")).toBeInTheDocument();
  });

  it("breaks the lost heart and shakes the refused chip, at home", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("glas"));
    const row = screen.getByLabelText("2 liv kvar");
    // Two hearts remain; the third is mid-break, on its way out.
    expect(row.querySelectorAll(".life-break")).toHaveLength(1);
    expect(row.querySelectorAll(".life-big")).toHaveLength(3);
    // The refused chip shakes in the pool, where it stayed.
    expect(chip("glas").className).toMatch(/chip--rejected/);
  });

  it("removals are free", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));   // ✓
    await u.click(chip("mur"));   // sticks to neither tak nor hus — one life
    await expectStatus(/2 liv kvar/);
    await u.click(screen.getByRole("button", { name: /^länk 1, tak\./i }));
    await expectStatus(/tillbaka i poolen/);
    expect(screen.getByLabelText("2 liv kvar")).toBeInTheDocument();
  });

  it("three loose placements end the day", async () => {
    const u = user();
    render(<App />);
    await board();
    // Each refusal bounces the chip home, so the same tap thrice is the
    // brute-force loop in its entirety.
    for (let i = 0; i < 3; i++) await u.click(chip("glas"));

    expect(await screen.findByText("Kedjan brast")).toBeInTheDocument();
    // The board is over: no pool, no more placements.
    expect(screen.queryByRole("group", { name: /delar att välja bland/i })).not.toBeInTheDocument();
    // The routes that existed are on offer, and a fresh run is one press away.
    expect(screen.getByRole("button", { name: /vägarna som fanns/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
  });

  it("keeps lost lives across a reload", async () => {
    const u = user();
    const { unmount } = render(<App />);
    await board();
    await u.click(chip("glas"));  // sticks to nothing — one life gone
    await expectStatus(/2 liv kvar/);
    unmount();

    render(<App />);
    await board();
    expect(screen.getByLabelText("2 liv kvar")).toBeInTheDocument();
  });

  it("a fresh try restores the lives", async () => {
    const u = user();
    render(<App />);
    await board();
    // The same loose chip three times: each placement sticks to nothing,
    // bounces home, and charges — the brute-force loop.
    for (let i = 0; i < 3; i++) await u.click(chip("glas"));
    expect(await screen.findByText("Kedjan brast")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Försök igen" }));
    await board();
    expect(screen.getByLabelText("3 liv kvar")).toBeInTheDocument();
  });
});

describe("judging the chain", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const joint = (after: string) =>
    screen.getByRole("button", { name: new RegExp(`lägg en del efter ${after}`, "i") });

  it("leaves untouched joints alone when a chip is removed", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));   // sten+vägg ✗ open, vägg+hus ✓
    await u.click(joint("sten"));
    await u.click(chip("tak"));    // in front: sten+tak ✓, tak+vägg ✗
    const before = screen
      .getAllByRole("link", { name: /ordboken/i })
      .map((el) => el.closest(".weld-mark"));
    expect(before).toHaveLength(2); // sten+tak and vägg+hus

    // Removing the FIRST chip shifts every index behind it, but vägg+hus is
    // the same weld with the same verdict — it must keep the *same DOM node*,
    // or its pop animation replays on a joint the removal never touched.
    await u.click(screen.getByRole("button", { name: /^länk 1, tak\./i }));

    const after = screen
      .getAllByRole("link", { name: /ordboken/i })
      .map((el) => el.closest(".weld-mark"));
    expect(after).toContain(before[1]);   // vägg+hus untouched
    expect(after).not.toContain(before[0]); // sten+tak is gone with tak
  });

  it("re-animates the joint whose weld the removal changed", async () => {
    // sten welds to both tak and glas, so removing tak leaves the top joint
    // holding a *different* weld that also holds — the case where position
    // alone would wrongly carry a stamp across a change of pair.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1,
      pairs: { "sten>tak": "stentak", "tak>glas": "takglas", "sten>glas": "stenglas" },
    }]);
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));    // sten+tak ✓
    await u.click(chip("glas"));   // tak+glas ✓
    const stenTak = screen
      .getByRole("link", { name: /stentak.*ordboken/i })
      .closest(".weld-mark");

    await u.click(screen.getByRole("button", { name: /^länk 1, tak\./i }));
    const stenGlas = screen
      .getByRole("link", { name: /stenglas.*ordboken/i })
      .closest(".weld-mark");
    expect(stenGlas).not.toBe(stenTak);
  });

  it("marks a joint that holds as soon as a part lands", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));   // sten+mur ✓
    expect(await screen.findAllByText("länken håller")).toHaveLength(1);
    // The weld's word is the reward — written out beside the link, and one
    // tap from the authority that can settle a doubt about it.
    const word = screen.getByRole("link", { name: /stenmur.*ordboken/i });
    expect(word).toHaveAttribute("href", "https://svenska.se/?q=stenmur");
  });

  it("writes no word beside a link that does not hold", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg ✗ — spells nothing
    expect(await screen.findAllByText("öppen länk")).toHaveLength(1);
    expect(screen.queryByText("stenvägg")).not.toBeInTheDocument();
  });

  it("draws nothing at all on a link that does not hold", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));  // sten+vägg ✗, vägg+hus ✓
    // The open link says so in words for a screen reader and shows nothing
    // to anyone else: the gap is the message. Only the weld that holds is
    // marked, so exactly one mark is drawn on the whole chain.
    expect(await screen.findAllByText("öppen länk")).toHaveLength(1);
    expect(document.querySelectorAll(".weld-mark")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /vägghus.*ordboken/i })).toBeInTheDocument();
  });

  it("withholds the final joint's verdict while the chain can still grow", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("mur"));
    // sten+mur holds; mur+hus does not, but with room to keep building the
    // honest answer is "not yet", not "this link is open".
    expect(screen.queryByText("öppen länk")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /lägg en del efter mur/i }),
    ).toBeInTheDocument();
  });

  it("shows the final joint's check the moment that weld holds", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    // sten+vägg does not hold, but vägg+hus is a real word — that weld
    // holding is information whichever way the rest of the chain is going.
    expect(await screen.findAllByText("öppen länk")).toHaveLength(1);
    expect(screen.getAllByText("länken håller")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /vägghus.*ordboken/i })).toBeInTheDocument();
  });

  it("judges the final joint once the board is full", async () => {
    // A two-part pool, so the board fills in two placements. Until it does,
    // the last link's failure is "not yet"; once no part is left to play it
    // is the answer, and the link is called open.
    mockCalendar([{
      ...testDay, date: "2026-08-06", no: 1,
      pool: ["tak", "glas"],
      pairs: { "sten>tak": "stentak", "tak>glas": "takglas" },
    }]);
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("tak"));
    expect(screen.queryByText("öppen länk")).not.toBeInTheDocument();
    await u.click(chip("glas"));
    expect(await screen.findAllByText("öppen länk")).toHaveLength(1);
  });

  it("re-judges after a part is taken back out", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(chip("vägg"));
    expect(await screen.findAllByText("öppen länk")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: /^länk 1, vägg\./i }));
    expect(screen.queryByText("öppen länk")).not.toBeInTheDocument();
  });

  it("finishes the day on the placement that completes the chain", async () => {
    const u = user();
    render(<App />);
    await board();
    // sten+bro ✓ and bro+hus ✓ — two links, well under the budget of four.
    await u.click(chip("bro"));
    expect(await screen.findByText(/Under par — briljant!/)).toBeInTheDocument();
  });

  it("plays entirely from the keyboard", async () => {
    const u = user();
    render(<App />);
    await board();
    chip("bro").focus();
    await u.keyboard("{Enter}");
    expect(await screen.findByText(/Under par — briljant!/)).toBeInTheDocument();
  });
});

describe("solving", () => {
  const solveUnderPar = async (u: ReturnType<typeof user>) => {
    // Placing bro completes the chain, which is what finishes the day.
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
  };

  it("finishes the day when a removal makes the chain hold", async () => {
    const u = user();
    render(<App />);
    await board();
    // sten → mur → bro → hus: mur+bro is broken, but the chain on either
    // side of it is sound. Taking mur out is the winning move.
    await u.click(screen.getByRole("button", { name: /^mur\./i }));
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    expect(screen.queryByText(/Under par — briljant!/)).not.toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: /^länk 1, mur\./i }));

    expect(await screen.findByText(/Under par — briljant!/)).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem("kedjan.v1") ?? "{}");
    expect(saved.stats.solved).toBe(1);
  });

  it("spells the chain back and calls an under-par result", async () => {
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);
    expect(await screen.findByText(/Under par — briljant!/)).toBeInTheDocument();
  });

  it("reveals the other routes as one branching, rejoining map", async () => {
    const u = user();
    render(<App />);
    await board();
    await solveUnderPar(u);   // sten → bro → hus
    await u.click(
      within(await screen.findByRole("dialog", {}, { timeout: 2000 })).getByRole("button", {
        name: "Visa resultatet",
      }),
    );
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
      `Kedjan · sten → hus · 2 länkar (par 3)\n🔗🔗 ⭐\n${window.location.origin}`,
    );
  });
});

describe("test mode", () => {
  const chip = (part: string) =>
    screen.getByRole("button", { name: new RegExp(`^${part}\\.`, "i") });
  const solve = async (u: ReturnType<typeof user>) => {
    await u.click(chip("bro"));
    await screen.findByText(/Under par — briljant!/);
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
    expect(screen.queryByText(/Under par — briljant!/)).not.toBeInTheDocument();
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
    // The verdicts are transient state, but the chain they judge is not: a
    // reloaded chain comes back judged, with its checks and weld words.
    expect(await screen.findAllByText("länken håller")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /stenmur.*ordboken/i })).toBeInTheDocument();
  });

  it("keeps a solved day's checks and weld words across a reload", async () => {
    const u = user();
    const { unmount } = render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await screen.findByText(/Under par — briljant!/);
    unmount();

    render(<App />);
    expect(await screen.findByText(/Under par — briljant!/)).toBeInTheDocument();
    expect(await screen.findAllByText("länken håller")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /stenbro.*ordboken/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /brohus.*ordboken/i })).toBeInTheDocument();
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
    await screen.findByText(/Under par — briljant!/);

    await openArchive(u);
    await u.click(replayAll()!);
    await u.click(screen.getByRole("button", { name: "Öppna igen" }));

    await u.click(screen.getByRole("tab", { name: "Dagens" }));
    expect(screen.getByRole("button", { name: /^bro\./i })).toBeInTheDocument();
    expect(screen.queryByText(/Under par — briljant!/)).not.toBeInTheDocument();

    // The day was played and solved; reopening it does not un-play it, and
    // re-solving must not count it a second time either.
    const saved = JSON.parse(localStorage.getItem("kedjan.v1") ?? "{}");
    expect(saved.stats.solved).toBe(1);
    expect(saved.progress["2026-08-06#easy"].solvedAt).toBeTruthy();
  });

  it("leaves the days alone when the reset is waved off", async () => {
    const u = user();
    render(<App />);
    await board();
    await u.click(screen.getByRole("button", { name: /^bro\./i }));
    await screen.findByText(/Under par — briljant!/);

    await openArchive(u);
    await u.click(replayAll()!);
    await u.click(screen.getByRole("button", { name: "Avbryt" }));

    await u.click(screen.getByRole("tab", { name: "Dagens" }));
    expect(screen.getByText(/Under par — briljant!/)).toBeInTheDocument();
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
    await expectStatus("Rekommenderat: 3 länkar.");

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

  // A chain with both its links open, so there are two joints to tell apart:
  // build tak-glas, then take tak back out.
  const twoOpenJoints = async (u: ReturnType<typeof user>) => {
    await u.click(chip("tak"));
    await u.click(chip("glas"));
    await u.click(screen.getByRole("button", { name: /^länk 1, tak\./i }));
  };

  it("drops a pool chip into the joint it was released over", async () => {
    const u = user();
    render(<App />);
    await board();
    await twoOpenJoints(u);
    // Deliberately joint 1, not joint 0: an index-0 drop cannot tell a working
    // parser from one that returns zero for everything. bro holds into hus.
    await dragTo(chip("bro"), 100, 120);
    expect(link(1, "glas")).toBeInTheDocument();
    expect(link(2, "bro")).toBeInTheDocument();
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
    await u.click(chip("tak"));
    // Released over the gap between joints, hitting neither outright but
    // nearer joint 1, where glas holds onto tak.
    await dragTo(chip("glas"), 100, 80);
    expect(screen.getByRole("button", { name: /^länk \d, glas\./i })).toBeInTheDocument();
  });

  it("drops into the gap it is nearest, not the one whose centre is nearest", async () => {
    // The board grows whichever joint is open, so joints differ in height, and
    // centre distance stops being monotonic down the chain: this drop sits
    // below joint 0 and nearest joint 1's *edge*, yet nearer joint 0's
    // centre. Resolving by centre would send the chip backwards, up past a
    // part the player had already dropped it below.
    placeZones((i) => (i === 1 ? 80 : 40));
    const u = user();
    render(<App />);
    await board();
    await twoOpenJoints(u);
    await dragTo(chip("bro"), 100, 75);
    expect(link(1, "glas")).toBeInTheDocument();
    expect(link(2, "bro")).toBeInTheDocument();
  });

  it("takes drops from its own parts, moving one onto an open link", async () => {
    const u = user();
    render(<App />);
    await board();
    await twoOpenJoints(u);
    await dragTo(chip("bro"), 100, 120);   // glas, bro
    // Moving a part already in the chain does not make it longer, so the
    // joints have to come back for it rather than demanding a removal first.
    await dragTo(link(2, "bro"), 100, 20);
    expect(link(1, "bro")).toBeInTheDocument();
    expect(link(2, "glas")).toBeInTheDocument();
  });

  it("does nothing when a pool chip is dropped back on the pool", async () => {
    render(<App />);
    await board();
    await dragTo(chip("glas"), 100, 900);
    expect(chip("glas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^länk 1, glas\./i })).not.toBeInTheDocument();
  });
});
