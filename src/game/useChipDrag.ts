import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";

export interface DragState {
  part: string;
  x: number;
  y: number;
}

/** Movement past this many pixels turns a press into a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
/** Generous slop around the chain so a drop near it still lands. */
const DROP_SLOP = { x: 12, y: 28 };

/**
 * Pointer-based drag over chips that are ordinary buttons.
 *
 * Placement has two routes. A drag resolves on pointerup against the drop
 * zone; everything else — mouse click, tap, Enter, Space, a screen reader's
 * activation — resolves on click. The click that browsers synthesise after a
 * drag is swallowed so a chip dropped outside the chain is not also placed by
 * the click that follows.
 */
export function useChipDrag(
  zone: RefObject<HTMLElement | null>,
  onDrop: (part: string) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<{ part: string; sx: number; sy: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const handlers = useCallback(
    (part: string) => ({
      onPointerDown(e: PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        swallowClick.current = false;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press.current = { part, sx: e.clientX, sy: e.clientY, moved: false };
      },

      onPointerMove(e: PointerEvent<HTMLElement>) {
        const p = press.current;
        if (!p) return;
        if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < DRAG_THRESHOLD) return;
        p.moved = true;
        setDrag({ part: p.part, x: e.clientX, y: e.clientY });
      },

      onPointerUp(e: PointerEvent<HTMLElement>) {
        const p = press.current;
        press.current = null;
        setDrag(null);
        if (!p?.moved) return; // a plain press — let the click handler place it

        swallowClick.current = true;
        const r = zone.current?.getBoundingClientRect();
        if (
          r &&
          e.clientX >= r.left - DROP_SLOP.x &&
          e.clientX <= r.right + DROP_SLOP.x &&
          e.clientY >= r.top - DROP_SLOP.y &&
          e.clientY <= r.bottom + DROP_SLOP.y
        ) {
          onDrop(p.part);
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
        onDrop(part);
      },
    }),
    [zone, onDrop],
  );

  return { drag, handlers };
}
