"""Kedjan's data pipeline: lexicons -> compounds -> part graph -> days.

The reference prototype was a single script. It is split here so each stage can
be tested without the multi-megabyte corpora, and so the curation rules learned
in playtesting live somewhere they can be enforced rather than remembered.
"""

from . import curate, days, graph, lexicon, split

__all__ = ["curate", "days", "graph", "lexicon", "split"]
