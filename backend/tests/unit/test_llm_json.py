import pytest

from app.services.llm_client import _normalise_fields, _parse_llm_json


def test_parse_llm_json_plain_object():
    parsed = _parse_llm_json('{"title": "Doc", "category": "text"}')
    assert parsed == {"title": "Doc", "category": "text"}


def test_parse_llm_json_strips_code_fence():
    raw = '```json\n{"title": "Doc"}\n```'
    parsed = _parse_llm_json(raw)
    assert parsed == {"title": "Doc"}


def test_parse_llm_json_invalid_json_raises():
    with pytest.raises(Exception):
        _parse_llm_json("not json at all")


def test_parse_llm_json_non_object_raises_value_error():
    with pytest.raises(ValueError):
        _parse_llm_json("[1, 2, 3]")


def test_normalise_fields_falls_back_to_baseline_on_missing_values():
    baseline = {
        "title": "Baseline Title",
        "category": "text",
        "summary": "Baseline summary.",
        "keywords": ["baseline"],
        "word_count": 42,
        "language": "en",
    }
    normalised = _normalise_fields({}, baseline)
    assert normalised["title"] == "Baseline Title"
    assert normalised["category"] == "text"
    assert normalised["summary"] == "Baseline summary."
    assert normalised["keywords"] == ["baseline"]
    assert normalised["word_count"] == 42
    assert normalised["language"] == "en"


def test_normalise_fields_deduplicates_and_caps_keywords():
    baseline = {
        "title": "T", "category": "text", "summary": "S",
        "keywords": [], "word_count": 1, "language": "en",
    }
    parsed = {
        "title": "New Title",
        "category": "document",
        "summary": "New summary.",
        "keywords": ["Alpha", "alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"],
    }
    normalised = _normalise_fields(parsed, baseline)
    assert normalised["keywords"] == ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"]
    assert len(normalised["keywords"]) == 8


def test_normalise_fields_rejects_invalid_category():
    baseline = {
        "title": "T", "category": "text", "summary": "S",
        "keywords": [], "word_count": 1, "language": "en",
    }
    parsed = {"title": "T2", "category": "not-a-real-category", "summary": "S2", "keywords": []}
    normalised = _normalise_fields(parsed, baseline)
    assert normalised["category"] == "text"
    