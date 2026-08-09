import {
  Fragment,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Day } from "../types";
import { JOINT_ZONE } from "../game/useChipDrag";

/**
 * How the chain hangs and moves.
 *
 * The chain is anchored at both ends — the start above, the target below —
 * so at rest it does what a real chain fixed at both ends does: a standing
 * wave, motionless at the anchors and widest in the middle. Amplitude is
 * therefore a half sine over the chain's length, computed per piece rather
 * than guessed, so adding a part reshapes the whole hang.
 *
 * A part clipping on sends a pulse out from where it landed: each piece
 * swings a beat after its neighbour and less far, which is what makes the
 * chain read as one connected thing rather than a stack of chips.
 */
/** How far a whole chain swings from upright, in degrees. */
const SWAY_ANGLE = 2.2;

/**
 * What each kind of piece contributes to a chain's length, in pixels at the
 * default text size. These mirror the heights in the stylesheet: the sway is
 * built out of them, so a piece's travel is its real distance from the
 * anchor and the chain holds together where the pieces meet.
 */
const HEIGHT_OF: Record<"part" | "link" | "loose-below" | "loose-above", number> = {
  part: 44,
  link: 44,
  "loose-below": 25,
  "loose-above": 25,
};
/** How far the piece at the epicentre of a placement swings, in degrees. */
const PULSE_DEGREES = 3.2;
/** Each piece further from the epicentre swings e^-k as far. */
const PULSE_FALLOFF = 0.45;
/** …and a beat later, so the pulse travels rather than flashing. */
const PULSE_STEP_MS = 55;
/** Below this the swing is not worth an animation. */
const PULSE_FLOOR = 0.06;

const pulseAt = (distance: number) =>
  PULSE_DEGREES * Math.exp(-PULSE_FALLOFF * distance);

/** The range of resting periods a chain can take, in seconds. */
const SWAY_SLOWEST = 1.15;
const SWAY_QUICKEST = 0.8;

/**
 * A number in [0, 1) from a word — stable, so a chain keeps the same rhythm
 * for as long as it exists rather than lurching every time it is redrawn.
 * FNV-1a; nothing here needs a better hash than that.
 */
function seedOf(word: string): number {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h = Math.imul(h ^ word.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * A link, drawn as the ring it is.
 *
 * Geometry in the viewBox is in pixels at the default text size: a ring is
 * 24.8 tall, and two of them overlap by 4.8 so they read as interlocked
 * rather than stacked. The ring in front is drawn twice — once fat in the
 * paper colour — so it breaks the one behind where it passes through, which
 * is the whole difference between a chain and a row of ovals.
 *
 * An open ring is the same path with a gap left in the stroke, facing the
 * space it has not closed. `pathLength` normalises the outline to 100 so the
 * gap can be placed as a plain percentage instead of by measuring an arc.
 */
/** Ring geometry, in viewBox units that render one to one with pixels. */
const RING_RX = 3.6;
const RING_RY = 6;
const RING_STROKE = 2.2;
/** Centre to centre. Less than two radii, so consecutive rings interlock. */
const RING_STEP = 9.4;
const RING_W = 14;
/** How far each link of a loose end leans past the one holding it. */
const RING_SWING = 5;

/**
 * How far each link of a run leans from upright, as a share of RING_SWING.
 *
 * A run between two parts is pulled taut between them, and the links of a
 * taut chain all lie along it — so they lean together, by however much the
 * run itself does, and not against each other. Bending them apart makes the
 * run bow, and a bow is slack the run has not got.
 *
 * A dangling end is held at one end only. Its links may lean further and
 * further the closer they are to the tip, which is what carries a loose end
 * out and the one place a chain visibly articulates.
 */
function leanOf(i: number, free: boolean): number {
  return free ? i + 1 : 0;
}
/** A dangling end is one whole link and then the open one at the tip. */
const LOOSE_RINGS = 2;
/** A weld is three whole links. */
const FORGED_RINGS = 3;

const rem = (units: number) => `${units / 16}rem`;

const ringPath = (cy: number) =>
  `M ${RING_W / 2} ${cy - RING_RY}` +
  ` A ${RING_RX} ${RING_RY} 0 0 1 ${RING_W / 2} ${cy + RING_RY}` +
  ` A ${RING_RX} ${RING_RY} 0 0 1 ${RING_W / 2} ${cy - RING_RY}`;

function Links({
  rings,
  gap,
  className,
  style,
}: {
  rings: number;
  /** Which end of the run is left open, on a dangling end. */
  gap?: "top" | "bottom";
  className: string;
  style?: CSSProperties;
}) {
  const height = RING_RY * 2 + (rings - 1) * RING_STEP + 2;
  const opened = gap === "top" ? 0 : gap === "bottom" ? rings - 1 : -1;

  /*
   * Each link is nested inside the one it hangs from, hinged at the point
   * where they meet, so their swings compose the way a chain's do: the
   * second link inherits whatever the first is doing and adds its own, and
   * the last one at the tip moves most. Each also runs a beat behind the
   * link above it, which is what stops a run of links reading as one rigid
   * piece of wire.
   */
  const link = (i: number): ReactNode => {
    const cy = RING_RY + 1 + i * RING_STEP;
    const open = i === opened;
    // Links nest, so each carries whatever the one above it is doing. What
    // this link is told is only its own share of the bend: the difference
    // between how far it leans and how far its parent does.
    const own =
      (leanOf(i, gap !== undefined) -
        (i === 0 ? 0 : leanOf(i - 1, gap !== undefined))) *
      RING_SWING;
    return (
      <g
        className="ring"
        style={
          {
            transformOrigin: `${RING_W / 2}px ${cy - RING_RY}px`,
            "--own": `${own.toFixed(2)}deg`,
          } as CSSProperties
        }
      >
        {i > 0 && (
          <path
            d={ringPath(cy)}
            fill="none"
            stroke="var(--paper)"
            strokeWidth={RING_STROKE + 2.4}
          />
        )}
        <path
          d={ringPath(cy)}
          pathLength={100}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={open ? "72 28" : undefined}
          strokeDashoffset={open ? (gap === "bottom" ? -64 : -14) : undefined}
        />
        {i + 1 < rings && link(i + 1)}
      </g>
    );
  };

  return (
    <svg
      className={className}
      style={{ width: rem(RING_W), height: rem(height), ...style }}
      viewBox={`0 0 ${RING_W} ${height}`}
      // The links swing past the box they are drawn in; nothing else is
      // there, so let them.
      overflow="visible"
      aria-hidden="true"
    >
      {link(0)}
    </svg>
  );
}

/** The beat a placed part is left where it was dropped, before the chain moves. */
const SETTLE_HOLD_MS = 110;
/** How long the chain then takes to open up around it. */
const SETTLE_MS = 380;

/**
 * Let the chain rearrange itself in front of the player instead of jumping.
 *
 * Adding a part re-lays out everything below it, and a layout jump is a
 * change nobody can follow: the board simply looks different. So each row
 * is measured before and after, and any row that moved is animated from
 * where it was — the standard first-last-invert-play. The whole rearrangement
 * waits a beat first, which leaves the part sitting where it was dropped
 * long enough to register before the chain opens up around it.
 *
 * The animations run on the rows; the swaying runs on the pieces inside
 * them, so neither can overwrite the other's transform.
 */
function useSettling(signature: string) {
  const root = useRef<HTMLOListElement>(null);
  const before = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const rows = root.current?.querySelectorAll<HTMLElement>("[data-row]");
    if (!rows) return;
    const after = new Map<string, number>();
    for (const row of rows)
      after.set(row.dataset.row!, row.getBoundingClientRect().top);

    for (const row of rows) {
      // jsdom has no Web Animations; the measuring above is harmless there.
      if (typeof row.animate !== "function") break;
      const id = row.dataset.row!;
      const from =
        before.current.get(id) ?? before.current.get(row.dataset.rowFrom ?? "");
      const timing = {
        duration: SETTLE_MS,
        delay: SETTLE_HOLD_MS,
        easing: "cubic-bezier(0.22, 0.8, 0.3, 1)",
        fill: "backwards" as const,
      };
      // A link is something the board draws once it knows where things are,
      // so a new one fades in as the chain moves rather than during the hold.
      // A part is something the player put down: it shows at once, where they
      // dropped it. That is what keeps the held frame the board they left.
      if (
        before.current.size &&
        !before.current.has(id) &&
        "rowFade" in row.dataset
      ) {
        row.animate([{ opacity: 0 }, { opacity: 1 }], timing);
      }
      if (from === undefined) continue;
      const travel = from - after.get(id)!;
      if (Math.abs(travel) < 1) continue;
      row.animate(
        [
          { transform: `translateY(${travel.toFixed(1)}px)` },
          { transform: "none" },
        ],
        timing,
      );
    }
    before.current = after;
  }, [signature]);

  return root;
}

type ChipHandlers = Record<string, unknown>;

/** A joint's verdict once the chain has been judged. */
export type JointMark = "ok" | "broken" | null;

interface Props {
  day: Day;
  chain: string[];
  solved: boolean;
  marked: string | null;
  /** Joint the next chip will land in, if the player has aimed at one. */
  armedJoint: number | null;
  /** Most parts the chain may hold. */
  maxParts: number;
  /** Verdict per joint of [start, ...chain, target]; null means not yet judged. */
  jointMarks: JointMark[];
  /**
   * Animation stamp per joint. A stamp changes only when the weld the joint
   * judges (or its verdict) changed, so an untouched mark keeps its DOM node
   * and does not replay its animation when something elsewhere moves.
   */
  jointStamps: number[];
  /** The chip that just clipped on, so it can swing on its new hook. */
  settled: { part: string; nonce: number } | null;
  dragOver: string | null;
  /** Where the chip in flight came from, or null when nothing is in flight. */
  dragSource: "pool" | "chain" | null;
  liftedPart: string | null;
  handlers: (part: string, source: "pool" | "chain") => ChipHandlers;
  onJoint: (index: number) => void;
}

/**
 * The chain, built downwards, growing as it is built.
 *
 * There is no row of empty slots. How many links a day needs is part of the
 * puzzle — a board laying out four gaps has already answered it — so the chain
 * shows only what has been placed, plus one open joint for the next part.
 *
 * Joints and insertion points are the same thing: joint `i` sits between
 * `full[i]` and `full[i + 1]`, so dropping a chip on it puts the part exactly
 * there. Each joint therefore does two jobs — it takes a part, and once the
 * chain has been judged it carries that link's verdict.
 */
export function Chain({
  day,
  chain,
  solved,
  marked,
  armedJoint,
  maxParts,
  jointMarks,
  jointStamps,
  settled,
  dragOver,
  dragSource,
  liftedPart,
  handlers,
  onJoint,
}: Props) {
  const full = [day.start, ...chain, day.target];
  const forged = (index: number) => jointMarks[index] === "ok";
  const settling = useSettling(
    `${full.join(">")}|${jointMarks.join(",")}|${solved}`,
  );

  /*
   * The board is not one chain until it is finished. Every link that has not
   * been forged is a break, and what hangs on either side of it is a chain of
   * its own with a loose end — which is the whole point of the game, so the
   * board says so: separate chains, each swinging by itself, each pulsing
   * only when a part clips onto *it*.
   *
   * Pieces run top to bottom. A forged joint is one piece, a real link. An
   * open joint is two: a loose end hanging off the chain above, and another
   * reaching up from the chain below, with the gap between them.
   */
  type Kind = "part" | "link" | "loose-below" | "loose-above";
  const seq: { kind: Kind; at: number; chainNo: number }[] = [];
  let chainNo = 0;
  for (let i = 0; i < full.length; i++) {
    if (i > 0) {
      if (forged(i - 1)) {
        seq.push({ kind: "link", at: i - 1, chainNo });
      } else {
        seq.push({ kind: "loose-below", at: i - 1, chainNo });
        chainNo += 1;
        seq.push({ kind: "loose-above", at: i - 1, chainNo });
      }
    }
    seq.push({ kind: "part", at: i, chainNo });
  }

  const partPiece = (i: number) =>
    seq.findIndex((s) => s.kind === "part" && s.at === i);

  /*
   * Two chains hanging in perfect step look like one mechanism, not two
   * pieces of chain. Each gets its own period and its own point in the
   * cycle, seeded from the word at the end that holds it — the start, the
   * target, or its topmost part if nothing holds it. That word outlives
   * every part added to the chain, so the rhythm never lurches mid-play.
   */
  /*
   * Every chain swings as what it is: a pendulum hanging from its anchor.
   * A piece's sideways travel is therefore not chosen — it is how far the
   * piece sits from that anchor, times the angle the chain has swung
   * through. Every piece shares the angle, so every piece tips; the ones
   * further down simply have further to travel. Given the same angle and
   * true distances, each piece's foot lands exactly where the next piece's
   * head does, and the chain holds together for free.
   */
  const anchored = new Map<
    number,
    {
      period: number;
      phase: number;
      angle: number;
      heldBelow: boolean;
      order: number[];
      reach: Map<number, number>;
      still: Set<number>;
    }
  >();
  for (const chainNo of new Set(seq.map((x) => x.chainNo))) {
    const order = seq
      .map((x, i) => ({ x, i }))
      .filter(({ x }) => x.chainNo === chainNo)
      .map(({ i }) => i);
    const fromTop = seq[order[0]!]!.kind === "part" && seq[order[0]!]!.at === 0;
    const last = seq[order[order.length - 1]!]!;
    const fromBottom = last.kind === "part" && last.at === full.length - 1;

    // Held at both ends once the day is won: taut, and going nowhere.
    const angle = fromTop && fromBottom ? 0 : SWAY_ANGLE;
    const heldBelow = fromBottom && !fromTop;

    // Walk out from the anchor, adding up what hangs between. The anchoring
    // part itself is the thing the chain hangs from: it does not move, and
    // the first piece under it hangs from an edge that stays put.
    const reach = new Map<number, number>();
    const still = new Set<number>();
    let far = 0;
    (heldBelow ? [...order].reverse() : order).forEach((at, i) => {
      if (i === 0 && (fromTop || fromBottom)) {
        reach.set(at, 0);
        still.add(at);
        return;
      }
      reach.set(at, far);
      far += HEIGHT_OF[seq[at]!.kind];
    });

    const anchor = fromTop
      ? day.start
      : fromBottom
        ? day.target
        : full[seq[order[0]!]!.at]!;
    const seed = seedOf(anchor);
    const period = SWAY_QUICKEST + seed * (SWAY_SLOWEST - SWAY_QUICKEST);
    // Under `alternate`, a delay of one whole period runs a chain backwards
    // against its neighbour. Which end holds a chain sets that coarse
    // offset — the two on screen are always held at opposite ends, so they
    // always oppose — and the seed only jitters it, because two seeds drawn
    // at random can land close enough to look like one mechanism, and once
    // did.
    const opposed = heldBelow ? 1 : fromTop ? 0 : 0.5;
    anchored.set(chainNo, {
      period,
      phase: -period * (opposed + seed * 0.3),
      angle,
      heldBelow,
      order,
      reach,
      still,
    });
  }
  const settledAt = settled ? chain.indexOf(settled.part) : -1;
  const epicentre = settledAt < 0 ? null : partPiece(settledAt + 1);

  const piece = (at: number) => {
    const mine = seq[at]!;
    const hang = anchored.get(mine.chainNo)!;
    const angle = hang.still.has(at) ? 0 : hang.angle;
    const travel = hang.reach.get(at)! * Math.tan((angle * Math.PI) / 180);

    // A piece swings from the end that holds it, and the sign follows: a
    // body below its pivot and a body above it swing opposite ways for the
    // same angle. Getting that wrong reads exactly like a loose end pinned
    // to the empty air above it. Which end holds a piece is usually which
    // end holds its chain — except for a loose end that reaches upward,
    // which is held at its foot by the part beneath it whatever the rest of
    // the chain is doing.
    const heldBelow = hang.heldBelow || mine.kind === "loose-above";
    const style = {
      "--amp": `${travel.toFixed(2)}px`,
      "--tilt": `${(heldBelow ? -angle : angle).toFixed(2)}deg`,
      "--pivot": heldBelow ? "100%" : "0%",
      "--period": `${hang.period.toFixed(2)}s`,
      "--phase": `${hang.phase.toFixed(2)}s`,
      // A chain held from below bends the other way, for the same reason.
      "--lean": heldBelow ? "-1" : "1",
    } as Record<string, string>;
    let className = "chain-piece";

    // A pulse runs along the chain the part landed on, and stops at the break.
    const within = hang.order.indexOf(at);
    const sameChain =
      epicentre !== null && seq[epicentre]!.chainNo === mine.chainNo;
    const away = sameChain ? Math.abs(within - hang.order.indexOf(epicentre!)) : 0;
    const swing = sameChain ? pulseAt(away) : 0;
    if (swing > PULSE_FLOOR) {
      style["--pulse"] = `${swing.toFixed(2)}deg`;
      style["--pulse-delay"] = `${away * PULSE_STEP_MS}ms`;
      // Two identical pulses under alternating names: swapping the class
      // restarts the swing when a part is re-hung, without remounting the
      // piece and throwing away keyboard focus.
      className +=
        settled!.nonce % 2 ? " chain-piece--pulse-b" : " chain-piece--pulse-a";
    }
    return { className, style: style as CSSProperties };
  };

  const loose = (index: number, side: "below" | "above") => {
    const at = seq.findIndex(
      (s) => s.kind === `loose-${side}` && s.at === index,
    );
    const { className, style } = piece(at);
    return (
      <Links
        rings={LOOSE_RINGS}
        gap={side === "below" ? "bottom" : "top"}
        className={`joint-stub joint-stub--${side} ${className}`}
        style={{ ...style, marginLeft: rem(-RING_W / 2) }}
      />
    );
  };
  // A full chain still takes drops from its own parts: moving one around does
  // not lengthen it, and hiding every joint at the ceiling would force a
  // player to take a part out before they could reorder the rest.
  const canGrow =
    !solved && (chain.length < maxParts || dragSource === "chain");

  const spoken = [
    `Start ${day.start}`,
    ...chain.map((p, i) => `länk ${i + 1} ${p}`),
    chain.length ? null : "inga delar lagda",
    `mål ${day.target}`,
  ]
    .filter(Boolean)
    .join(", ");

  /**
   * A joint does both jobs at once: it carries the link's verdict once judged,
   * and it stays the place a part can be inserted. Losing the second role the
   * moment the first appeared would make the chain unbuildable after the very
   * first placement.
   *
   * It is shaped like a chip, because a target should look like what will land
   * in it. The outline shows whenever the joint is empty of a verdict, and
   * during a drag every joint shows one — a player should be able to see where
   * a chip may go without having to hunt for it.
   */
  // A render function, not a nested component: a component declared inside
  // the render body is a new type every render, and React remounts its whole
  // subtree each time — which replays every verdict animation on any change.
  const joint = (index: number) => {
    const mark = jointMarks[index] ?? null;
    const armed = armedJoint === index;
    const over = dragOver === `${JOINT_ZONE}${index}`;
    // A forged link is finished work. Prising it apart to slip a part in is
    // a move no player wants — the weld is the thing they were after — so it
    // stops being a target at all: no slot, no hit area, no drop zone.
    const forged = mark === "ok";
    // Every link that is not forged is open, and an open link looks the same
    // whether it has been tried or not: a weld that did not take leaves the
    // space exactly as it found it, waiting for a part that fits.
    const open = canGrow && !forged;

    // A forged link is drawn as one unbroken run of chain. An open one is not
    // drawn at all: what shows is the loose end of the chain above and the
    // loose end of the chain below, with the gap they have not closed.
    const link = forged ? (
      <Links rings={FORGED_RINGS} className="joint-link" />
    ) : (
      <>
        {loose(index, "below")}
        {loose(index, "above")}
      </>
    );
    /** The compound this joint spells, shown the moment the weld holds. */
    const word =
      mark === "ok"
        ? day.pairs[`${full[index]}>${full[index + 1]}`]
        : undefined;
    // Hidden while the joint offers its drop slot — the two would overlap.
    // The word links to its dictionary lookup — the player who doubts a weld
    // is one tap from the authority, which is also how ghosts like tomslag
    // get caught. svenska.se/?q= is the site's own search form (SAOL, SO and
    // SAOB at once); the /saol/?sok= deep link looked right and did not work.
    const weld = word && !open && (
      <span key={jointStamps[index]} className="weld-mark">
        <span className="weld-tick" aria-hidden="true">
          ✓
        </span>
        <a
          className="weld-word"
          href={`https://svenska.se/?q=${encodeURIComponent(word)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${word} — slå upp i ordboken`}
        >
          {word}
        </a>
      </span>
    );
    /**
     * A forged link is marked; an open one is simply open. Nothing is drawn
     * to say a weld failed — the gap says it, the way an unclosed link says
     * it on a real chain.
     *
     * The verdict is a sibling of the button, not a child. The joint's inner
     * shape changes with the game — a button while the chain can grow, plain
     * chain when it cannot — and a verdict nested inside would be remounted
     * by that flip and replay its animation. As a stable sibling it survives
     * every shape the joint takes, and only a new stamp re-animates it.
     */
    const verdict =
      mark === "ok" ? (
        // A forged link is green and closed, and carries the word it spells.
        // Nothing needs to be drawn over it to say so.
        <span className="sr-only">länken håller</span>
      ) : mark === "broken" ? (
        // Nothing to see; the words are for whoever cannot see the gap.
        <span className="sr-only">öppen länk</span>
      ) : null;

    // A forged joint is a piece of chain and hangs like one. An open joint is
    // the gap between two chains: it holds still, and the loose ends inside
    // it swing with whichever chain each belongs to.
    const hang = forged
      ? piece(seq.findIndex((x) => x.kind === "link" && x.at === index))
      : null;

    const rowId = `j:${full[index]}>${full[index + 1]}`;
    // Placing a part splits one link into two; both come out of where that
    // link was, so the whole board can hold its old shape for the beat.
    const splitFrom =
      settledAt >= 0 && (index === settledAt || index === settledAt + 1)
        ? `j:${full[settledAt]}>${full[settledAt + 2]}`
        : undefined;

    if (!canGrow || forged) {
      return (
        <li
          className="link-row"
          data-row={rowId}
          data-row-from={splitFrom}
          data-row-fade=""
          aria-hidden={mark === null}
        >
          <span
            className={`joint ${hang?.className ?? ""}`}
            style={hang?.style}
          >
            {link}
            {verdict}
            {weld}
          </span>
        </li>
      );
    }

    // Past the forged branch only an open link is left, judged or not yet.
    const said = mark
      ? `${full[index]} plus ${full[index + 1]} bildar inget ord. `
      : "";
    return (
      <li
        className="link-row"
        data-row={rowId}
        data-row-from={splitFrom}
        data-row-fade=""
      >
        <span className={`joint ${open ? "joint--open" : ""}`}>
          {link}
          <button
            type="button"
            data-drop-zone={`${JOINT_ZONE}${index}`}
            onClick={() => onJoint(index)}
            className="joint-hit"
            aria-label={
              said +
              (armed
                ? `Vald plats i kedjan, efter ${full[index]}.`
                : `Lägg en del efter ${full[index]}.`)
            }
          >
            {open && (
              <span
                className={`joint-slot ${armed ? "joint-slot--armed" : ""} ${
                  over ? "joint-slot--over" : ""
                }`}
                aria-hidden="true"
              >
                +
              </span>
            )}
          </button>
          {verdict}
          {weld}
        </span>
      </li>
    );
  };

  /**
   * One row of the chain. A part carries no travel of its own: a placed part
   * lands where the open link's slot already was, so it simply stays where
   * the player dropped it while the chain opens up below it.
   */
  const row = (i: number, content: ReactNode) => (
    <li className="link-row" data-row={`p:${full[i]}`}>
      <span {...piece(partPiece(i))}>{content}</span>
    </li>
  );

  return (
    <ol className="chain" ref={settling} aria-label={`Kedjan: ${spoken}`}>
      {row(0, <span className="node node--endpoint">{day.start}</span>)}

      {chain.map((part, i) => (
        <Fragment key={part}>
          {joint(i)}
          {row(
            i + 1,
            solved ? (
              <span className="node">{part}</span>
            ) : (
              <button
                type="button"
                {...handlers(part, "chain")}
                className={`node node--removable ${
                  liftedPart === part ? "chip--lifted" : ""
                }`}
                aria-label={`Länk ${i + 1}, ${part}. Ta bort den ur kedjan.`}
              >
                {part}
              </button>
            ),
          )}
        </Fragment>
      ))}

      {joint(chain.length)}
      {row(
        full.length - 1,
        <span
          className={`node node--endpoint ${solved ? "snap" : ""} ${
            marked === day.target ? "chip--marked" : ""
          }`}
        >
          {day.target}
        </span>,
      )}
    </ol>
  );
}
