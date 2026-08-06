import { useState } from "react";
import type { Day, DayProgress } from "../types";
import { spellChain } from "../game/graph";
import { shareResult, shareText } from "../game/share";
import { plural } from "../game/plural";

interface Props {
  day: Day;
  progress: DayProgress;
  otherSolutions: string[][];
  streak: number;
}

const parVerdict = (links: number, par: number) =>
  links < par ? "Under par — briljant!" : links === par ? "På par!" : "Inom budget!";

export function ResultCard({ day, progress, otherSolutions, streak }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [showRoutes, setShowRoutes] = useState(false);
  const links = progress.chain.length + 1;

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
      <div className="card text-center">
        <p
          className="font-[family-name:var(--font-display)] text-lg leading-snug font-extrabold"
          style={{ fontWeight: 800 }}
        >
          {spellChain(day, progress.chain).join(" → ")}
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--honey-ink)" }}>
          {plural(links, "ord", "ord")} — {parVerdict(links, day.par)}
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
          {progress.hints > 0 && `${plural(progress.hints, "ledtråd", "ledtrådar")} · `}
          {progress.misses > 0 && `${plural(progress.misses, "felförsök", "felförsök")} · `}
          {streak > 0 && `${plural(streak, "dag", "dagar")} i rad`}
        </p>
      </div>

      {otherSolutions.length > 0 && (
        <div className="card">
          <button
            type="button"
            className="btn w-full"
            onClick={() => setShowRoutes((v) => !v)}
            aria-expanded={showRoutes}
          >
            {otherSolutions.length === 1
              ? "1 annan väg fanns"
              : `${otherSolutions.length} andra vägar fanns`}
            <span aria-hidden="true">{showRoutes ? "▲" : "▼"}</span>
          </button>
          {showRoutes && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {otherSolutions.map((route) => (
                <li key={route.join(">")} className="flex flex-wrap items-baseline gap-1">
                  <span className="font-semibold">
                    {[day.start, ...route, day.target].join(" + ")}
                  </span>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    ({route.length + 1} länkar)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="button" onClick={onShare} className="btn--major btn">
        {copied ?? "Dela resultat"}
      </button>
    </div>
  );
}
