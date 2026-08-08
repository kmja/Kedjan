import { useState } from "react";
import type { Day } from "../types";
import { dayKey, tierOf } from "../game/days";
import { formatShortDate, formatSwedishDate } from "../game/dates";
import { plural } from "../game/plural";

interface Props {
  days: Day[];
  /** The progress key — date#tier — of the chain on the board. */
  selected: string;
  solvedKeys: ReadonlySet<string>;
  onSelect: (day: Day) => void;
  /** Put every finished chain back on the table, keeping the stats. */
  onReplayAll: () => void;
}

export function Archive({ days, selected, solvedKeys, onSelect, onReplayAll }: Props) {
  const newestFirst = [...days].reverse();
  const finished = days.filter((d) => solvedKeys.has(dayKey(d))).length;
  // Undoing a day's worth of play deserves a beat of thought, but a browser
  // confirm() is a modal a keyboard user cannot style or escape gracefully.
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="flex flex-col gap-3" aria-label="Arkiv">
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        Alla dagar som har släppts. Gamla dagar räknas i statistiken men rubbar inte
        din svit.
      </p>
      <ul className="flex flex-col gap-1.5">
        {newestFirst.map((d) => {
          const done = solvedKeys.has(dayKey(d));
          const isSelected = dayKey(d) === selected;
          return (
            <li key={dayKey(d)}>
              <button
                type="button"
                onClick={() => onSelect(d)}
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
                <span className="tier-tag shrink-0">
                  {tierOf(d) === "hard" ? "SVÅR" : "LÄTT"}
                </span>
                <span className="shrink-0 text-xs font-semibold opacity-80">
                  par {d.par}
                </span>
                <span className="w-5 shrink-0 text-center text-sm">
                  <span aria-hidden="true">{done ? "✓" : "·"}</span>
                  <span className="sr-only">
                    {formatSwedishDate(d.date)},{" "}
                    {tierOf(d) === "hard" ? "svår" : "lätt"},{" "}
                    {done ? "klarad" : "ospelad"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {finished > 0 &&
        (confirming ? (
          <div className="card flex flex-col gap-2">
            <p className="text-sm font-semibold">
              Öppna {plural(finished, "klarad dag", "klarade dagar")} igen?
            </p>
            <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
              Kedjorna rensas så att du kan spela dem på nytt. Statistiken och
              din svit står kvar — en dag du redan klarat räknas inte om.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn--major btn flex-1"
                onClick={() => {
                  onReplayAll();
                  setConfirming(false);
                }}
              >
                Öppna igen
              </button>
              <button type="button" className="btn flex-1" onClick={() => setConfirming(false)}>
                Avbryt
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirming(true)}>
            Spela om alla klarade dagar
          </button>
        ))}
    </section>
  );
}
