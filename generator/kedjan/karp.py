"""Karp — Språkbanken's lexical API, the machine-readable road to SAOL.

Spec: https://ws.spraakbanken.gu.se/docs/karp (OpenAPI 7.0.0). The contract
this client is written against:

    GET {BASE}/query/{resources}?q=equals|<field>|<word>&size=1
    -> {"total": int, "hits": [...], "distribution": {resource: count}}

`resources` is a comma-separated list of lexicon ids (list them with
GET {BASE}/resources/). The query examples in the spec use the field `wf`
(word form); which field a given resource indexes varies, so the client
probes a word known to exist and remembers the field that answered.

Every ghost so far — tomslag, tryckord — was found by a human searching
svenska.se by hand. This asks the same question in bulk. The sandbox this
pipeline is developed in cannot reach spraakbanken.gu.se (network policy),
so run it from CI or a developer machine.
"""

from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://spraakbanken4.it.gu.se/karp/v7"

#: Candidate index fields, probed in order with a word every lexicon has.
CANDIDATE_FIELDS = ("wf", "baseform", "ortografi", "ord")

#: A word no Swedish lexicon lacks — the field probe's touchstone.
PROBE_WORD = "hund"

#: Seconds between requests. Somebody else's server.
COURTESY_DELAY = 0.25


class Karp:
    """Word-existence lookups against Karp lexicons, cached on disk.

    The cache keeps both answers — attested and absent — because the point
    is running this over hundreds of welds repeatedly as the calendar moves.
    """

    def __init__(
        self,
        resources: str = "salex",
        cache_path: Path | str = "karp-cache.json",
        base: str = BASE,
    ):
        self.resources = resources
        self.base = base.rstrip("/")
        self.delay = COURTESY_DELAY
        self.cache_path = Path(cache_path)
        self._cache: dict[str, dict[str, bool]] = {}
        if self.cache_path.exists():
            self._cache = json.loads(self.cache_path.read_text(encoding="utf-8"))
        self._field: str | None = None

    # ── plumbing ─────────────────────────────────────────────────

    def _get(self, path: str) -> object | None:
        req = urllib.request.Request(
            f"{self.base}{path}", headers={"User-Agent": "kedjan-curation/1.0"}
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                if resp.status != 200:
                    return None
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            return None

    def _total(self, field: str, word: str) -> int | None:
        q = urllib.parse.quote(f"equals|{field}|{word}")
        payload = self._get(f"/query/{self.resources}?q={q}&size=1")
        if isinstance(payload, dict) and isinstance(payload.get("total"), int):
            return payload["total"]
        return None

    def _settle_field(self) -> str | None:
        """Find the field this resource indexes, using a word it must have."""
        for field in CANDIDATE_FIELDS:
            total = self._total(field, PROBE_WORD)
            if total is not None and total > 0:
                self._field = field
                return field
            time.sleep(self.delay)
        return None

    # ── the API ──────────────────────────────────────────────────

    def list_resources(self) -> list[str] | None:
        """The lexicon ids this Karp serves, for picking `resources`."""
        payload = self._get("/resources/")
        if isinstance(payload, list):
            out = []
            for r in payload:
                if isinstance(r, dict) and r.get("resource_id"):
                    out.append(str(r["resource_id"]))
                elif isinstance(r, str):
                    out.append(r)
            return out
        return None

    def lookup(self, word: str) -> bool | None:
        """Is the word in the lexicon? None means the API could not be asked."""
        known = self._cache.get(self.resources, {})
        if word in known:
            return known[word]

        if self._field is None and self._settle_field() is None:
            return None

        time.sleep(self.delay)
        total = self._total(self._field, word)  # type: ignore[arg-type]
        if total is None:
            return None

        attested = total > 0
        self._cache.setdefault(self.resources, {})[word] = attested
        self.cache_path.write_text(
            json.dumps(self._cache, ensure_ascii=False, indent=1, sort_keys=True),
            encoding="utf-8",
        )
        return attested
