from app.workers.tasks import (
    _detect_language,
    _extract_fields,
    _normalize_text,
    _rake_keywords,
    _split_sentences,
    _summarize,
)


def test_normalize_text_merges_short_bullet_fragments():
    raw = "- Item one\ncontinued\n- Item two"
    normalized = _normalize_text(raw)
    assert "Item one continued." in normalized
    assert "Item two." in normalized


def test_normalize_text_appends_terminal_punctuation():
    normalized = _normalize_text("This has no ending punctuation")
    assert normalized.endswith(".")


def test_split_sentences_merges_short_trailing_fragment():
    sentences = _split_sentences("This is a full sentence. Ok.")
    assert len(sentences) == 1
    assert sentences[0].startswith("This is a full sentence.")


def test_split_sentences_keeps_standalone_long_sentences():
    text = "The quick brown fox jumps. A second complete sentence follows here."
    sentences = _split_sentences(text)
    assert len(sentences) == 2


def test_summarize_returns_full_text_when_within_limit():
    text = "First sentence here. Second sentence here."
    summary = _summarize(text, max_sentences=3)
    assert summary == " ".join(_split_sentences(text))


def test_summarize_picks_top_scoring_sentences_within_limit():
    text = (
        "Machine learning models require large datasets. "
        "Cats are popular pets around the world. "
        "Training machine learning models is computationally expensive. "
        "Dogs are also popular pets. "
        "Large datasets improve machine learning model accuracy significantly."
    )
    summary = _summarize(text, max_sentences=2)
    assert len(_split_sentences(summary)) <= 2
    assert "machine learning" in summary.lower()


def test_rake_keywords_extracts_multi_word_phrases():
    text = (
        "Async document processing pipelines use background workers. "
        "Background workers scale independently."
    )
    keywords = _rake_keywords(text, max_keywords=5)
    assert keywords
    assert any("background" in keyword for keyword in keywords)


def test_rake_keywords_empty_text_returns_empty_list():
    assert _rake_keywords("") == []


def test_detect_language_short_text_is_unknown():
    assert _detect_language("Hi") == "unknown"


def test_detect_language_detects_english():
    text = "This is a reasonably long sentence written in English for detection."
    assert _detect_language(text) == "en"


def test_extract_fields_returns_expected_shape():
    fields = _extract_fields("Some example document body text.", "my_report.txt", "txt")
    assert fields["title"] == "My Report"
    assert fields["category"] == "text"
    assert isinstance(fields["keywords"], list)
    assert isinstance(fields["word_count"], int)
    assert fields["word_count"] > 0


def test_extract_fields_maps_unknown_extension_to_other_category():
    fields = _extract_fields("Body text.", "file.xyz", "xyz")
    assert fields["category"] == "other"
    