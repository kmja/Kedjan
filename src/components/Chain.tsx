import type { RefObject } from "react";
import type { Day } from "../types";

interface Props {
  day: Day;
  chain: string[];
  solved: boolean;
  marked: string | null;
  dragging: boolean;
  zoneRef: RefObject<HTMLDivElement | null>;
  onFinish: () => void;
}

/**
 * The bridge under construction: start, the parts placed so far, the slots the
 * budget still pays for, and the target. The slots are the budget made
 * visible — they deplete as the chain grows.
 */
export function Chain({ day, chain, solved, marked, dragging, zoneRef, onFinish }: Props) {
  const placed = [day.start, ...chain];
  const emptySlots = solved ? 0 : day.budget - 1 - chain.length;

  const spoken = [
    `Start ${day.start}`,
    ...chain.map((p, i) => `länk ${i + 1} ${p}`),
    emptySlots > 0 ? `${emptySlots} lediga platser kvar` : null,
    `mål ${day.target}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      ref={zoneRef}
      className={`dropzone flex flex-wrap items-center justify-center gap-1 px-1 py-2 ${
        dragging ? "dropzone--armed" : ""
      }`}
    >
      <ol className="contents" aria-label={`Kedjan: ${spoken}`}>
        {placed.map((part, i) => {
          const isStart = i === 0;
          const isHead = !solved && i === placed.length - 1 && !isStart;
          return (
            <li key={`${part}-${i}`} className="flex items-center">
              {i > 0 && (
                <span className="joint" aria-hidden="true">
                  +
                </span>
              )}
              <span
                className={`node ${isStart ? "node--endpoint" : ""} ${
                  isHead ? "node--head" : ""
                } ${i === placed.length - 1 ? "snap" : ""}`}
              >
                {part}
              </span>
            </li>
          );
        })}

        {Array.from({ length: emptySlots }, (_, i) => (
          <li key={`slot-${i}`} className="flex items-center" aria-hidden="true">
            <span className="joint">+</span>
            <span className={`node node--slot ${dragging && i === 0 ? "node--slot-active" : ""}`}>
              {dragging && i === 0 ? "här" : "··"}
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
