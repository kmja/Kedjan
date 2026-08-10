import { useLayoutEffect, useRef } from "react";

/** How long a chip takes to travel to where it now lives. */
const TRAVEL_MS = 260;

/**
 * Where an element sits in the page's layout, ignoring any transform on it
 * or on its ancestors.
 *
 * `getBoundingClientRect` would be simpler and wrong here: the chain settles
 * its rows with a transform that is already applied when this runs, so a
 * chip measured that way reports where it is being animated from rather than
 * where it has landed, and the two animations then fight over it.
 */
function layoutBox(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * Chips travel to their new place instead of teleporting there.
 *
 * A click moves a chip between the pool and the chain, and the two are far
 * apart on screen: without this, a chip vanishes from under the finger and
 * reappears somewhere else, which is a move nobody can follow. So every
 * chip's position is remembered, and one that has moved since the last
 * render is animated from where it was — the classic invert-and-play, keyed
 * by the part itself, so it survives the chip being a different element in a
 * different parent.
 *
 * Moves *within* the chain are left alone: the chain settles its own rows,
 * and animating both would double the distance travelled.
 */
export function useChipFlip() {
  const before = useRef(new Map<string, { x: number; y: number; zone: string }>());

  useLayoutEffect(() => {
    const now = new Map<string, { x: number; y: number; zone: string }>();
    const chips = document.querySelectorAll<HTMLElement>("[data-chip]");
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    for (const el of chips) {
      const part = el.dataset.chip!;
      const zone = el.dataset.chipZone ?? "";
      const { x, y } = layoutBox(el);
      now.set(part, { x, y, zone });

      const was = before.current.get(part);
      // Nothing to travel from, or the chain is already moving it.
      if (!was || (was.zone === "chain" && zone === "chain")) continue;
      if (still || typeof el.animate !== "function") continue;

      const dx = was.x - x;
      const dy = was.y - y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      el.animate(
        [
          { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` },
          { transform: "none" },
        ],
        { duration: TRAVEL_MS, easing: "cubic-bezier(0.22, 0.8, 0.3, 1)" },
      );
    }

    before.current = now;
  });
}
