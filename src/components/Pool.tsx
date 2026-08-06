import type { PointerEvent } from "react";

type ChipHandlers = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onClick: () => void;
};

interface Props {
  parts: string[];
  marked: string | null;
  liftedPart: string | null;
  current: string;
  handlers: (part: string) => ChipHandlers;
}

/**
 * The pool is the move-space — recognition, not recall. Every chip is a real
 * button, so the game is fully playable from the keyboard and by a screen
 * reader with no drag involved.
 */
export function Pool({ parts, marked, liftedPart, current, handlers }: Props) {
  return (
    <div
      className="flex flex-wrap justify-center gap-2"
      role="group"
      aria-label={`Delar att välja bland, ${parts.length} kvar`}
    >
      {parts.map((part) => (
        <button
          key={part}
          type="button"
          {...handlers(part)}
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
