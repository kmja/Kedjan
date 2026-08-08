import { useEffect, useRef } from "react";
import { plural } from "../game/plural";

/**
 * The three lives, big and by the chain. A lost heart is crossed out with
 * the same pop the chain uses for a broken weld, so the two events read as
 * one grammar: the cross is what a mistake looks like, wherever it lands.
 */
export function Lives({ left }: { left: number }) {
  // The heart that was just lost animates; hearts that were already lost
  // when the board rendered (a reload) sit still.
  const prev = useRef(left);
  const fresh = prev.current > left ? left : null;
  useEffect(() => {
    prev.current = left;
  });

  return (
    <div className="lives-row" role="img" aria-label={`${plural(left, "liv", "liv")} kvar`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`life-big ${i < left ? "" : "life-big--lost"}`}>
          <span aria-hidden="true">♥</span>
          {i >= left && (
            <span
              className={`life-cross ${i === fresh ? "life-cross--pop" : ""}`}
              aria-hidden="true"
            >
              ✗
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
