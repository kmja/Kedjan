from kedjan import graph as graph_mod, split
from kedjan.lexicon import Lexicon


def test_pairs_are_witnessed_by_a_real_compound(lex):
    pairs = graph_mod.witnessed_pairs(split.compounds(lex), lex)
    assert pairs[("sten", "mur")] == "stenmur"
    assert pairs[("kärlek", "gud")] == "kärleksgud"


def test_pairs_are_directional(lex):
    pairs = graph_mod.witnessed_pairs(split.compounds(lex), lex)
    assert ("mur", "sten") not in pairs


def test_the_commonest_witness_wins(lex):
    compounds = {"stenmur": ["sten", "mur"], "murstenar": ["sten", "mur"]}
    pairs = graph_mod.witnessed_pairs(compounds, lex)
    # stenmur ranks ahead of the unranked alternative.
    assert pairs[("sten", "mur")] == "stenmur"


def test_augmentation_recovers_a_pair_the_splitter_missed(lex):
    pairs = graph_mod.witnessed_pairs(split.compounds(lex), lex)
    assert ("gård", "hus") not in pairs

    hubs = frozenset({"gård", "hus", "port"})
    recovered = graph_mod.augment_by_lookup(pairs, hubs, lex)

    assert recovered >= 1
    # gårdshus exists only in the union lexicon, via the foge-s variant.
    assert pairs[("gård", "hus")] == "gårdshus"


def test_augmentation_never_overwrites_a_witnessed_pair(lex):
    pairs = {("sten", "mur"): "stenmur"}
    graph_mod.augment_by_lookup(pairs, frozenset({"sten", "mur"}), lex)
    assert pairs[("sten", "mur")] == "stenmur"


def _lex_with(words, ranks=None):
    return Lexicon(
        words=frozenset(words),
        union=frozenset(words),
        rank=ranks or {w: 1 for w in words},
        common=frozenset(words),
    )


def test_hub_selection_excludes_colours():
    # Give "blå" and "kant" identical, comfortably in-band degrees.
    others = [f"del{i}" for i in range(8)]
    pairs = {}
    for other in others:
        pairs[("blå", other)] = "x"
        pairs[("kant", other)] = "x"
    lex = _lex_with(["blå", "kant", *others], {w: 1 for w in ["blå", "kant", *others]})

    hubs = graph_mod.select_hubs(pairs, lex)
    assert "kant" in hubs
    assert "blå" not in hubs


def test_hub_selection_excludes_over_connected_parts():
    others = [f"del{i}" for i in range(graph_mod.MAX_DEGREE + 5)]
    pairs = {("nav", other): "x" for other in others}
    lex = _lex_with(["nav", *others])
    assert "nav" not in graph_mod.select_hubs(pairs, lex)


def test_hub_selection_excludes_under_connected_parts():
    others = [f"del{i}" for i in range(graph_mod.MIN_DEGREE - 2)]
    pairs = {("ensam", other): "x" for other in others}
    lex = _lex_with(["ensam", *others])
    assert "ensam" not in graph_mod.select_hubs(pairs, lex)


def test_hub_selection_excludes_inflected_forms():
    others = [f"del{i}" for i in range(8)]
    pairs = {}
    for other in others:
        pairs[("lagt", other)] = "x"
        pairs[("lägga", other)] = "x"
    lex = _lex_with(["lagt", "lägga", *others])
    hubs = graph_mod.select_hubs(pairs, lex)
    assert "lagt" not in hubs


def test_is_inflected_part_spots_a_conjugation_of_a_known_lemma():
    known = frozenset({"lägga", "läggerx"})
    assert graph_mod.is_inflected_part("lägger", frozenset({"lägga"})) is True
    assert graph_mod.is_inflected_part("sten", known) is False


def test_build_only_links_hubs_to_hubs(lex):
    built = graph_mod.build(split.compounds(lex), lex)
    for part, neighbours in built.adjacency.items():
        assert part in built.hubs
        assert neighbours <= built.hubs
