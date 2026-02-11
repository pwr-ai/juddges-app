from juddges_search.db.chunks import ChunkWithSources


def format_answer_with_sources(answer_text: str, chunks: list[ChunkWithSources]) -> str:
    """Formats the answer text with source information."""
    if not chunks:
        return answer_text

    # Group chunks by file
    file_chunks: dict[str, list[str]] = {}
    for chunk in chunks:
        if chunk.referenced_file_id not in file_chunks:
            file_chunks[chunk.referenced_file_id] = []
        file_chunks[chunk.referenced_file_id].append(chunk.content)

    full_answer = f"{answer_text}\n```\nSources:\n"

    # Output chunks grouped by file
    for file_id, texts in file_chunks.items():
        file_name = next(
            (c.referenced_file_name for c in chunks if c.referenced_file_id == file_id),
            file_id,
        )
        full_answer += f"\nFile: {file_name}\n"
        for text in texts:
            full_answer += f"...{text}...\n"

    full_answer += "\n```"
    return full_answer
