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

A hit answers with article markup (`class="artikel"`); a miss with a short
no-hit message. This is somebody's public website, not an API: identified
User-Agent, a full second between requests, and every verdict cached in a
committed file so no word is ever asked about twice.
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
#: An article fragment carries this; a no-hit message does not.
HIT_MARK = 'class="artikel"'

#: Verdict file: word -> {"so": bool, "saol": bool}. Committed, unlike the
#: corpora — these are facts about words, not dictionary content.
DEFAULT_VERDICTS = "svenska-verdicts.json"


def _definition(html: str) -> str | None:
    """SO's first definition, best-effort, for reading during curation.

    Printed, never stored: the definitions are SO's content, and the
    verdict file is committed.
    """
    m = re.search(r'class="def"[^>]*>(.*?)</', html, re.DOTALL)
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
    ):
        self.base = base.rstrip("/")
        self.delay = COURTESY_DELAY
        self.verdicts_path = Path(verdicts_path)
        self.verdicts: dict[str, dict[str, bool]] = {}
        if self.verdicts_path.exists():
            self.verdicts = json.loads(self.verdicts_path.read_text(encoding="utf-8"))
        self.last_error: str | None = None

    def _fetch(self, dictionary: str, word: str) -> str | None:
        url = f"{self.base}/f_{dictionary}.php?sok={urllib.parse.quote(word)}"
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "kedjan-curation/1.0 (word-game weld check)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    self.last_error = f"HTTP {resp.status} on f_{dictionary} for {word}"
                    return None
                return resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            self.last_error = f"HTTP {e.code} on f_{dictionary} for {word}"
            return None
        except Exception as e:
            self.last_error = f"{type(e).__name__}: {e} on f_{dictionary} for {word}"
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
            verdict[dictionary] = HIT_MARK in html
            if dictionary == "so" and verdict[dictionary]:
                definition = _definition(html)

        self.verdicts[word] = verdict
        self.verdicts_path.write_text(
            json.dumps(self.verdicts, ensure_ascii=False, indent=1, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )
        # Riding along for the curator's terminal only.
        self.last_definition = definition
        return verdict
