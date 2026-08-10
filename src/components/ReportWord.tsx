import { useState } from "react";
import { REPORT_URL } from "../config";

interface Props {
  pair: [string, string] | null;
  day: string;
}

/** Pairs this player has already reported — a report is one vote, not many. */
const SENT_KEY = "kedjan.reported.v1";

const sentBefore = (): string[] => {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/**
 * False rejections are the game's top quality metric — a player told that
 * "grundkurs" is not a word spends trust the game cannot refund. The button
 * only appears once the game has actually refused something, and it carries
 * the exact pair, so reporting is one tap: it increments a counter behind
 * `/api/report`, and a pair that gathers enough votes is flagged there for
 * curation to review.
 *
 * The thank-you is not held hostage by the network: the tap counts locally
 * at once, and the request goes out on its own.
 */
export function ReportWord({ pair, day }: Props) {
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set(sentBefore()));
  if (!pair) return null;

  const [a, b] = pair;
  const key = `${a}+${b}`;
  const done = sent.has(key);

  const report = () => {
    if (done) return;
    const next = new Set(sent).add(key);
    setSent(next);
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify([...next]));
    } catch {
      /* a full or absent storage only costs the cross-visit memory */
    }
    fetch(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair: key, day }),
    }).catch(() => {});
  };

  return (
    <p className="text-center text-xs">
      <button type="button" className="report-btn" onClick={report} disabled={done}>
        {done
          ? `Tack! ${a}+${b} är rapporterat.`
          : `Är ${a}+${b} ett riktigt ord? Rapportera det.`}
      </button>
    </p>
  );
}
