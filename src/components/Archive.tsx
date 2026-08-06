import type { Day } from "../types";
import { formatShortDate, formatSwedishDate } from "../game/dates";

interface Props {
  days: Day[];
  selected: string;
  solvedDates: ReadonlySet<string>;
  onSelect: (date: string) => void;
}

export function Archive({ days, selected, solvedDates, onSelect }: Props) {
  const newestFirst = [...days].reverse();

  return (
    <section className="flex flex-col gap-3" aria-label="Arkiv">
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        Alla dagar som har släppts. Gamla dagar räknas i statistiken men rubbar inte
        din svit.
      </p>
      <ul className="flex flex-col gap-1.5">
        {newestFirst.map((d) => {
          const done = solvedDates.has(d.date);
          const isSelected = d.date === selected;
          return (
            <li key={d.date}>
              <button
                type="button"
                onClick={() => onSelect(d.date)}
                aria-current={isSelected ? "true" : undefined}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left"
                style={{
                  background: isSelected ? "var(--falu)" : "var(--panel)",
                  color: isSelected ? "var(--on-falu)" : "var(--ink)",
                  border: `1px solid ${isSelected ? "var(--falu-deep)" : "var(--edge)"}`,
                }}
              >
                <span className="w-10 shrink-0 text-xs font-bold tabular-nums opacity-80">
                  {formatShortDate(d.date)}
                </span>
                <span className="flex-1 text-sm font-bold uppercase">
                  {d.start} → {d.target}
                </span>
                <span className="shrink-0 text-xs font-semibold opacity-80">
                  par {d.par}
                </span>
                <span className="w-5 shrink-0 text-center text-sm">
                  <span aria-hidden="true">{done ? "✓" : "·"}</span>
                  <span className="sr-only">
                    {formatSwedishDate(d.date)}, {done ? "klarad" : "ospelad"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
