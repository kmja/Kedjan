import type { Day } from "../types";
import { weld } from "../game/graph";

type ChipHandlers = Record<string, unknown>;

interface Props {
  day: Day;
  slots: (string | null)[];
  solved: boolean;
  marked: string | null;
  armedSlot: number | null;
  /** Joints that failed the last time the chain was closed. */
  failedJoints: number[];
  /** Zone id under the pointer mid-drag, e.g. "slot:1". */
  dragOver: string | null;
  liftedPart: string | null;
  handlers: (part: string, source: "pool" | "chain") => ChipHandlers;
  onSlot: (index: number) => void;
  onSubmit: () => void;
}

/**
 * The bridge under construction: start, the budget's slots, and the target.
 *
 * Parts go into any slot in any order and nothing is checked as they land.
 * The target is the final link — activating it closes the chain and judges
 * every joint at once.
 */
export function Chain({
  day,
  slots,
  solved,
  marked,
  armedSlot,
  failedJoints,
  dragOver,
  liftedPart,
  handlers,
  onSlot,
  onSubmit,
}: Props) {
  const filled = slots.filter((s): s is string => s !== null);
  // Joint indices run over [start, ...filled, target], and a slot's joint is
  // the one before it — counted among filled slots, since gaps do not exist
  // once the chain is read.
  const jointBefore = (slotIndex: number) =>
    slots.slice(0, slotIndex).filter(Boolean).length;

  const broken = new Set(failedJoints);
  const spoken = [
    `Start ${day.start}`,
    ...slots.map((s, i) => (s ? `plats ${i + 1} ${s}` : `plats ${i + 1} tom`)),
    `mål ${day.target}`,
  ].join(", ");

  const Joint = ({ index, show }: { index: number; show: boolean }) => (
    <span className={`joint ${show && broken.has(index) ? "joint--broken" : ""}`}>
      <span aria-hidden="true">{show && broken.has(index) ? "✗" : "+"}</span>
      {show && broken.has(index) && <span className="sr-only">bruten länk</span>}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 px-1 py-2">
      <ol className="contents" aria-label={`Kedjan: ${spoken}`}>
        <li className="flex items-center">
          <span className="node node--endpoint">{day.start}</span>
        </li>

        {slots.map((part, i) => (
          <li key={i} className="flex items-center">
            <Joint index={jointBefore(i)} show={part !== null} />
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
        ))}

        <li className="flex items-center">
          <Joint index={filled.length} show={filled.length > 0} />
          {solved ? (
            <span className="node node--endpoint snap">{day.target}</span>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              className={`node node--goal ${marked === day.target ? "chip--marked" : ""}`}
              aria-label={
                `Mål ${day.target}. Slut kedjan här och kontrollera den.` +
                (marked === day.target ? " Ledtråd: det här är rätt drag." : "")
              }
            >
              {marked === day.target && <span aria-hidden="true">⭐&nbsp;</span>}
              {day.target}
            </button>
          )}
        </li>
      </ol>

      {solved && (
        <p className="sr-only">
          {[day.start, ...filled, day.target]
            .map((p, i, a) => (i < a.length - 1 ? weld(day, p, a[i + 1]!) : null))
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
    </div>
  );
}
