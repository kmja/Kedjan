import { useState } from "react";
import type { Day } from "../types";
import { allSolutions } from "../game/graph";
import { plural } from "../game/plural";
import { RouteTree } from "./RouteTree";

interface Props {
  day: Day;
  /** Put the day back on the table with fresh lives. */
  onReplay: () => void;
}

/**
 * The day is lost: three placements broke welds, and without a ceiling the
 * pool could simply be enumerated. The routes that existed are on offer —
 * the answer is the consolation prize — behind a click, so a player who
 * wants another honest run can take one without being spoiled first.
 */
export function FailCard({ day, onReplay }: Props) {
  const [showRoutes, setShowRoutes] = useState(false);
  const routes = allSolutions(day);

  return (
    <div className="snap flex flex-col gap-4">
      <div className="card text-center">
        <p className="text-lg font-extrabold" style={{ color: "var(--falu-ink)" }}>
          Kedjan brast
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
          Tre delar som inte håller — dagens kedja är över.
        </p>
      </div>

      <div className="card">
        <button
          type="button"
          className="btn w-full"
          onClick={() => setShowRoutes((v) => !v)}
          aria-expanded={showRoutes}
        >
          Visa {plural(routes.length, "vägen som fanns", "vägarna som fanns")}
          <span aria-hidden="true">{showRoutes ? "▲" : "▼"}</span>
        </button>
        {showRoutes && (
          <div className="mt-3">
            <RouteTree day={day} mine={null} others={routes} />
          </div>
        )}
      </div>

      <button type="button" onClick={onReplay} className="btn">
        Försök igen
      </button>
    </div>
  );
}
