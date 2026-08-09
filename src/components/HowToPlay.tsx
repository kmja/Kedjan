/** The rules, in the order a new player meets them. */
export function HowToPlayBody() {
  return (
    <div className="flex flex-col gap-2 text-sm" style={{ color: "var(--ink-soft)" }}>
      <p>
        Bygg en kedja från <strong>start</strong> till <strong>mål</strong>. Dra
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
        sina grannar kostar ett hjärta. Tar hjärtana slut brister kedjan.
      </p>
      <p>
        Ledtrådarna, i tur och ordning: hur många länkar dagen är tänkt att ta,
        vilka delar som inte leder till målet, och till sist en del som passar.
      </p>
      <p>
        <strong>Varje dag har två kedjor</strong> — en lätt och en svår. Den
        svåra är längre och har färre vägar till målet.
      </p>
      {/* The corpora are licensed on the condition that they are credited.
          The credit used to stand in a footer under the board; it lives here
          now — out of the way, still one tap from every player. */}
      <p className="text-[0.7rem]">
        Ordmaterial från SALDO, Språkbanken Text (CC BY 4.0), och SFOL — Den
        stora fria ordlistan (LGPL-3.0).
      </p>
    </div>
  );
}

/**
 * The rules, folded into the header: a pill that opens a panel over the
 * board. A plain <details>, so it works before any script runs and answers
 * to the keyboard without help.
 */
export function HowToPlay() {
  return (
    <details className="howto">
      <summary className="howto-toggle">Så spelar du</summary>
      <div className="howto-panel">
        <HowToPlayBody />
      </div>
    </details>
  );
}
