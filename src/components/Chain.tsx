import type { RefObject } from "react";
import type { Day } from "../types";
import type { DropTarget } from "../game/useChipDrag";
import { plural } from "../game/plural";

type ChipHandlers = ReturnType<
  (part: string, target: DropTarget) => Record<string, unknown>
>;

interface Props {
  day: Day;
  chain: string[];
  solved: boolean;
  marked: string | null;
  /** Set while a chip is being dragged *into* the chain. */
  incoming: boolean;
  /** The chain part currently being dragged back out to the pool, if any. */
  liftedPart: string | null;
  zoneRef: RefObject<HTMLDivElement | null>;
  handlers: (part: string, target: DropTarget) => ChipHandlers;
  onFinish: () => void;
}

/**
 * The bridge under construction: start, the parts placed so far, the slots the
 * budget still pays for, and the target. The slots are the budget made
 * visible — they deplete as the chain grows.
 *
 * Placed parts are buttons: activating one takes it back out of the chain,
 * along with everything downstream of it.
 */
export function Chain({
  day,
  chain,
  solved,
  marked,
  incoming,
  liftedPart,
  zoneRef,
  handlers,
  onFinish,
}: Props) {
  const emptySlots = solved ? 0 : day.budget - 1 - chain.length;

  const spoken = [
    `Start ${day.start}`,
    ...chain.map((p, i) => `länk ${i + 1} ${p}`),
    emptySlots > 0 ? `${emptySlots} lediga platser kvar` : null,
    `mål ${day.target}`,
  ]
    .filter(Boolean)
    .join(", ");

  const removalHint = (index: number) => {
    const after = chain.length - index - 1;
    return after === 0
      ? " Ta bort från kedjan."
      : ` Ta bort från kedjan, tillsammans med ${plural(after, "del", "delar")} efter den.`;
  };

  return (
    <div
      ref={zoneRef}
      className={`dropzone flex flex-wrap items-center justify-center gap-1 px-1 py-2 ${
        incoming ? "dropzone--armed" : ""
      }`}
    >
      <ol className="contents" aria-label={`Kedjan: ${spoken}`}>
        <li className="flex items-center">
          <span className="node node--endpoint">{day.start}</span>
        </li>

        {chain.map((part, i) => {
          const isHead = i === chain.length - 1;
          const classes = [
            "node",
            solved ? "" : "node--removable",
            isHead && !solved ? "node--head" : "",
            isHead ? "snap" : "",
            liftedPart === part ? "chip--lifted" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <li key={part} className="flex items-center">
              <span className="joint" aria-hidden="true">
                +
              </span>
              {solved ? (
                <span className={classes}>{part}</span>
              ) : (
                <button
                  type="button"
                  {...handlers(part, "pool")}
                  className={classes}
                  aria-label={`Länk ${i + 1}, ${part}.${removalHint(i)}`}
                >
                  {part}
                </button>
              )}
            </li>
          );
        })}

        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`slot-${i}`} className="flex items-center" aria-hidden="true">
            <span className="joint">+</span>
            <span className={`node node--slot ${incoming && i === 0 ? "node--slot-active" : ""}`}>
              {incoming && i === 0 ? "här" : "··"}
            </span>
          </li>
        ))}

        <li className="flex items-center">
          <span className="joint" aria-hidden="true">
            +
          </span>
          {solved ? (
            <span className="node node--endpoint snap">{day.target}</span>
          ) : (
            <button
              type="button"
              onClick={onFinish}
              className={`node node--goal ${marked === day.target ? "chip--marked" : ""}`}
              aria-label={`Mål ${day.target}. Koppla ihop och avsluta kedjan.${
                marked === day.target ? " Ledtråd: det här är rätt drag." : ""
              }`}
            >
              {marked === day.target && <span aria-hidden="true">⭐&nbsp;</span>}
              {day.target}
            </button>
          )}
        </li>
      </ol>
    </div>
  );
}
