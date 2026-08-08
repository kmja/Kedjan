import { useEffect, useRef } from "react";
import type { Day } from "../types";
import { RouteTree } from "./RouteTree";

interface Props {
  kind: "win" | "fail";
  day: Day;
  chain: string[];
  others: string[][];
  onClose: () => void;
  /** Fail only: put the day back on the table with fresh lives. */
  onReplay: () => void;
}

/**
 * The day's ending, announced properly. A native <dialog>, so focus, Esc and
 * the backdrop come from the platform rather than from re-implementation.
 *
 * On a win the route map is the celebration: the whole space of the day pops
 * up with the player's own way through it. On a loss the dialog says what
 * happened in the game's own terms and offers the honest way out.
 */
export function OutcomeDialog({ kind, day, chain, others, onClose, onReplay }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    // jsdom (and some very old browsers) lack showModal — fall back to the
    // open attribute, which loses the backdrop but keeps the dialog.
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
  }, []);

  const dismiss = () => {
    const dialog = ref.current;
    if (dialog?.close) dialog.close(); // fires onClose
    else {
      dialog?.removeAttribute("open");
      onClose();
    }
  };

  return (
    <dialog ref={ref} className="outcome" onClose={onClose} aria-label={
      kind === "win" ? "Kedjan håller" : "Bron brast"
    }>
      {kind === "win" ? (
        <>
          <h2 className="outcome-title">Kedjan håller!</h2>
          <p className="outcome-sub">
            Här är alla vägar som fanns — din lyser.
          </p>
          <div className="mt-3">
            <RouteTree day={day} mine={chain} others={others} />
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn--major btn flex-1" onClick={dismiss}>
              Visa resultatet
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="outcome-title outcome-title--fail">Bron brast</h2>
          <p className="outcome-sub">
            Tre delar fäste varken vid delen före eller efter sig. Utan liv
            kvar går bron inte att rädda.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="btn--major btn flex-1"
              onClick={() => {
                onReplay();
                dismiss();
              }}
            >
              Försök igen
            </button>
            <button type="button" className="btn flex-1" onClick={dismiss}>
              Se vägarna
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
