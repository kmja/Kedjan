import { Fragment } from "react";
import type { Day } from "../types";

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
  /** Bumped on every judgement so the marks re-animate rather than sit still. */
  verdictKey: number;
  dragOver: string | null;
  liftedPart: string | null;
  handlers: (part: string, source: "pool" | "chain") => ChipHandlers;
  onJoint: (index: number) => void;
}

/**
 * The bridge, built downwards, growing as it is built.
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
  verdictKey,
  dragOver,
  liftedPart,
  handlers,
  onJoint,
}: Props) {
  const full = [day.start, ...chain, day.target];
  const canGrow = !solved && chain.length < maxParts;

  const spoken = [
    `Start ${day.start}`,
    ...chain.map((p, i) => `länk ${i + 1} ${p}`),
    chain.length ? null : "inga delar lagda",
    `mål ${day.target}`,
  ]
    .filter(Boolean)
    .join(", ");

  /**
   * A joint does both jobs at once. It carries the link's verdict once judged,
   * and it stays the place a part can be inserted — losing the second role the
   * moment the first appears would make the chain unbuildable after the very
   * first placement.
   */
  const Joint = ({ index }: { index: number }) => {
    const mark = jointMarks[index] ?? null;
    const armed = armedJoint === index;
    const over = dragOver === `at:${index}`;

    const face = (
      <>
        <span className={`joint-line ${mark ? `joint-line--${mark}` : ""}`} />
        <span
          key={mark ? `${verdictKey}-${index}` : `open-${index}`}
          className={
            mark
              ? `verdict verdict--${mark}`
              : `joint-add ${armed ? "joint-add--armed" : ""} ${over ? "joint-add--over" : ""}`
          }
        >
          <span aria-hidden="true">{mark === "ok" ? "✓" : mark === "broken" ? "✗" : "+"}</span>
          {mark && (
            <span className="sr-only">
              {mark === "ok" ? "länken håller" : "bruten länk"}
            </span>
          )}
        </span>
      </>
    );

    if (!canGrow) {
      return (
        <li className="joint" aria-hidden={mark === null}>
          {face}
        </li>
      );
    }

    const verdictWords = mark
      ? `${full[index]} plus ${full[index + 1]} ${mark === "ok" ? "håller" : "håller inte"}. `
      : "";
    return (
      <li className={`joint ${mark ? "joint--judged" : ""}`}>
        <button
          type="button"
          data-drop-zone={`at:${index}`}
          onClick={() => onJoint(index)}
          className="joint-hit"
          aria-label={
            verdictWords +
            (armed
              ? `Vald plats i kedjan, efter ${full[index]}.`
              : `Lägg en del efter ${full[index]}.`)
          }
        >
          {face}
        </button>
      </li>
    );
  };

  return (
    <ol className="chain" aria-label={`Kedjan: ${spoken}`}>
      <li>
        <span className="node node--endpoint">{day.start}</span>
      </li>

      {chain.map((part, i) => (
        <Fragment key={part}>
          <Joint index={i} />
          <li>
            {solved ? (
              <span className="node">{part}</span>
            ) : (
              <button
                type="button"
                data-drop-zone={`at:${i}`}
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

      <Joint index={chain.length} />
      <li>
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
