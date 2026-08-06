import { useRef, useState, type PointerEvent, type RefObject } from "react";

/** Where a chip is being dragged *to*. A pool chip aims for the chain; a chip
 *  already in the chain aims back at the pool. */
export type DropTarget = "chain" | "pool";

export interface Zone {
  ref: RefObject<HTMLElement | null>;
  /** Run when a chip lands here — by drop, tap, click or keyboard. */
  accept: (part: string) => void;
}

export interface DragState {
  part: string;
  target: DropTarget;
  x: number;
  y: number;
}

/** Movement past this many pixels turns a press into a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
/** Generous slop around a zone so a drop near it still lands. */
const DROP_SLOP = { x: 12, y: 28 };

function within(rect: DOMRect | undefined, x: number, y: number): boolean {
  if (!rect) return false;
  return (
    x >= rect.left - DROP_SLOP.x &&
    x <= rect.right + DROP_SLOP.x &&
    y >= rect.top - DROP_SLOP.y &&
    y <= rect.bottom + DROP_SLOP.y
  );
}

/**
 * Pointer drag over chips that are ordinary buttons, in both directions:
 * pool → chain to place a part, chain → pool to take it back.
 *
 * Landing has two routes. A drag resolves on pointerup against the target
 * zone; everything else — mouse click, tap, Enter, Space, a screen reader's
 * activation — resolves on click, so the keyboard never needs the drag at all.
 * The click browsers synthesise after a drag is swallowed, so a chip dropped
 * outside its zone is not also actioned by the click that follows.
 */
export function useChipDrag(zones: Record<DropTarget, Zone>) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{
    part: string;
    target: DropTarget;
    sx: number;
    sy: number;
    moved: boolean;
  } | null>(null);
  const swallowClick = useRef(false);

  // Deliberately not memoised: these spread onto a dozen buttons with no memo
  // boundary downstream, and a stable identity would only invite a stale zone.
  const handlers = (part: string, target: DropTarget) => ({
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      swallowClick.current = false;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      press.current = { part, target, sx: e.clientX, sy: e.clientY, moved: false };
    },

    onPointerMove(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
      p.moved = true;
      setDrag({ part: p.part, target: p.target, x: e.clientX, y: e.clientY });
    },

    onPointerUp(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      press.current = null;
      setDrag(null);
      if (!p?.moved) return; // a plain press — let the click handler action it

      swallowClick.current = true;
      const zone = zones[p.target];
      if (within(zone.ref.current?.getBoundingClientRect(), e.clientX, e.clientY)) {
        zone.accept(p.part);
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
      zones[target].accept(part);
    },
  });

  return { drag, handlers };
}
