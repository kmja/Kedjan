import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from kedjan.lexicon import Lexicon  # noqa: E402

#: A tiny hand-built corpus. Small enough to reason about, big enough to
#: exercise splitting, linking morphemes and the augmentation lookup.
PARTS = [
    "sten", "mur", "vägg", "bro", "tak", "glas", "hus", "gård", "port",
    "kärlek", "gud", "familj", "far",
]

COMPOUNDS = [
    "stenmur", "stenbro", "stentak", "murvägg", "vägghus", "brohus",
    "takglas", "husgård", "gårdsport", "portgång", "kärleksgud",
    "familjefar", "stenhus", "murbruk",
]

EXTRA = ["bruk", "gång", "verksamhet", "verksam", "husen", "stenar"]


@pytest.fixture
def lex() -> Lexicon:
    words = set(PARTS) | set(COMPOUNDS) | set(EXTRA)
    # Only in the union: the augmentation must be able to find it even though
    # the splitter never produced it.
    union = words | {"gårdshus", "husport"}
    order = [*PARTS, *COMPOUNDS, *EXTRA]
    return Lexicon(
        words=frozenset(words),
        union=frozenset(union),
        rank={w: i for i, w in enumerate(order)},
        common=frozenset(order),
    )
