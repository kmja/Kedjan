from kedjan import split


def test_splits_a_plain_two_part_compound(lex):
    assert split.min_split(lex, "stenmur") == ["sten", "mur"]


def test_handles_the_foge_s_linking_morpheme(lex):
    assert split.min_split(lex, "kärleksgud") == ["kärlek", "gud"]


def test_handles_the_foge_e_linking_morpheme(lex):
    assert split.min_split(lex, "familjefar") == ["familj", "far"]


def test_a_word_is_never_its_own_part(lex):
    assert split.min_split(lex, "sten") is None


def test_rejects_a_trailing_derivational_suffix(lex):
    # verksam + -het is derivation, not a compound.
    assert split.min_split(lex, "verksamhet") is None


def test_prefers_the_fewest_parts(lex):
    parts = split.min_split(lex, "gårdsport")
    assert parts == ["gård", "port"]


def test_looks_inflected_catches_plural_forms(lex):
    assert split.looks_inflected(lex, "stenar") is True
    assert split.looks_inflected(lex, "stenmur") is False


def test_looks_inflected_ignores_very_short_stems(lex):
    # "husen" would need a three-letter stem. The floor is four, inherited from
    # the reference splitter: shorter stems produce too many false positives.
    assert split.looks_inflected(lex, "husen") is False


def test_compounds_skips_inflected_words(lex):
    found = split.compounds(lex)
    assert "stenmur" in found
    assert "stenar" not in found
    assert "verksamhet" not in found


def test_compounds_rejects_a_prefix_particle_start(lex):
    prefixed = split.compounds(lex)
    assert all(parts[0] not in split.PREFIX_SET for parts in prefixed.values())


def test_linking_s_is_rejected_when_the_longer_form_is_itself_a_word(lex):
    # hetsbrott is hets+brott, not het+s+brott, because "hets" is a word.
    from kedjan.lexicon import Lexicon

    words = {"het", "hets", "brott", "hetsbrott", "strid", "vagn", "stridsvagn"}
    l = Lexicon(words=frozenset(words), union=frozenset(words),
                rank={w: 1 for w in words}, common=frozenset(words))
    assert split.linking_is_sound(l, "het", "s") is False
    assert split.linking_is_sound(l, "strid", "s") is True


def test_the_splitter_prefers_the_longer_real_first_element(lex):
    from kedjan.lexicon import Lexicon

    words = {"het", "hets", "brott", "hetsbrott"}
    l = Lexicon(words=frozenset(words), union=frozenset(words),
                rank={w: 1 for w in words}, common=frozenset(words))
    assert split.min_split(l, "hetsbrott") == ["hets", "brott"]
