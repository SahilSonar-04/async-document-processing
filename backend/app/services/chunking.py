"""Text segmentation and sliding-window chunking utilities for vector indexing."""


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Segment a continuous text document into overlapping word-based chunks.

    Uses a sliding window approach with a specified step size (`chunk_size - overlap`)
    to preserve contextual continuity across chunk boundaries for dense embedding retrieval.

    Args:
        text: Raw document text string to segment.
        chunk_size: Maximum number of words per individual chunk (default: 500).
        overlap: Number of overlapping words shared between adjacent chunks (default: 50).

    Returns:
        list[str]: Ordered list of non-empty text chunks.
    """
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    step = max(1, chunk_size - overlap)
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_size]).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_size >= len(words):
            break
    return chunks
