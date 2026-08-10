import { useEffect, useMemo, useRef, useState } from "react";
import type { Day } from "./types";
import {
  dayForDate,
  dayKey,
  fetchCalendar,
  releasedDays,
  tierOf,
  type Tier,
} from "./game/days";
import { formatSwedishDate, todayISO } from "./game/dates";
import { useKedjan } from "./game/useKedjan";
import { clearSave, markWelcomed, wasWelcomed } from "./game/storage";
import { POOL_ZONE, useChipDrag } from "./game/useChipDrag";
import { useChipFlip } from "./game/useChipFlip";
import { Chain } from "./components/Chain";
import { Pool } from "./components/Pool";
import { Announcer } from "./components/Announcer";
import { ResultCard } from "./components/ResultCard";
import { HowToPlay } from "./components/HowToPlay";
import { Archive } from "./components/Archive";
import { ReportWord } from "./components/ReportWord";
import { DevPanel } from "./components/DevPanel";
import { FailCard } from "./components/FailCard";
import { Lives } from "./components/Lives";
import { OutcomeDialog } from "./components/OutcomeDialog";
import { WelcomeDialog } from "./components/WelcomeDialog";
import { isDevMode } from "./game/dev";

type View = "spel" | "arkiv";

export default function App() {
  const today = useMemo(todayISO, []);
  const dev = useMemo(isDevMode, []);
  const [calendar, setCalendar] = useState<Day[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>("spel");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>("easy");

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
      (pickedDate
        ? released.find((d) => d.date === pickedDate && tierOf(d) === tier)
        : null) ?? dayForDate(calendar, today, tier)
    );
  }, [calendar, released, pickedDate, today, tier]);

  const game = useKedjan(day);
  // A chip that is clicked rather than dragged still has to be seen to
  // travel: this animates every one that has moved since the last render.
  useChipFlip();
  // Chips travel both ways and land in a specific slot. Nothing is validated
  // on the way down — the chain is judged only when it is closed.
  const { drag, handlers } = useChipDrag({
    onDropInJoint: game.placeAt,
    onReturnToPool: game.removeFrom,
    onActivate: (part, source) =>
      source === "pool" ? game.placeAt(part) : game.removeFrom(part),
  });

  // The ending dialog opens on the transition into solved or failed — never
  // on a reload that arrives already decided, and only after the chain's own
  // verdict animation has had its beat.
  const [celebration, setCelebration] = useState<"win" | "fail" | null>(null);
  const [welcoming, setWelcoming] = useState(() => !wasWelcomed());
  const outcomeRef = useRef<{ key: string; solved: boolean; failed: boolean } | null>(null);
  useEffect(() => {
    if (!day) return;
    const prev = outcomeRef.current;
    outcomeRef.current = { key: day.date, solved: game.solved, failed: game.failed };
    if (!prev || prev.key !== day.date) return;
    const kind = !prev.solved && game.solved ? "win" : !prev.failed && game.failed ? "fail" : null;
    if (!kind) return;
    const t = setTimeout(() => setCelebration(kind), 600);
    return () => clearTimeout(t);
  }, [day, game.solved, game.failed]);

  const openDay = (picked: Day) => {
    setPickedDate(picked.date);
    setTier(tierOf(picked));
    setView("spel");
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-4">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
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
        </div>

        {/* The archive and the rules, in one cluster. The archive link is
            the way out and the way back: in the archive it says Dagens and
            returns to today, not to whichever old day was last opened. */}
        <nav className="flex flex-wrap items-center justify-end gap-2" aria-label="Vyer">
          <button
            type="button"
            className="howto-toggle"
            onClick={() => {
              if (view === "arkiv") setPickedDate(null);
              setView(view === "arkiv" ? "spel" : "arkiv");
            }}
          >
            {view === "arkiv" ? "Dagens" : "Arkiv"}
          </button>

          <HowToPlay />
        </nav>
      </header>

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
        <main className="flex flex-1 flex-col gap-5">
          <section
            id="panel-spel"
            aria-label="Dagens kedja"
            hidden={view !== "spel"}
            className="flex flex-1 flex-col gap-5"
          >
            <p className="text-center text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
              #{day.no} · {formatSwedishDate(day.date)}
              {day.date !== today && " · arkiv"}
            </p>

            {/* Every date carries two chains. The toggle never resets the
                other chain — each keeps its own saved progress. */}
            <div
              className="tier-row"
              role="group"
              aria-label="Välj kedja"
            >
              {(
                [
                  ["easy", "Lätt"],
                  ["hard", "Svår"],
                ] as [Tier, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className="tier-pill"
                  aria-pressed={tier === id}
                  onClick={() => setTier(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <Chain
              day={day}
              chain={game.chain}
              solved={game.solved}
              marked={game.marked}
              armedJoint={game.armedJoint}
              maxParts={game.maxParts}
              jointMarks={game.jointMarks}
              jointStamps={game.jointStamps}
              settled={game.settled}
              dragOver={drag?.over ?? null}
              dragSource={drag?.source ?? null}
              liftedPart={drag?.part ?? null}
              handlers={handlers}
              onJoint={game.toggleJoint}
            />

            {!game.solved && <Lives left={game.livesLeft} />}

            {!game.solved && !game.failed && (
              <>
                <ReportWord pair={game.lastMiss} day={day.date} />

                {/* The rack and what the board has to say about it travel
                    together, pinned to the foot of the screen. */}
                <div className="dock">
                  <Announcer status={game.status} announceKey={game.announceKey} />

                  <Pool
                    parts={game.pool}
                    marked={game.marked}
                    liftedPart={drag?.part ?? null}
                    incoming={drag?.over === POOL_ZONE}
                    armedJoint={game.armedJoint}
                    dimmed={game.dimmed}
                    rejected={game.rejection}
                    handlers={handlers}
                  />
                </div>
              </>
            )}

            {game.failed && <FailCard day={day} onReplay={game.replay} />}

            {welcoming && (
              <WelcomeDialog
                onClose={() => {
                  markWelcomed();
                  setWelcoming(false);
                }}
              />
            )}

            {celebration && (
              <OutcomeDialog
                kind={celebration}
                day={day}
                chain={game.chain}
                others={game.otherSolutions}
                onClose={() => setCelebration(null)}
                onReplay={game.replay}
              />
            )}

            {game.solved && (
              <ResultCard
                day={day}
                progress={game.progress}
                otherSolutions={game.otherSolutions}
                onReplay={game.replay}
              />
            )}

            {dev && (
              <DevPanel
                day={day}
                onClearAll={() => {
                  clearSave();
                  window.location.reload();
                }}
              />
            )}
          </section>

          <section
            id="panel-arkiv"
            hidden={view !== "arkiv"}
            className="pb-10"
          >
            <Archive
              days={released}
              selected={dayKey(day)}
              solvedKeys={game.solvedKeys}
              onSelect={openDay}
              onReplayAll={game.replayAll}
            />
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
    </div>
  );
}
