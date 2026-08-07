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
 * The bridge, built downwards: start at the top, the budget's slots beneath it,
 * the target at the foot.
 *
 * Vertical because a chain reads as a chain that way — and because a par-4 day
 * laid out in a row wrapped mid-bridge on a phone, which put the target on its
 * own line looking like a separate thing.
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

  const Joint = ({ index, live }: { index: number; live: boolean }) => {
    const mark = live ? jointMarks[index] ?? null : null;
    return (
      <li className="joint-row" aria-hidden={mark === null}>
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

  return (
    <ol className="chain" aria-label={`Kedjan: ${spoken}`}>
      <li>
        <span className="node node--endpoint node--wide">{day.start}</span>
      </li>

      {slots.map((part, i) => (
        <Fragment key={i}>
          <Joint index={jointBefore(i)} live={part !== null} />
          <li>
            {part === null ? (
              <button
                type="button"
                data-drop-zone={`slot:${i}`}
                onClick={() => onSlot(i)}
                disabled={solved}
                className={`node node--wide node--slot ${
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
              <span className="node node--wide">{part}</span>
            ) : (
              <button
                type="button"
                data-drop-zone={`slot:${i}`}
                {...handlers(part, "chain")}
                className={`node node--wide node--removable ${
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

      <Joint index={filled} live={filled > 0} />
      <li>
        <span
          className={`node node--endpoint node--wide ${solved ? "snap" : ""} ${
            marked === day.target ? "chip--marked" : ""
          }`}
        >
          {day.target}
        </span>
      </li>
    </ol>
  );
}
