import type { Status } from "../game/useKedjan";

interface Props {
  status: Status | null;
  /** Bumped on every verdict, so a repeated message is announced again. */
  announceKey: number;
}

const statusColor = (kind: Status["kind"]) =>
  kind === "no" ? "var(--falu-ink)" : kind === "ok" ? "var(--honey-ink)" : "var(--ink-soft)";

/** Text glyphs carry the verdict too, so colour is never the only signal. */
const statusMark = (kind: Status["kind"]) => (kind === "no" ? "✗" : kind === "ok" ? "✓" : "·");

/**
 * What the board has just said, for eyes and for a screen reader at once.
 *
 * This was the top line of a Controls row that also held the link count and
 * the hint and clear buttons; those are parked for now, and this is what
 * the dock keeps — the game is played from the chain and the rack, and the
 * announcement is the only part of that row a player needed while playing.
 */
export function Announcer({ status, announceKey }: Props) {
  return (
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
  );
}
