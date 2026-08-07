import { useRef, useState, type PointerEvent } from "react";

export interface DragState {
  part: string;
  x: number;
  y: number;
  /** Where this chip came from, so the board can offer the right targets. */
  source: "pool" | "chain";
  /** The zone the chip would land in, so the board can show which. */
  over: string | null;
}

/** Movement past this many pixels turns a press into a drag rather than a tap. */
const DRAG_THRESHOLD = 8;
/**
 * How far outside every zone a drop may still land. Without this a chip
 * released over a *part* — the most natural place to aim — hits nothing and
 * silently goes home. Snapping to the nearest gap is what a player means.
 */
const SNAP_RADIUS = 140;

/** Distance from a point to a rectangle: zero anywhere inside it. */
function edgeDistance(r: DOMRect, x: number, y: number): number {
  const dx = Math.max(r.left - x, 0, x - r.right);
  const dy = Math.max(r.top - y, 0, y - r.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Drop zones declare themselves in the DOM with `data-drop-zone="<id>"`, so a
 * board with a variable number of joints needs no ref plumbing. Ids are
 * `at:<n>` for the joint before position n, and `pool`.
 *
 * Resolution is by distance to the zone's *edge*, not its centre. Centre
 * distance is not monotonic down the chain: a taller joint has a further
 * centre, so a chip released on a part could land in the joint above it while
 * the same gesture one part further down landed in the joint below. Edge
 * distance splits each gap at its midpoint, which gives the one rule a player
 * can actually hold: a chip goes into the gap it is nearest to.
 */
function zoneAt(x: number, y: number): string | null {
  let nearest: { id: string; distance: number } | null = null;

  for (const el of document.querySelectorAll<HTMLElement>("[data-drop-zone]")) {
    const distance = edgeDistance(el.getBoundingClientRect(), x, y);
    if (!nearest || distance < nearest.distance) {
      nearest = { id: el.dataset.dropZone!, distance };
    }
  }

  return nearest && nearest.distance <= SNAP_RADIUS ? nearest.id : null;
}

/**
 * Zone ids. Shared constants rather than string literals, because they were
 * once renamed in the markup and not here, and drag-to-joint silently stopped
 * working — clicks kept passing, so nothing failed.
 */
export const POOL_ZONE = "pool";
export const JOINT_ZONE = "at:";

export interface DragActions {
  /** A chip landed on the joint at `index`. */
  onDropInJoint: (part: string, index: number) => void;
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
      setDrag({
        part: p.part,
        source: p.source,
        x: e.clientX,
        y: e.clientY,
        over: zoneAt(e.clientX, e.clientY),
      });
    },

    onPointerUp(e: PointerEvent<HTMLElement>) {
      const p = press.current;
      press.current = null;
      setDrag(null);
      if (!p?.moved) return; // a plain press — let the click handler action it

      swallowClick.current = true;
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone === POOL_ZONE) {
        if (p.source === "chain") actions.onReturnToPool(p.part);
      } else if (zone?.startsWith(JOINT_ZONE)) {
        actions.onDropInJoint(p.part, Number(zone.slice(JOINT_ZONE.length)));
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
