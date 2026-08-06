import { REPORT_ADDRESS } from "../config";

interface Props {
  pair: [string, string] | null;
  day: string;
}

/**
 * False rejections are the game's top quality metric — a player told that
 * "grundkurs" is not a word spends trust the game cannot refund. The button
 * only appears once the game has actually refused something, and it carries
 * the exact pair so a report is one tap rather than a bug write-up.
 *
 * Reports go to a mailbox for now. Point `VITE_REPORT_URL` at a collector to
 * turn this into the tracked KPI it needs to be.
 */
export function ReportWord({ pair, day }: Props) {
  if (!pair) return null;
  const [a, b] = pair;

  const subject = `Kedjan: ${a}+${b} borde vara ett ord`;
  const body = `Dagen ${day} nekade ${a}+${b}.\n\nOrdet jag tänkte på: \n`;
  const href = REPORT_ADDRESS.startsWith("http")
    ? `${REPORT_ADDRESS}?day=${encodeURIComponent(day)}&pair=${encodeURIComponent(`${a}+${b}`)}`
    : `mailto:${REPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <p className="text-center text-xs">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="underline"
        style={{ color: "var(--ink-soft)" }}
      >
        Är {a}+{b} ett riktigt ord? Rapportera det.
      </a>
    </p>
  );
}
