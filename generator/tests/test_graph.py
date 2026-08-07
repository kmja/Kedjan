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


def test_hub_selection_excludes_numerals():
    others = [f"del{i}" for i in range(10)]
    pairs = {}
    for other in others:
        pairs[("hundra", other)] = "x"
        pairs[("kant", other)] = "x"
    lex = _lex_with(["hundra", "kant", *others])
    hubs = graph_mod.select_hubs(pairs, lex)
    assert "kant" in hubs
    assert "hundra" not in hubs  # numerals combine without limit, like colours


def test_hub_selection_excludes_off_tone_parts():
    others = [f"del{i}" for i in range(10)]
    pairs = {("skit", other): "x" for other in others}
    lex = _lex_with(["skit", *others])
    assert "skit" not in graph_mod.select_hubs(pairs, lex)


def test_is_surface_form_catches_definite_and_genitive_forms():
    words = {"öga", "ögat", "man", "mans", "hus", "flyg", "kant"}
    lex = _lex_with(words)
    assert graph_mod.is_surface_form("ögat", lex) is True   # öga + definite -t
    assert graph_mod.is_surface_form("mans", lex) is True   # man + genitive -s
    assert graph_mod.is_surface_form("flyg", lex) is False
    assert graph_mod.is_surface_form("hus", lex) is False


def _saldo(pos_map):
    from kedjan.saldo import Saldo
    return Saldo(pos={w: frozenset(t) for w, t in pos_map.items()})


def test_adjective_head_share_separates_a_degree_prefix_from_a_part():
    # hel- modifies adjectives (helfin, helkul); hund- builds nouns.
    adjectives = [f"adj{i}" for i in range(10)]
    nouns = [f"sub{i}" for i in range(10)]
    pairs = {("hel", a): "x" for a in adjectives}
    pairs |= {("hund", n): "x" for n in nouns}
    saldo = _saldo({**{a: ["av"] for a in adjectives}, **{n: ["nn"] for n in nouns}})

    assert graph_mod.adjective_head_share("hel", pairs, saldo) == 1.0
    assert graph_mod.adjective_head_share("hund", pairs, saldo) == 0.0


def test_adjective_head_share_ignores_parts_with_too_few_welds():
    pairs = {("x", "adj"): "w"}
    assert graph_mod.adjective_head_share("x", pairs, _saldo({"adj": ["av"]})) == 0.0


def test_hub_selection_drops_a_measured_degree_prefix():
    adjectives = [f"adj{i}" for i in range(12)]
    pairs = {("modig", a): "x" for a in adjectives}          # 100% adjective heads
    pairs |= {("kant", f"sub{i}"): "x" for i in range(12)}   # 0%
    saldo = _saldo({
        **{a: ["av"] for a in adjectives},
        **{f"sub{i}": ["nn"] for i in range(12)},
        "modig": ["av"], "kant": ["nn"],
    })
    lex = _lex_with(["modig", "kant", *adjectives, *[f"sub{i}" for i in range(12)]])

    hubs = graph_mod.select_hubs(pairs, lex, saldo)
    assert "kant" in hubs
    assert "modig" not in hubs


def test_hub_selection_drops_named_degree_prefixes_without_saldo():
    others = [f"del{i}" for i in range(10)]
    pairs = {("hel", o): "x" for o in others}
    assert "hel" not in graph_mod.select_hubs(pairs, _lex_with(["hel", *others]))


def test_head_pos_consistency_rejects_a_coincidental_concatenation():
    # morfin is morphine, not mor + fin.
    saldo = _saldo({"fin": ["av"], "morfin": ["nn"], "mat": ["nn"], "hundmat": ["nn"]})
    assert graph_mod.head_pos_consistent("fin", "morfin", saldo) is False
    assert graph_mod.head_pos_consistent("mat", "hundmat", saldo) is True


def test_head_pos_consistency_stays_silent_when_saldo_cannot_judge():
    saldo = _saldo({"mat": ["nn"]})
    # Witness unknown to SALDO — no opinion rather than a false accusation.
    assert graph_mod.head_pos_consistent("mat", "slutmat", saldo) is True
    # Head unknown — likewise.
    assert graph_mod.head_pos_consistent("xyz", "slutmat", saldo) is True
