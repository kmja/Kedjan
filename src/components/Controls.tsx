import type { Day } from "../types";
import type { Status } from "../game/useKedjan";

interface Props {
  day: Day;
  status: Status | null;
  announceKey: number;
  placed: number;
  hints: number;
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
          <span aria-label={`${placed} av ${day.budget - 1} platser fyllda`}>
            {placed}/{day.budget - 1} placerade
          </span>
          <span aria-hidden="true"> · </span>
          <span>par {day.par}</span>
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onHint}
            className="btn btn--accent"
            aria-label={
              hints % 2 === 0
                ? "Ledtråd: hur långt kvar till målet"
                : "Ledtråd: markera rätt väg vidare"
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
