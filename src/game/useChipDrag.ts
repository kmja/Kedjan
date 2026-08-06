import { useRef, useState, type PointerEvent } from "react";

export interface DragState {
  part: string;
  x: number;
  y: number;
  /** The zone currently under the pointer, so the board can show the target. */
  over: string | null;
}

/** Movement past this many pixels turns a press into a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
/** Generous slop around a zone, since slots are small targets on a phone. */
const SLOP = { x: 14, y: 24 };

/**
 * Drop zones declare themselves in the DOM with `data-drop-zone="<id>"`, so a
 * board with a variable number of slots does not have to register refs for
 * each one. Ids are `slot:<n>` and `pool`.
 */
function zoneAt(x: number, y: number): string | null {
  const zones = Array.from(document.querySelectorAll<HTMLElement>("[data-drop-zone]"));
  let best: { id: string; distance: number } | null = null;

  for (const el of zones) {
    const r = el.getBoundingClientRect();
    const inside =
      x >= r.left - SLOP.x &&
      x <= r.right + SLOP.x &&
      y >= r.top - SLOP.y &&
      y <= r.bottom + SLOP.y;
    if (!inside) continue;

    // Overlapping slop regions are resolved by centre distance, so a drop
    // between two slots lands in the nearer one rather than the first found.
    const distance = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
    if (!best || distance < best.distance) {
      best = { id: el.dataset.dropZone!, distance };
    }
  }
  return best?.id ?? null;
}

export interface DragActions {
  /** A pool chip landed on slot `index`. */
  onDropInSlot: (part: string, index: number) => void;
  /** A chip landed back in the pool. */
  onReturnToPool: (part: string) => void;
  /** Activated without a drag — click, tap, Enter, or a screen reader. */
  onActivate: (part: string, source: "pool" | "chain") => void;
}

/**
 * Pointer drag over chips that are ordinary buttons.
 *
 * A drag resolves on pointerup against whichever zone is under the pointer;
 * everything else — click, tap, Enter, Space, assistive activation — resolves
 * on click, so the keyboard never needs the drag. The click browsers
 * synthesise after a drag is swallowed, so a dropped chip is not also actioned
 * by the click that follows it.
 */
export function useChipDrag(actions: DragActions) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{
    part: string;
    source: "pool" | "chain";
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  // Deliberately not memoised: these spread onto a dozen buttons with no memo
  // boundary downstream, and a stable identity would only invite stale actions.
  const handlers = (part: string, source: "pool" | "chain") => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      swallowClick.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      press.current = { part, source, sx: e.clientX, sy: e.clientY, moved: false };
    },

    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
      p.moved = true;
      setDrag({ part: p.part, x: e.clientX, y: e.clientY, over: zoneAt(e.clientX, e.clientY) });
    },

    onPointerUp(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      press.current = null;
      setDrag(null);
      if (!p?.moved) return; // a plain press — let the click handler action it

      swallowClick.current = true;
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone === "pool") {
        if (p.source === "chain") actions.onReturnToPool(p.part);
      } else if (zone?.startsWith("slot:")) {
        actions.onDropInSlot(p.part, Number(zone.slice(5)));
      }
    },

    onPointerCancel() {
      press.current = null;
      setDrag(null);
    },

    onClick() {
      if (swallowClick.current) {
        swallowClick.current = false;
        return;
      }
      actions.onActivate(part, source);
    },
  });

  return { drag, handlers };
}
