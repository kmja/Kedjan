import { Fragment, type CSSProperties } from "react";
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
/** Sideways travel at the widest point of the resting sway, in pixels. */
const IDLE_AMPLITUDE = 2.6;
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

  // Parts and joints alternate all the way down, so the chain is one run of
  // pieces: part i sits at 2i, the joint after it at 2i + 1.
  const pieces = 2 * full.length - 1;
  const settledAt = settled ? chain.indexOf(settled.part) : -1;
  const epicentre = settledAt < 0 ? null : 2 * (settledAt + 1);

  const piece = (at: number) => {
    const amp = IDLE_AMPLITUDE * Math.sin((Math.PI * at) / (pieces - 1));
    const swing = epicentre === null ? 0 : pulseAt(Math.abs(at - epicentre));
    const style = { "--amp": `${amp.toFixed(2)}px` } as Record<string, string>;
    let className = "chain-piece";
    if (swing > PULSE_FLOOR) {
      style["--pulse"] = `${swing.toFixed(2)}deg`;
      style["--pulse-delay"] = `${Math.abs(at - epicentre!) * PULSE_STEP_MS}ms`;
      // Two identical pulses under alternating names: swapping the class
      // restarts the swing when a part is re-hung, without remounting the
      // piece and throwing away keyboard focus.
      className += settled!.nonce % 2 ? " chain-piece--pulse-b" : " chain-piece--pulse-a";
    }
    return { className, style: style as CSSProperties };
  };
  // A full chain still takes drops from its own parts: moving one around does
  // not lengthen it, and hiding every joint at the ceiling would force a
  // player to take a part out before they could reorder the rest.
  const canGrow = !solved && (chain.length < maxParts || dragSource === "chain");

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

    // Only a weld that holds changes the line. A weld that does not hold
    // leaves the link exactly as it was before anyone tried: open, dashed,
    // hanging in midair. There is nothing to mark, because nothing was made.
    const line = <span className={`joint-line ${mark === "ok" ? "joint-line--ok" : ""}`} />;
    /** The compound this joint spells, shown the moment the weld holds. */
    const word = mark === "ok" ? day.pairs[`${full[index]}>${full[index + 1]}`] : undefined;
    // Hidden while the joint offers its drop slot — the two would overlap.
    // The word links to its dictionary lookup — the player who doubts a weld
    // is one tap from the authority, which is also how ghosts like tomslag
    // get caught. svenska.se/?q= is the site's own search form (SAOL, SO and
    // SAOB at once); the /saol/?sok= deep link looked right and did not work.
    const weld = word && !open && (
      <a
        className="weld-word"
        href={`https://svenska.se/?q=${encodeURIComponent(word)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${word} — slå upp i ordboken`}
      >
        {word}
      </a>
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
        <span key={jointStamps[index]} className="verdict verdict--ok">
          <span className="verdict-glyph" aria-hidden="true">
            ✓
          </span>
          <span className="sr-only">länken håller</span>
        </span>
      ) : mark === "broken" ? (
        // Nothing to see; the words are for whoever cannot see the gap.
        <span className="sr-only">öppen länk</span>
      ) : null;

    const hang = piece(2 * index + 1);

    if (!canGrow || forged) {
      return (
        <li
          className={`joint ${hang.className}`}
          style={hang.style}
          aria-hidden={mark === null}
        >
          {line}
          {verdict}
          {weld}
        </li>
      );
    }

    // Past the forged branch only an open link is left, judged or not yet.
    const said = mark ? `${full[index]} plus ${full[index + 1]} bildar inget ord. ` : "";
    return (
      <li
        className={`joint ${open ? "joint--open" : ""} ${hang.className}`}
        style={hang.style}
      >
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
          {line}
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
      </li>
    );
  };

  return (
    <ol className="chain" aria-label={`Kedjan: ${spoken}`}>
      <li {...piece(0)}>
        <span className="node node--endpoint">{day.start}</span>
      </li>

      {chain.map((part, i) => (
        <Fragment key={part}>
          {joint(i)}
          <li {...piece(2 * (i + 1))}>
            {solved ? (
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
            )}
          </li>
        </Fragment>
      ))}

      {joint(chain.length)}
      <li {...piece(pieces - 1)}>
        <span
          className={`node node--endpoint ${solved ? "snap" : ""} ${
            marked === day.target ? "chip--marked" : ""
          }`}
        >
          {day.target}
        </span>
      </li>
    </ol>
  );
}
