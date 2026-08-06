import { useEffect, useMemo, useState } from "react";
import type { Day } from "./types";
import { dayForDate, fetchCalendar, releasedDays } from "./game/days";
import { formatSwedishDate, todayISO } from "./game/dates";
import { plural } from "./game/plural";
import { useKedjan } from "./game/useKedjan";
import { useChipDrag } from "./game/useChipDrag";
import { Chain } from "./components/Chain";
import { Pool } from "./components/Pool";
import { Controls } from "./components/Controls";
import { ResultCard } from "./components/ResultCard";
import { HowToPlay } from "./components/HowToPlay";
import { StatsPanel } from "./components/StatsPanel";
import { Archive } from "./components/Archive";
import { ReportWord } from "./components/ReportWord";

type View = "spel" | "arkiv" | "statistik";

const VIEWS: [View, string][] = [
  ["spel", "Dagens"],
  ["arkiv", "Arkiv"],
  ["statistik", "Statistik"],
];

export default function App() {
  const today = useMemo(todayISO, []);
  const [calendar, setCalendar] = useState<Day[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("spel");
  const [pickedDate, setPickedDate] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchCalendar(ctrl.signal)
      .then(setCalendar)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(err instanceof Error ? err.message : "Något gick fel.");
      });
    return () => ctrl.abort();
  }, []);

  const released = useMemo(
    () => (calendar ? releasedDays(calendar, today) : []),
    [calendar, today],
  );
  const day = useMemo(() => {
    if (!calendar) return null;
    return (
      (pickedDate ? released.find((d) => d.date === pickedDate) : null) ??
      dayForDate(calendar, today)
    );
  }, [calendar, released, pickedDate, today]);

  const game = useKedjan(day);
  // Chips travel both ways and land in a specific slot. Nothing is validated
  // on the way down — the chain is judged only when it is closed.
  const { drag, handlers } = useChipDrag({
    onDropInSlot: game.placeAt,
    onReturnToPool: game.removeFrom,
    onActivate: (part, source) =>
      source === "pool" ? game.placeAt(part) : game.removeFrom(part),
  });

  const openDay = (date: string) => {
    setPickedDate(date);
    setView("spel");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-8 pb-16">
      <header className="mb-4">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "2.4rem",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: "var(--falu-ink)",
          }}
        >
          Kedjan
        </h1>
        <p className="mt-1 text-sm font-medium" style={{ color: "var(--ink-soft)" }}>
          Bygg bron — varje par bildar ett ord.
        </p>
      </header>

      <nav className="mb-5 flex gap-1" role="tablist" aria-label="Vyer">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={view === id}
            aria-controls={`panel-${id}`}
            className="tab"
            onClick={() => setView(id)}
          >
            {label}
            {id === "statistik" && game.streak > 0 && (
              <span aria-label={`${plural(game.streak, "dag", "dagar")} i rad`}> 🔥{game.streak}</span>
            )}
          </button>
        ))}
      </nav>

      {loadError && (
        <div className="card" role="alert">
          <p className="text-sm font-semibold">{loadError}</p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
            Ladda om sidan för att försöka igen.
          </p>
        </div>
      )}

      {!calendar && !loadError && (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }} role="status">
          Hämtar dagens kedja…
        </p>
      )}

      {calendar && !day && (
        <div className="card" role="alert">
          <p className="text-sm font-semibold">Ingen dag är släppt ännu.</p>
        </div>
      )}

      {day && (
        <main className="flex flex-col gap-5">
          <section
            role="tabpanel"
            id="panel-spel"
            aria-labelledby="tab-spel"
            hidden={view !== "spel"}
            className="flex flex-col gap-5"
          >
            <p className="text-center text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
              #{day.no} · {formatSwedishDate(day.date)}
              {day.date !== today && " · arkiv"}
            </p>

            <Chain
              day={day}
              slots={game.slots}
              solved={game.solved}
              marked={game.marked}
              armedSlot={game.armedSlot}
              failedJoints={game.failedJoints}
              dragOver={drag?.over ?? null}
              liftedPart={drag?.part ?? null}
              handlers={handlers}
              onSlot={game.toggleSlot}
              onSubmit={game.submit}
            />

            {!game.solved && (
              <>
                <p className="-mt-3 text-center text-xs" style={{ color: "var(--ink-soft)" }}>
                  Lägg delarna i vilken ordning du vill. Tryck på{" "}
                  {day.target.toUpperCase()} när du är klar — då kontrolleras hela
                  kedjan.
                </p>

                <Pool
                  parts={game.pool}
                  marked={game.marked}
                  liftedPart={drag?.part ?? null}
                  incoming={drag?.over === "pool"}
                  armedSlot={game.armedSlot}
                  handlers={handlers}
                />

                <Controls
                  day={day}
                  status={game.status}
                  announceKey={game.announceKey}
                  placed={game.chain.length}
                  hints={game.hints}
                  onHint={game.hint}
                  onReset={game.reset}
                />

                <ReportWord pair={game.lastMiss} day={day.date} />
              </>
            )}

            {game.solved && (
              <ResultCard
                day={day}
                progress={game.progress}
                otherSolutions={game.otherSolutions}
                streak={game.streak}
              />
            )}

            <HowToPlay />
          </section>

          <section
            role="tabpanel"
            id="panel-arkiv"
            aria-labelledby="tab-arkiv"
            hidden={view !== "arkiv"}
          >
            <Archive
              days={released}
              selected={day.date}
              solvedDates={game.solvedDates}
              onSelect={openDay}
            />
          </section>

          <section
            role="tabpanel"
            id="panel-statistik"
            aria-labelledby="tab-statistik"
            hidden={view !== "statistik"}
          >
            <StatsPanel stats={game.stats} streak={game.streak} />
          </section>
        </main>
      )}

      {drag && (
        <span
          className="chip chip--ghost"
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
        >
          {drag.part}
        </span>
      )}

      {/* Attribution tracks the corpus actually in use. When the graph moves to
          SALDO, the CC-BY credit for Språkbanken belongs here. */}
      <footer
        className="mt-auto pt-10 text-center text-[0.7rem]"
        style={{ color: "var(--ink-soft)" }}
      >
        Ordmaterial från SFOL — Den stora fria ordlistan (LGPL-3.0).
      </footer>
    </div>
  );
}
