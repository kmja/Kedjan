import { useEffect, useState } from "react";
import type { Day } from "../types";
import { allSolutions, spellChain, weld } from "../game/graph";

interface Props {
  day: Day;
  onClearAll: () => void;
}

/**
 * Playtesting tools, off unless asked for with `?dev`.
 *
 * Replaying a day is no longer among them — that is on the result card for
 * everyone. What is left is what a player should never see: every weld at
 * once. `morfin` sat in a shipped pool through several rounds of review
 * precisely because probing a pool one tap at a time never shows you the
 * whole table.
 */
export function DevPanel({ day, onClearAll }: Props) {
  const [showWelds, setShowWelds] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  /**
   * SALDO's sense for each compound, fetched only in test mode. It is the
   * evidence behind a judgement: the descriptor pair is usually a compound's
   * own analysis, so a gloss with nothing to do with the claimed parts is the
   * tell — morfin reads "narkotika", not anything about mor or fin.
   */
  const [glosses, setGlosses] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showWelds) return;
    const ctrl = new AbortController();
    fetch(`${import.meta.env.BASE_URL}glosses.json`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setGlosses)
      .catch(() => setGlosses({}));
    return () => ctrl.abort();
  }, [showWelds]);

  const welds = Object.entries(day.pairs)
    .map(([key, word]) => {
      const [a, b] = key.split(">") as [string, string];
      return { a, b, word };
    })
    .sort((x, y) => x.word.localeCompare(y.word, "sv"));

  const routes = allSolutions(day);

  return (
    <section
      className="card flex flex-col gap-3 text-sm"
      style={{ borderStyle: "dashed" }}
      aria-label="Testverktyg"
    >
      <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>
        TESTLÄGE · {day.date} · par {day.par}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => setShowWelds((v) => !v)}
          aria-expanded={showWelds}
        >
          {welds.length} ord {showWelds ? "▲" : "▼"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => setShowRoutes((v) => !v)}
          aria-expanded={showRoutes}
        >
          {routes.length} lösningar {showRoutes ? "▲" : "▼"}
        </button>
        <button type="button" className="btn" onClick={onClearAll}>
          Nollställ allt
        </button>
      </div>

      {showWelds && (
        <ul className="flex flex-col gap-0.5 font-mono text-xs">
          {welds.map(({ a, b, word }) => {
            // A weld the player can actually reach is worth more scrutiny than
            // one stranded behind an unreachable part.
            const reachable = a === day.start || day.pool.includes(a);
            const gloss = glosses[word];
            return (
              <li key={`${a}>${b}`} style={{ opacity: reachable ? 1 : 0.45 }}>
                <span style={{ color: "var(--ink-soft)" }}>
                  {a}+{b}
                </span>{" "}
                = <strong>{word}</strong>
                {gloss ? (
                  <span style={{ color: "var(--ink-soft)" }}> · {gloss}</span>
                ) : (
                  <span style={{ color: "var(--falu-ink)" }}> · ingen källa</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showRoutes && (
        <ol className="flex flex-col gap-1 text-xs">
          {routes.map((route) => (
            <li key={route.join(">")}>
              <span style={{ color: "var(--ink-soft)" }}>
                {route.length + 1} länkar ·{" "}
              </span>
              {spellChain(day, route).join(" → ")}
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Lägg till <code>?dev=0</code> i adressen för att stänga av testläget.
        {weld(day, day.start, day.target) && " ⚠ start och mål bildar ett ord!"}
      </p>
    </section>
  );
}
