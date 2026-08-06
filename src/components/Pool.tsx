import type { RefObject } from "react";
import type { DropTarget } from "../game/useChipDrag";

type ChipHandlers = ReturnType<
  (part: string, target: DropTarget) => Record<string, unknown>
>;

interface Props {
  parts: string[];
  marked: string | null;
  /** The pool chip currently being dragged into the chain, if any. */
  liftedPart: string | null;
  /** Set while a chain part is being dragged back here. */
  incoming: boolean;
  current: string;
  zoneRef: RefObject<HTMLDivElement | null>;
  handlers: (part: string, target: DropTarget) => ChipHandlers;
}

/**
 * The pool is the move-space — recognition, not recall. Every chip is a real
 * button, so the game is fully playable from the keyboard and by a screen
 * reader with no drag involved. It doubles as the drop zone for a part being
 * taken back out of the chain.
 */
export function Pool({
  parts,
  marked,
  liftedPart,
  incoming,
  current,
  zoneRef,
  handlers,
}: Props) {
  return (
    <div
      ref={zoneRef}
      className={`dropzone flex min-h-14 flex-wrap content-start justify-center gap-2 p-1 ${
        incoming ? "dropzone--armed" : ""
      }`}
      role="group"
      aria-label={`Delar att välja bland, ${parts.length} kvar`}
    >
      {parts.map((part) => (
        <button
          key={part}
          type="button"
          {...handlers(part, "chain")}
          className={`chip ${marked === part ? "chip--marked" : ""} ${
            liftedPart === part ? "chip--lifted" : ""
          }`}
          aria-label={
            `${part}. Lägg efter ${current}.` +
            (marked === part ? " Ledtråd: det här är rätt väg vidare." : "")
          }
        >
          {marked === part && <span aria-hidden="true">⭐</span>}
          {part}
        </button>
      ))}
    </div>
  );
}
