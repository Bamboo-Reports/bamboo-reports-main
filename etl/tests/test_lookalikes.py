"""Look-alike letters from other alphabets (#284): detection and replacement."""

import unicodedata

import pytest

from sheets.rules import LOOKALIKE_LETTERS, describe_lookalike, find_lookalikes, mark_lookalikes, replace_lookalikes

CYRILLIC_DZE = "\u0405"  # Ѕ, looks like a Latin S
CYRILLIC_A = "\u0430"  # а
GREEK_OMICRON = "\u03bf"  # ο


def test_flags_a_cyrillic_letter_inside_a_latin_name():
    # The prod case: "Ѕuchismita Pradhan" sorted before every A and missed searches.
    value = f"{CYRILLIC_DZE}uchismita Pradhan"
    assert find_lookalikes(value) == [CYRILLIC_DZE]
    assert replace_lookalikes(value) == "Suchismita Pradhan"


def test_flags_every_look_alike_in_a_mixed_word():
    value = f"G{GREEK_OMICRON}{GREEK_OMICRON}gle Ltd"
    assert find_lookalikes(value) == [GREEK_OMICRON, GREEK_OMICRON]
    assert replace_lookalikes(value) == "Google Ltd"


def test_lowercase_cyrillic_inside_a_latin_word():
    value = f"Inf{CYRILLIC_A}sys"
    assert replace_lookalikes(value) == "Infasys"


@pytest.mark.parametrize(
    "value",
    [
        "Москва",  # a word written wholly in Cyrillic is legitimate
        "Αθήνα office",  # a Greek word next to a Latin one: each word is one alphabet
        "Head of π research",  # π looks like no Latin letter
        "https://example.com/σ-region",  # σ looks like no Latin letter
        "Suchismita Pradhan",  # plain Latin
        "",
    ],
)
def test_leaves_values_without_mixed_words_alone(value):
    assert find_lookalikes(value) == []
    assert replace_lookalikes(value) == value


def test_every_mapping_target_is_one_latin_letter():
    for char, latin in LOOKALIKE_LETTERS.items():
        assert len(latin) == 1 and latin.isascii() and latin.isalpha(), char
        assert not char.isascii(), char


def test_describes_the_character_for_the_report():
    assert describe_lookalike(CYRILLIC_DZE) == "Cyrillic Capital Letter Dze (U+0405) for 'S'"


def test_marks_only_letters_in_mixed_words():
    # The Cyrillic О in "Москва" stays unmarked; the Ѕ in the Latin name is marked.
    value = f"{CYRILLIC_DZE}uchismita, Москва"
    assert mark_lookalikes(value) == f"<{CYRILLIC_DZE}>uchismita, Москва"


def test_every_mapped_letter_is_cyrillic_or_greek():
    for char in LOOKALIKE_LETTERS:
        assert unicodedata.name(char).split()[0] in {"CYRILLIC", "GREEK"}, f"U+{ord(char):04X}"
