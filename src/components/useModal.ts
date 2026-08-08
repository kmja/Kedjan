import { useEffect, type RefObject } from "react";

/**
 * Open a native <dialog> as a modal on mount, with the jsdom/old-browser
 * fallback both our dialogs need: no showModal, use the open attribute —
 * the backdrop is lost, the dialog is not.
 */
export function useModal(ref: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute("open", "");
  }, [ref]);

  return (onFallbackClose: () => void) => {
    const dialog = ref.current;
    if (dialog?.close) dialog.close(); // fires the dialog's onClose
    else {
      dialog?.removeAttribute("open");
      onFallbackClose();
    }
  };
}
