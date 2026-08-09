import { useEffect, useRef, useState } from "react";
import { plural } from "../game/plural";

/** How long the breaking heart holds the stage before it is gone. */
const BREAK_MS = 900;

/**
 * The lives, big and by the chain. Losing one is an event, not a bookkeeping
 * update: the lost heart steps forward — up and larger — breaks into halves,
 * and fades out, leaving only the hearts that remain. Hearts already gone
 * when the board rendered (a reload) simply are not there.
 */
export function Lives({ left }: { left: number }) {
  const prev = useRef(left);
  const [breaking, setBreaking] = useState(false);
  useEffect(() => {
    if (left < prev.current) {
      setBreaking(true);
      const t = setTimeout(() => setBreaking(false), BREAK_MS);
      prev.current = left;
      return () => clearTimeout(t);
    }
    prev.current = left;
  }, [left]);

  return (
    <div className="lives-row" role="img" aria-label={`${plural(left, "liv", "liv")} kvar`}>
      {Array.from({ length: left }, (_, i) => (
        <span key={i} className="life-big" aria-hidden="true">
          ♥
        </span>
      ))}
      {breaking && (
        <span className="life-big life-break" aria-hidden="true">
          {/* An invisible heart holds the space; the halves break over it. */}
          <span className="life-ghost">♥</span>
          <span className="life-shard life-shard--left">♥</span>
          <span className="life-shard life-shard--right">♥</span>
        </span>
      )}
    </div>
  );
}
