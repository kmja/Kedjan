import type { Day } from "../types";
import type { Status } from "../game/useKedjan";
import { plural } from "../game/plural";

interface Props {
  day: Day;
  status: Status | null;
  announceKey: number;
  placed: number;
  hints: number;
  parRevealed: boolean;
  onHint: () => void;
  onReset: () => void;
}

const statusColor = (kind: Status["kind"]) =>
  kind === "no" ? "var(--falu-ink)" : kind === "ok" ? "var(--honey-ink)" : "var(--ink-soft)";

/** Text glyphs carry the verdict too, so colour is never the only signal. */
const statusMark = (kind: Status["kind"]) => (kind === "no" ? "✗" : kind === "ok" ? "✓" : "·");

export function Controls({
  day,
  status,
  announceKey,
  placed,
  hints,
  parRevealed,
  onHint,
  onReset,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <p
        className="min-h-6 text-sm font-medium"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status && (
          <span key={announceKey} style={{ color: statusColor(status.kind) }}>
            <span aria-hidden="true">{statusMark(status.kind)} </span>
            {status.msg}
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
          <span aria-label={`${plural(placed + 1, "länk", "länkar")} i kedjan`}>
            {plural(placed + 1, "länk", "länkar")}
          </span>
          {/* Par is the shape of the answer, so it stays hidden until a hint
              is spent on it. */}
          {parRevealed && (
            <>
              <span aria-hidden="true"> · </span>
              <span aria-label={`par ${day.par}`}>{`par ${day.par}`}</span>
            </>
          )}

        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHint}
            className="btn btn--accent"
            aria-label={
              ["Ledtråd: hur många länkar som rekommenderas",
               "Ledtråd: tona ned delar som inte leder till målet",
               "Ledtråd: markera rätt väg vidare"][hints % 3]
            }
          >
            Ledtråd{hints > 0 ? ` (${hints})` : ""}
          </button>
          <button type="button" onClick={onReset} className="btn" disabled={placed === 0}>
            Rensa
          </button>
        </div>
      </div>
    </div>
  );
}
