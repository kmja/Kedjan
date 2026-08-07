import { Fragment } from "react";
import type { Day } from "../types";

type ChipHandlers = Record<string, unknown>;

/** A joint's verdict once the chain has been judged. */
export type JointMark = "ok" | "broken" | null;

interface Props {
  day: Day;
  slots: (string | null)[];
  solved: boolean;
  marked: string | null;
  armedSlot: number | null;
  /** Verdict per joint of [start, ...filled, target]; null means not yet judged. */
  jointMarks: JointMark[];
  /** Bumped on every judgement so the marks re-animate rather than sit still. */
  verdictKey: number;
  dragOver: string | null;
  liftedPart: string | null;
  handlers: (part: string, source: "pool" | "chain") => ChipHandlers;
  onSlot: (index: number) => void;
}

/**
 * The bridge as a zigzag: parts alternate high and low along a horizontal run,
 * joined by diagonal links that carry the verdict.
 *
 * The alternation is what buys the space. Neighbours sit at different heights,
 * so they can be packed far closer than a straight row allows — a straight row
 * of a par-4 day wrapped mid-bridge on a phone and left the target stranded on
 * a line of its own.
 *
 * Parts go into any slot in any order. The chain is judged as a whole after
 * every placement, and each joint carries its own verdict.
 */
export function Chain({
  day,
  slots,
  solved,
  marked,
  armedSlot,
  jointMarks,
  verdictKey,
  dragOver,
  liftedPart,
  handlers,
  onSlot,
}: Props) {
  // Joints are numbered over the compacted chain, so a slot's joint is the one
  // before it, counted among filled slots only.
  const jointBefore = (slotIndex: number) =>
    slots.slice(0, slotIndex).filter(Boolean).length;
  const filled = slots.filter(Boolean).length;

  const spoken = [
    `Start ${day.start}`,
    ...slots.map((s, i) => (s ? `plats ${i + 1} ${s}` : `plats ${i + 1} tom`)),
    `mål ${day.target}`,
  ].join(", ");

  /** `slot` is the position after this joint, which fixes the diagonal's tilt. */
  const Joint = ({ index, live, slot }: { index: number; live: boolean; slot: number }) => {
    const mark = live ? jointMarks[index] ?? null : null;
    // Even positions sit high and odd sit low, so a joint running into an odd
    // position slopes down, and one running into an even position slopes up.
    const tilt = slot % 2 === 1 ? "down" : "up";
    return (
      <li className={`joint joint--${tilt}`} aria-hidden={mark === null}>
        <span className={`joint-line ${mark ? `joint-line--${mark}` : ""}`} />
        {mark && (
          <span key={`${verdictKey}-${index}`} className={`verdict verdict--${mark}`}>
            <span aria-hidden="true">{mark === "ok" ? "✓" : "✗"}</span>
            <span className="sr-only">
              {mark === "ok" ? "länken håller" : "bruten länk"}
            </span>
          </span>
        )}
      </li>
    );
  };

  /** Position in the zigzag, endpoints included. */
  const rung = (i: number) => (i % 2 === 0 ? "rung--high" : "rung--low");

  return (
    <ol
      className={`chain ${slots.length >= 4 ? "chain--long" : ""}`}
      aria-label={`Kedjan: ${spoken}`}
    >
      <li className={rung(0)}>
        <span className="node node--endpoint">{day.start}</span>
      </li>

      {slots.map((part, i) => (
        <Fragment key={i}>
          <Joint index={jointBefore(i)} live={part !== null} slot={i + 1} />
          <li className={rung(i + 1)}>
            {part === null ? (
              <button
                type="button"
                data-drop-zone={`slot:${i}`}
                onClick={() => onSlot(i)}
                disabled={solved}
                className={`node node--slot ${
                  armedSlot === i ? "node--slot-armed" : ""
                } ${dragOver === `slot:${i}` ? "node--slot-active" : ""}`}
                aria-label={
                  armedSlot === i
                    ? `Plats ${i + 1}, vald. Välj en del att lägga här.`
                    : `Plats ${i + 1}, tom. Välj den för att lägga nästa del här.`
                }
              >
                <span aria-hidden="true">{armedSlot === i ? "▸" : "··"}</span>
              </button>
            ) : solved ? (
              <span className="node">{part}</span>
            ) : (
              <button
                type="button"
                data-drop-zone={`slot:${i}`}
                {...handlers(part, "chain")}
                className={`node node--removable ${
                  liftedPart === part ? "chip--lifted" : ""
                } ${dragOver === `slot:${i}` ? "node--slot-active" : ""}`}
                aria-label={`Plats ${i + 1}, ${part}. Ta bort den ur kedjan.`}
              >
                {part}
              </button>
            )}
          </li>
        </Fragment>
      ))}

      <Joint index={filled} live={filled > 0} slot={slots.length + 1} />
      <li className={rung(slots.length + 1)}>
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
