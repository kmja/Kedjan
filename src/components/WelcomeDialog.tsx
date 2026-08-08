import { useRef } from "react";
import { HowToPlayBody } from "./HowToPlay";
import { useModal } from "./useModal";

interface Props {
  onClose: () => void;
}

/** The rules, once, before the first chip. Never again after that. */
export function WelcomeDialog({ onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const dismiss = useModal(ref);

  return (
    <dialog ref={ref} className="outcome" onClose={onClose} aria-label="Så spelar du">
      <h2 className="outcome-title outcome-title--ink">Så spelar du</h2>
      <div className="mt-3">
        <HowToPlayBody />
      </div>
      <div className="mt-4">
        <button
          type="button"
          className="btn--major btn w-full"
          onClick={() => dismiss(onClose)}
        >
          Nu spelar vi
        </button>
      </div>
    </dialog>
  );
}
