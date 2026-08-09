import { POOL_ZONE } from "../game/useChipDrag";

type ChipHandlers = Record<string, unknown>;

interface Props {
  parts: string[];
  marked: string | null;
  liftedPart: string | null;
  /** True while a chain part is being dragged back here. */
  incoming: boolean;
  /** Where the next click will land, so the chip can say so. */
  armedJoint: number | null;
  /** Chips a hint has ruled out: in no winning route from here. */
  dimmed: ReadonlySet<string>;
  /** The chip whose placement was just refused — it shakes, here, at home. */
  rejected: { part: string; nonce: number } | null;
  handlers: (part: string, source: "pool" | "chain") => ChipHandlers;
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
  armedJoint,
  dimmed,
  rejected,
  handlers,
}: Props) {
  const destination =
    armedJoint === null ? "sist i kedjan" : `plats ${armedJoint + 1} i kedjan`;

  return (
    <div
      data-drop-zone={POOL_ZONE}
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
          {...handlers(part, "pool")}
          className={`chip ${marked === part ? "chip--marked" : ""} ${
            liftedPart === part ? "chip--lifted" : ""
          } ${dimmed.has(part) ? "chip--dimmed" : ""} ${
            // Two identical animations, alternated by nonce, so a chip
            // refused twice in a row shakes twice — swapping the class name
            // restarts the animation without remounting the button, which
            // would throw away keyboard focus.
            rejected?.part === part
              ? rejected.nonce % 2
                ? "chip--rejected-b"
                : "chip--rejected-a"
              : ""
          }`}
          aria-label={
            `${part}. Lägg på ${destination}.` +
            (marked === part ? " Ledtråd: den här passar." : "") +
            // Dimmed chips stay playable: the hint narrows the field, it does
            // not confiscate a move.
            (dimmed.has(part) ? " Ledtråd: den här leder inte till målet." : "")
          }
        >
          {marked === part && <span aria-hidden="true">⭐</span>}
          {part}
        </button>
      ))}
    </div>
  );
}
