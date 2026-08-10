"""svenska.se — the dictionaries the player actually taps.

Every weld word in the game links to svenska.se, so the site is the ground
truth for whether that link keeps its promise. Karp would be the proper
API for the same material, but its salex resource is protected; svenska.se
answers everyone, one word at a time.

SO — Svensk ordbok — is the dictionary that matters most here: it carries
real definitions, which is what a curious player gets when the link works.
SAOL witnesses spelling and inflection. A weld in SO is right; a weld only
in SAOL keeps the link alive but shows no meaning; a weld in neither is a
ghost and must not ship.

The site serves per-dictionary article fragments:

    GET https://svenska.se/tri/f_so.php?sok=<word>
    GET https://svenska.se/tri/f_saol.php?sok=<word>

A hit answers with article markup — an element whose class list holds
`artikel` — and a miss with a short no-hit message. Both are recognised
explicitly, and a page that is neither is *not* a verdict: it is the parser
having lost the site, which is a thing that happens and must never be
reported as five hundred missing words.

This is somebody's public website, not an API: identified User-Agent, a
full second between requests, and every verdict cached in a committed file
so no word is ever asked about twice.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://svenska.se/tri"
#: A public website gets more courtesy than an API.
COURTESY_DELAY = 1.0
#: An article fragment has an element whose class list holds `artikel` —
#: matched as a class among others, because `class="artikel"` exactly is a
#: shape of the markup and not a promise about it.
HIT_RE = re.compile(r'class=["\'][^"\']*\bartikel\b', re.I)
#: What the site says when it has nothing. Any of these wordings; the site
#: has used more than one.
MISS_RE = re.compile(
    r"(gav inga svar|gav ingen träff|inga träffar|ingen träff|hittades inte)", re.I
)

#: Words SO certainly holds, asked live before a run to prove the parser
#: still recognises the site. If these come back missing, everything else
#: coming back missing means nothing.
CANARIES = ("ordbok", "badrum", "dagbok")

#: Bumped whenever the reading above changes. Verdicts written by an older
#: probe are not evidence about words — they are evidence about that probe,
#: so they are discarded rather than trusted.
PROBE_VERSION = 2

#: Verdict file: word -> {"so": bool, "saol": bool}, plus a `_probe` stamp.
#: Committed, unlike the corpora — these are facts about words, not
#: dictionary content.
DEFAULT_VERDICTS = "svenska-verdicts.json"


def reading(html: str) -> bool | None:
    """True for an article, False for a no-hit page, None for neither.

    None is the important one. The first run of this check against the live
    site reported all 560 welds missing — badrum, dagbok, ordbok among them —
    because the hit marker was written as an exact class attribute and the
    site does not serve one. A miss has to be recognised on its own evidence,
    not inferred from failing to recognise a hit.
    """
    if HIT_RE.search(html):
        return True
    if MISS_RE.search(html):
        return False
    return None


def _definition(html: str) -> str | None:
    """SO's first definition, best-effort, for reading during curation.

    Printed, never stored: the definitions are SO's content, and the
    verdict file is committed.
    """
    m = re.search(r'class=["\'][^"\']*\bdef\b[^>]*>(.*?)</', html, re.DOTALL)
    if not m:
        return None
    text = re.sub(r"<[^>]+>", "", m.group(1)).strip()
    return text or None


class Svenska:
    """Word-existence lookups against svenska.se, verdicts cached on disk."""

    def __init__(
        self,
        verdicts_path: Path | str = DEFAULT_VERDICTS,
        base: str = BASE,
        trace=None,
    ):
        self.base = base.rstrip("/")
        self.delay = COURTESY_DELAY
        #: Called with one line per HTTP request — timing, size, outcome.
        #: A run over a thousand welds takes half an hour, and silence that
        #: long is indistinguishable from a hang.
        self.trace = trace
        self.verdicts_path = Path(verdicts_path)
        self.verdicts: dict[str, dict[str, bool]] = {}
        #: How many verdicts an older probe left behind, discarded on load.
        self.discarded = 0
        if self.verdicts_path.exists():
            stored = json.loads(self.verdicts_path.read_text(encoding="utf-8"))
            words = {k: v for k, v in stored.items() if not k.startswith("_")}
            if stored.get("_probe") == PROBE_VERSION:
                self.verdicts = words
            else:
                self.discarded = len(words)
        self.last_error: str | None = None

    def _fetch(self, dictionary: str, word: str) -> str | None:
        url = f"{self.base}/f_{dictionary}.php?sok={urllib.parse.quote(word)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "kedjan-curation/1.0 (word-game weld check)"},
        )
        started = time.monotonic()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    self.last_error = f"HTTP {resp.status} on f_{dictionary} for {word}"
                    if self.trace:
                        self.trace(f"GET f_{dictionary} {word} -> {self.last_error}")
                    return None
                html = resp.read().decode("utf-8", "replace")
                if self.trace:
                    ms = (time.monotonic() - started) * 1000
                    verdict = reading(html)
                    said = {True: "hit", False: "miss", None: "unreadable"}[verdict]
                    self.trace(
                        f"GET f_{dictionary} {word} -> 200, {len(html)} bytes, "
                        f"{ms:.0f}ms, {said}"
                    )
                return html
        except urllib.error.HTTPError as e:
            self.last_error = f"HTTP {e.code} on f_{dictionary} for {word}"
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e} on f_{dictionary} for {word}"
        if self.trace:
            ms = (time.monotonic() - started) * 1000
            self.trace(f"GET f_{dictionary} {word} -> {self.last_error} ({ms:.0f}ms)")
        return None

    def probe(self, word: str, dictionary: str = "so") -> str | None:
        """The raw fragment, for calibrating the parser against the live site."""
        return self._fetch(dictionary, word)

    def lookup(self, word: str) -> dict[str, bool] | None:
        """{"so": bool, "saol": bool}, or None if the site could not be asked.

        Both answers are fetched together and cached forever — a verdict is a
        fact about an edition, not a moving target.
        """
        if word in self.verdicts:
            return self.verdicts[word]

        verdict: dict[str, bool] = {}
        definition = None
        for dictionary in ("so", "saol"):
            time.sleep(self.delay)
            html = self._fetch(dictionary, word)
            if html is None:
                return None
            answer = reading(html)
            if answer is None:
                # Neither an article nor a no-hit page: the site is answering
                # something this parser was not written for. Saying "missing"
                # here is how a whole calendar gets condemned by a typo in a
                # regex, so it says nothing instead.
                self.last_error = (
                    f"unreadable answer from f_{dictionary} for {word} "
                    f"({len(html)} bytes) — neither an article nor a no-hit "
                    "page. Run --probe to see what the site is serving."
                )
                return None
            verdict[dictionary] = answer
            if dictionary == "so" and answer:
                definition = _definition(html)

        self.verdicts[word] = verdict
        self.verdicts_path.write_text(
            json.dumps(
                {"_probe": PROBE_VERSION, **self.verdicts},
                ensure_ascii=False,
                indent=1,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        # Riding along for the curator's terminal only.
        self.last_definition = definition
        return verdict

    def selftest(self) -> list[str]:
        """Which canaries the site did not answer for. Empty means trustworthy.

        Asked live and never cached: the point is to prove that *this run*
        can still read the site, so a stored answer would defeat it.
        """
        failed = []
        for word in CANARIES:
            time.sleep(self.delay)
            html = self._fetch("so", word)
            if html is None or reading(html) is not True:
                failed.append(word)
        return failed
