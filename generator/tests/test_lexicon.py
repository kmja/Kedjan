"""The .dic is a speller's file, and it lists words it wants *rejected*."""

from __future__ import annotations

from kedjan import lexicon


def write_dic(tmp_path, lines: list[str]):
    path = tmp_path / "test.dic"
    path.write_text(f"{len(lines)}\n" + "\n".join(lines) + "\n", encoding="utf-8")
    return path


def test_forbidden_words_are_not_words(tmp_path):
    """FORBIDDENWORD (%) marks a misspelling the speller must reject.

    Four of the first five shipped days welded on one of these — hårrock for
    hårdrock, barrock for barock — because the flags were being discarded.
    """
    words, _, forbidden = lexicon.read_dic(
        write_dic(tmp_path, ["hårdrock/AD", "hårrock/%AD", "barock/ADXY", "barrock/%"])
    )
    assert words == {"hårdrock", "barock"}
    assert forbidden == {"hårrock", "barrock"}


def test_compound_only_forms_are_not_standalone_words(tmp_path):
    """ONLYINCOMPOUND (Z) is a compound-initial form: abborr-, adoptiv-."""
    words, _, forbidden = lexicon.read_dic(write_dic(tmp_path, ["abborre/AD", "abborr/Z"]))
    assert words == {"abborre"}
    assert "abborr" in forbidden


def test_a_word_with_both_a_plain_and_an_unusable_entry_is_a_word(tmp_path):
    """`blind` is an ordinary adjective *and* a compound-initial form.

    Usability is judged per entry, not over the union of a word's flags —
    unioning them would condemn every word that also has a compound form.
    """
    words, _, forbidden = lexicon.read_dic(write_dic(tmp_path, ["blind/XZ", "blind/OPQk"]))
    assert words == {"blind"}
    assert forbidden == set()


def test_entry_order_does_not_decide(tmp_path):
    """The same word, plain entry last rather than first."""
    words, _, _ = lexicon.read_dic(write_dic(tmp_path, ["blind/OPQk", "blind/XZ"]))
    assert words == {"blind"}


def test_nosuggest_words_are_dropped(tmp_path):
    """NOSUGGEST (!) is where SFOL keeps profanity and slurs.

    A speller has to recognise them without ever offering them. 50 of the
    2,000 sit inside the common 20k frequency slice that part selection draws
    from. The tier is unreliable at its quiet end too: glasbåt is a NOSUGGEST
    entry that no speaker asked about it recognised.
    """
    words, _, forbidden = lexicon.read_dic(
        write_dic(tmp_path, ["neger/!AD", "glasbåt/!ADGv", "båt/AD"])
    )
    assert words == {"båt"}
    assert forbidden == {"neger", "glasbåt"}


def test_verb_flags_still_survive_the_filter(tmp_path):
    """The verb-only flags are read from the entries that are kept."""
    _, verbs, _ = lexicon.read_dic(write_dic(tmp_path, ["poängsätt/jm", "sätt/AD"]))
    assert verbs == {"poängsätt"}
