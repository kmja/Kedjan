/** The rules, in the order a new player meets them. */
export function HowToPlayBody() {
  return (
    <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
      <p>
        Bygg en bro från <strong>start</strong> till <strong>mål</strong>. Dra
        eller tryck på en del för att lägga den i kedjan — i vilken ordning du
        vill, och du kan ta tillbaka delar när som helst.
      </p>
      <p>
        <strong>Varje par av grannar måste bilda ett riktigt sammansatt ord.</strong>{" "}
        GRUND + VAL blir grundval. Kedjan kontrolleras efter varje del: gröna
        bockar för ord som håller, och ordet skrivs ut vid länken.
      </p>
      <p>
        <strong>Du har tre liv.</strong> En del som inte fäster vid någon av
        sina grannar kostar ett hjärta. Tar hjärtana slut brister bron.
      </p>
      <p>
        Ledtrådarna, i tur och ordning: hur många länkar dagen är tänkt att ta,
        vilka delar som inte leder till målet, och till sist en del som passar.
      </p>
    </div>
  );
}

export function HowToPlay() {
  return (
    <details className="card text-sm">
      <summary className="cursor-pointer font-bold">Så spelar du</summary>
      <div className="mt-3">
        <HowToPlayBody />
      </div>
    </details>
  );
}
