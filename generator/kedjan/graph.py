"""The part graph: which parts weld to which, and what word proves it."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from .lexicon import Lexicon
from .saldo import Saldo
from .split import CONNECTORS, linking_is_sound

#: Surface forms that are inflections rather than lemmas. The prototype's
#: hand-list; SALDO replaces it. Parts are lemmas only — lägga, never lagt.
INFLECTED_FORMS = frozenset(
    {
        "lagt", "lagd", "lagda", "gjort", "gjord", "gjorda", "sagt", "sagd",
        "gått", "stått", "fått", "sett", "sedd", "tagit", "tagen", "gett",
        "givit", "given", "kommit", "kommen", "blivit", "varit", "hållit",
        "hållen", "skrivit", "skriven", "slagit", "slagen", "dragit", "dragen",
        "burit", "skjutit", "brutit", "vunnit", "funnit", "bundit", "läst",
        "lästa", "byggt", "kört", "köpt", "sålt", "valt", "levt", "hört",
        "rört", "känt", "satt", "lade", "gjorde", "sade", "gick", "blev",
        "höll", "skrev", "slog", "drog", "sköt", "bröt", "vann", "fann",
        "band", "satte", "köpte", "sålde", "valde", "levde", "hörde", "rörde",
        "kände", "byggde", "körde", "läste", "tog", "fick", "såg", "gav",
        "stod", "kom", "föll", "ställde", "ställt",
    }
)

#: Universal combiners. Blå welds to 93 other parts — a decoy that fits
#: everywhere adds ambiguity without structure, so colours are banned outright.
COLORS = frozenset({"blå", "grön", "gul", "röd", "vit", "svart", "brun", "grå", "rosa", "lila", "orange"})

#: Numerals, banned for the same reason as colours: they combine with each
#: other essentially without limit — tjugofyra, hundrafem, femtio, tvåhundra —
#: so a pool that drifts into them becomes arithmetic rather than deduction.
NUMERALS = frozenset(
    {
        "två", "tre", "fyra", "fem", "sex", "sju", "åtta", "nio", "tio", "elva",
        "tolv", "tretton", "fjorton", "femton", "sexton", "sjutton", "arton",
        "nitton", "tjugo", "trettio", "fyrtio", "femtio", "sextio", "sjuttio",
        "åttio", "nittio", "hundra", "tusen", "miljon", "miljard", "noll",
        "första", "andra", "tredje", "fjärde", "femte", "sjätte", "halv",
        "dubbel", "enkel", "trippel",
    }
)

#: Kedjan is a general-audience daily. The frequency list is built from film
#: subtitles, so "commonest Swedish" by that ranking skews spoken, profane and
#: slurred — skit, bög, snut, fan and kin all rank high and are not words this
#: game puts in front of a player at breakfast.
TONE_BAN = frozenset(
    {
        "skit", "bög", "fitta", "kuk", "snut", "fan", "helvete", "jävla", "hora",
        "knulla", "pissa", "brud", "neger", "as", "idiot", "pack", "svin",
        "död", "mord", "våld", "vapen", "krig", "nazi", "sex", "porr", "knark",
        # Recurred in curation: likbjörn, rörbomb, blodsnö all reached the
        # shortlist before these went in.
        "lik", "bomb", "cancer", "sjuk", "blod", "gift", "sjukdom",
    }
)

#: Fragments that are never the head of a Swedish compound. `ande` is a real
#: noun (a spirit) and SALDO rightly admits it, but *as a final element* it
#: spells a present participle — snöande, bärande, blodande — so it is barred
#: from being a part at all. Position, not the lexicon, is what condemns it.
NON_HEAD_PARTS = frozenset({"ande", "ende", "rar", "rat", "rade", "rats"})

#: Register doublets: one lexeme in a full and a short form. Swedish takes the
#: full form initially (broderskärlek, faderskärlek) and the short form finally
#: (farbror, morfar), so they are not interchangeable — and two members of one
#: doublet in a single pool are confusable rather than selective. Reported in
#: playtesting as "far, fader, mor — very close options".
DOUBLETS = frozenset({("far", "fader"), ("mor", "moder"), ("bror", "broder")})


def doublet_partner(part: str) -> str | None:
    for a, b in DOUBLETS:
        if part == a:
            return b
        if part == b:
            return a
    return None


#: Degree prefixes: hel-, tok-, jätte- and kin. They attach to almost any
#: adjective to mean "very", which makes them universal combiners in exactly
#: the way colours are — the handover names the stor/halv class for the same
#: reason. They used to be caught by the degree ceiling; raising that ceiling
#: for the larger corpus quietly let them back in.
#:
#: This list is the fallback for a SALDO-less run. With SALDO the test is
#: measured rather than remembered — see `adjective_head_share`.
DEGREE_PREFIXES = frozenset(
    {"hel", "tok", "jätte", "skit", "kanon", "super", "mega", "hyper",
     "urbota", "stor", "halv", "dunder"}
)

#: Above this share of adjective heads a part is a degree modifier rather than
#: a compound part. Measured before it was chosen: genuine parts sit at 7-20%
#: (hund 13%, mat 17%, natt 20%), and even adjectives that compound properly
#: stay low (fin 17%, god 27%). hel is 56% and tok 82%.
MAX_ADJECTIVE_HEAD_SHARE = 0.40
#: Below this many welds the share is noise rather than signal.
ADJECTIVE_SHARE_MIN_WELDS = 8

#: Irregular plurals that slip past the suffix-based inflection test.
PLURAL_BAN = frozenset({"söner", "män", "fötter", "händer", "böcker"})

#: Closed-class words: pronouns, determiners, conjunctions, prepositions,
#: quantifiers, auxiliaries and discourse particles.
#:
#: These are never compound parts, but they *are* the commonest words in the
#: language, so a frequency-ranked filter promotes them straight to the top.
#: Without this list the hub set comes back as jag/har/för/han/med/som — the
#: filter selects fluent Swedish rather than compoundable Swedish.
CLOSED_CLASS = frozenset(
    {
        # pronouns and possessives
        "jag", "du", "han", "hon", "hen", "den", "det", "vi", "ni", "de", "dem",
        "mig", "dig", "sig", "oss", "honom", "henne", "min", "mitt", "mina",
        "din", "ditt", "dina", "hans", "hennes", "vår", "vårt", "våra", "era",
        "deras", "sin", "sitt", "sina", "man", "en", "ett",
        # determiners and quantifiers
        "alla", "allt", "all", "ingen", "inget", "inga", "något", "någon",
        "några", "annan", "andra", "andre", "samma", "sådan", "varje", "vilken",
        "vilket", "vilka", "mycket", "många", "flera", "både",
        # conjunctions, subjunctions, interrogatives
        "som", "att", "och", "eller", "men", "om", "när", "där", "här", "hur",
        "vad", "vem", "varför", "medan", "fast", "utan", "samt",
        # adverbs and discourse particles
        "inte", "icke", "inga", "aldrig", "alltid", "ofta", "ibland", "redan",
        "ännu", "kanske", "bara", "också", "nog", "väl", "igen", "sedan", "nu",
        "sen", "bra", "ja", "nej", "jo", "tack", "hej", "helt", "ganska",
        # auxiliaries, copulas and their finite forms
        "är", "var", "vara", "blir", "blev", "bli", "har", "hade", "ha", "kan",
        "kunde", "ska", "skall", "skulle", "vill", "ville", "får", "fick",
        "gör", "gjorde", "göra", "måste", "bör", "tar", "gick", "kom", "ser",
        "vet", "säger", "tror", "heter", "finns",
    }
)

#: Hub selection. Too few welds and a part is useless; too many and it is a
#: universal combiner.
#:
#: The ceiling scales with the corpus. On the prototype's smaller DSSO graph
#: 50 sat above the content nouns; against a 250k-word dictionary it sits
#: *below* them — bil, hus and land all land in the 51-200 band — so the same
#: number silently inverted the filter's meaning and kept only the junk.
MIN_DEGREE, MAX_DEGREE = 8, 250
MAX_HUB_OBSCURITY = 5_000
HUB_LENGTH = range(3, 7)


@dataclass
class PartGraph:
    """Directed part -> part edges, each witnessed by a real compound."""

    #: (a, b) -> the compound that proves a welds to b.
    pairs: dict[tuple[str, str], str]
    #: The curated node set days are built from.
    hubs: frozenset[str]
    #: hub -> hubs it welds to, the graph day generation actually walks.
    adjacency: dict[str, set[str]]

    def degree(self, part: str) -> int:
        return len(self.adjacency.get(part, ()))

    def welds(self, a: str, b: str) -> bool:
        return (a, b) in self.pairs


def is_inflected_part(part: str, known_parts: frozenset[str]) -> bool:
    """A part that is an inflection of another part is not a lemma."""
    if part in INFLECTED_FORMS:
        return True
    return any(
        part.endswith(suffix) and part[:-2] + "a" in known_parts
        for suffix in ("er", "ar", "de")
    )


#: Definite and genitive endings. A part must be a lemma, and these are
#: surface forms of one: ögat is öga, mans is man.
SURFACE_ENDINGS = ("et", "en", "an", "t", "n")


def is_surface_form(part: str, lex: Lexicon) -> bool:
    """True if the part is a definite or genitive form of a shorter word.

    Catches what the suffix-based inflection test misses — it looks for verb
    and plural endings, not for the definite article fused onto a noun.
    """
    if part.endswith("s") and len(part) >= 4 and part[:-1] in lex.words:
        return True
    return any(
        len(part) - len(suffix) >= 3 and part[: -len(suffix)] in lex.words
        for suffix in SURFACE_ENDINGS
    )


def witnessed_pairs(compounds: dict[str, list[str]], lex: Lexicon) -> dict[tuple[str, str], str]:
    """Pairs drawn from two-part compounds, each witnessed by its commonest word."""
    pairs: dict[tuple[str, str], str] = {}
    for word, split in compounds.items():
        if len(split) != 2:
            continue
        key = (split[0], split[1])
        if key not in pairs or lex.obscurity(word) < lex.obscurity(pairs[key]):
            pairs[key] = word
    return pairs


def adjective_head_share(
    part: str, pairs: dict[tuple[str, str], str], saldo: Saldo
) -> float:
    """How much of a part's compounding lands on adjectives.

    A degree prefix modifies adjectives — helfin, helkul, heltokig — so its
    heads are overwhelmingly adjectives. A real part builds nouns. This is the
    kind of judgement the hand-written list only ever approximates, and the
    reason SALDO's part-of-speech tags are worth having.
    """
    heads = [b for (a, b) in pairs if a == part]
    if len(heads) < ADJECTIVE_SHARE_MIN_WELDS:
        return 0.0
    adjectives = sum(1 for h in heads if "av" in saldo.pos.get(h, frozenset()))
    return adjectives / len(heads)


def select_hubs(
    pairs: dict[tuple[str, str], str],
    lex: Lexicon,
    saldo: Saldo | None = None,
) -> frozenset[str]:
    """Simple, common, well-connected, lemma-only, no colours.

    With SALDO present, part-of-speech does the work that CLOSED_CLASS,
    NUMERALS, INFLECTED_FORMS, PLURAL_BAN and the surface-form heuristic were
    all approximating: a part must be a lemma SALDO tags as a noun or
    adjective. The hand-built lists stay as the fallback for a SALDO-less run,
    and COLORS and TONE_BAN stay in both paths — those are editorial
    judgements, not facts a lexicon can settle.
    """
    degree: dict[str, int] = defaultdict(int)
    for a, b in pairs:
        degree[a] += 1
        degree[b] += 1
    known = frozenset(degree)

    def lexically_ok(part: str) -> bool:
        if saldo is not None:
            if adjective_head_share(part, pairs, saldo) > MAX_ADJECTIVE_HEAD_SHARE:
                return False  # a degree prefix, not a part
            return saldo.is_part_candidate(part)
        return (
            part not in CLOSED_CLASS
            and not is_inflected_part(part, known)
            and not is_surface_form(part, lex)
        )

    return frozenset(
        part
        for part, deg in degree.items()
        if MIN_DEGREE <= deg <= MAX_DEGREE
        and lex.obscurity(part) < MAX_HUB_OBSCURITY
        and len(part) in HUB_LENGTH
        # Editorial bans apply on both paths: these are judgements about what
        # belongs in the game, not facts a lexicon can settle. NUMERALS lived
        # only in the fallback for a while, and `dubbel` — which SALDO tags as
        # an adjective, not a numeral — walked straight into a pool.
        and part not in COLORS
        and part not in NUMERALS
        and part not in TONE_BAN
        and part not in PLURAL_BAN
        and part not in NON_HEAD_PARTS
        and part not in DEGREE_PREFIXES
        and not has_common_verb_twin(part, lex, saldo)
        and lexically_ok(part)
    )


def augment_by_lookup(
    pairs: dict[tuple[str, str], str], hubs: frozenset[str], lex: Lexicon
) -> int:
    """Recover pairs the splitter missed by asking the lexicon directly.

    For every hub pair, test a+b and the linking-morpheme variants against the
    union lexicon. In the reference run this recovered 1,876 pairs that DSSO's
    split graph did not produce. Keep this step even after SALDO — no single
    lexicon has every compound.
    """
    recovered = 0
    for a in hubs:
        for b in hubs:
            if a == b or (a, b) in pairs:
                continue
            variants = [a + b]
            variants += [a + c + b for c in CONNECTORS if linking_is_sound(lex, a, c, b)]
            for candidate in variants:
                if len(candidate) >= 7 and candidate in lex.union:
                    pairs[(a, b)] = candidate
                    recovered += 1
                    break
    return recovered


#: A part whose string doubles as the stem of a *common* verb inherits welds
#: from a lemma that is not in the game. `kör` is a choir here, but `körsätt`,
#: `körskola` and `körprov` all come from `köra` — so the chip is credited with
#: welds a player who knows the choir sense could never predict.
#:
#: The cutoff is on the verb's own frequency, because productivity is what does
#: the damage: `köra` ranks 551 and generates compounds freely, while `orda`,
#: `jula` and `borda` are rare enough that nobody would build a compound from
#: them. Without SALDO's morphology layer, which records each lemma's
#: compound-initial form, this is the closest available approximation.
VERB_TWIN_OBSCURITY = 2_000


def has_common_verb_twin(part: str, lex: Lexicon, saldo: Saldo | None) -> bool:
    twin = part + "a"
    if saldo is not None and "vb" not in saldo.pos.get(twin, frozenset()):
        return False
    if saldo is None and twin not in lex.words:
        return False
    return lex.obscurity(twin) < VERB_TWIN_OBSCURITY


def head_pos_consistent(head: str, witness: str, saldo: Saldo) -> bool:
    """Does the witness inherit its head's part of speech?

    A Swedish compound takes the word class of its final element: noun + noun
    makes a noun. When it does not, the string is usually not that compound at
    all but an unrelated word the two parts happen to spell:

        mor + fin    = morfin       (morphine)
        bank + ett   = bankett      (a banquet)
        ton + sur    = tonsur       (a tonsure)
        minne + svärd = minnesvärd  (minnes+värd, memorable)
        skydd + svärd = skyddsvärd  (skydds+värd, worth protecting)

    Conservative by construction: it can only judge welds where SALDO records
    both the head and the witness, and stays silent otherwise.
    """
    head_pos = saldo.pos.get(head)
    witness_pos = saldo.pos.get(witness)
    if not head_pos or not witness_pos:
        return True
    return bool(head_pos & witness_pos)


def build(
    compounds: dict[str, list[str]], lex: Lexicon, saldo: Saldo | None = None
) -> PartGraph:
    pairs = witnessed_pairs(compounds, lex)
    hubs = select_hubs(pairs, lex, saldo)
    augment_by_lookup(pairs, hubs, lex)

    # A witness that is a verb form is not a compound with a noun head, however
    # well the letters line up: poängsätt is the stem of poängsätta.
    for key in [k for k, w in pairs.items() if w in lex.verb_forms]:
        del pairs[key]

    if saldo is not None:
        for key in [
            k for k, w in pairs.items() if not head_pos_consistent(k[1], w, saldo)
        ]:
            del pairs[key]

    adjacency: dict[str, set[str]] = defaultdict(set)
    for a, b in pairs:
        if a in hubs and b in hubs:
            adjacency[a].add(b)
    return PartGraph(pairs=pairs, hubs=hubs, adjacency=dict(adjacency))
