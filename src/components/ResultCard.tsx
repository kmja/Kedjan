import { useState } from "react";
import type { Day, DayProgress } from "../types";
import { shareResult, shareText } from "../game/share";
import { chainOf } from "../game/storage";
import { RouteTree } from "./RouteTree";

interface Props {
  day: Day;
  progress: DayProgress;
  otherSolutions: string[][];
  /** Put this day back on the table. The result above it stays counted. */
  onReplay: () => void;
}

export function ResultCard({
  day,
  progress,
  otherSolutions,
  onReplay,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const chain = chainOf(progress);

  const onShare = async () => {
    const outcome = await shareResult(shareText(day, progress, window.location.origin));
    setCopied(
      outcome === "copied"
        ? "Kopierat ✓"
        : outcome === "shared"
          ? "Delat ✓"
          : "Kunde inte kopiera",
    );
    setTimeout(() => setCopied(null), 2200);
  };

  return (
    <div className="snap flex flex-col gap-4">
      {otherSolutions.length > 0 && (
        <div className="card">
          <button
            type="button"
            className="btn w-full"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.35rem",
              fontWeight: 800,
              padding: "0.85rem 1rem",
            }}
            onClick={() => setShowRoutes((v) => !v)}
            aria-expanded={showRoutes}
          >
            {otherSolutions.length === 1
              ? "1 annan väg fanns"
              : `${otherSolutions.length} andra vägar fanns`}
            <span aria-hidden="true">{showRoutes ? "▲" : "▼"}</span>
          </button>
          {showRoutes && (
            <div className="mt-3">
              <RouteTree day={day} mine={chain} others={otherSolutions} />
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={onShare} className="btn--major btn">
        {copied ?? "Dela resultat"}
      </button>

      {/* Second, and quieter: the result is the point of the card, and a day
          worth replaying is worth replaying after reading it. */}
      <button type="button" onClick={onReplay} className="btn">
        Spela om dagen
      </button>
    </div>
  );
}
