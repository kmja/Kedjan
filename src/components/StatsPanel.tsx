import type { Stats } from "../types";

interface Props {
  stats: Stats;
  streak: number;
}

function Figure({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className="text-2xl font-extrabold"
        style={{ fontFamily: "var(--font-display)", fontWeight: 800 }}
      >
        {value}
      </span>
      <span className="text-center text-[0.7rem]" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
    </div>
  );
}

export function StatsPanel({ stats, streak }: Props) {
  const counts = Object.entries(stats.linkHistogram)
    .map(([links, n]) => [Number(links), n] as const)
    .sort((a, b) => a[0] - b[0]);
  const peak = Math.max(1, ...counts.map(([, n]) => n));

  return (
    <section className="flex flex-col gap-5" aria-label="Statistik">
      <div className="grid grid-cols-4 gap-2">
        <Figure value={stats.played} label="spelade" />
        <Figure
          value={stats.played ? `${Math.round((stats.solved / stats.played) * 100)}%` : "—"}
          label="klarade"
        />
        <Figure value={streak} label="i rad nu" />
        <Figure value={stats.maxStreak} label="bästa svit" />
      </div>

      {counts.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-bold" style={{ color: "var(--ink-soft)" }}>
            Länkar per klarad dag
          </h3>
          <ul className="flex flex-col gap-1.5">
            {counts.map(([links, n]) => (
              <li key={links} className="flex items-center gap-2 text-xs font-semibold">
                <span className="w-4 tabular-nums">{links}</span>
                <span
                  className="flex min-w-6 justify-end rounded px-1.5 py-0.5 tabular-nums"
                  style={{
                    width: `${(n / peak) * 100}%`,
                    background: "var(--falu)",
                    color: "var(--on-falu)",
                  }}
                >
                  {n}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            {stats.underPar} {stats.underPar === 1 ? "dag" : "dagar"} under par.
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Klara en dag så börjar statistiken fyllas på.
        </p>
      )}
    </section>
  );
}
