export function HowToPlay() {
  return (
    <details className="card text-sm">
      <summary className="cursor-pointer font-bold">Så spelar du</summary>
      <div className="mt-3 flex flex-col gap-2" style={{ color: "var(--ink-soft)" }}>
        <p>
          Bygg en bro från <strong>start</strong> till <strong>mål</strong>. Dra eller
          tryck på en del för att lägga den sist i kedjan — eller tabba dig fram och
          tryck Enter.
        </p>
        <p>
          <strong>Varje par av grannar måste bilda ett riktigt sammansatt ord.</strong>{" "}
          GRUND + VAL blir grundval, VAL + NATT blir valnatt.
        </p>
        <p>
          Du har ett fast antal länkar. Klara dagen på <strong>par</strong> eller färre
          så får du en stjärna. Ledtråden räknar ut hur långt du har kvar just där du
          står — den andra ledtråden markerar rätt del.
        </p>
      </div>
    </details>
  );
}
