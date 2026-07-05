from app.services.rag import _trim_history, build_grounded_prompt, build_search_filter


def test_build_search_filter_single_category():
    assert build_search_filter(["general"]) == "document_category eq 'general'"


def test_build_search_filter_multiple_categories_are_ored():
    filter_str = build_search_filter(["general", "finance"])
    assert filter_str == "document_category eq 'general' or document_category eq 'finance'"


def test_build_search_filter_escapes_single_quotes():
    # A category value containing a single quote must double it per OData string-literal rules,
    # otherwise the filter string would be syntactically broken (or, worse, injectable).
    filter_str = build_search_filter(["o'brien"])
    assert filter_str == "document_category eq 'o''brien'"


def test_build_search_filter_empty_categories_matches_nothing():
    # A viewer whose role somehow resolves to zero categories must retrieve zero chunks - this
    # is the RBAC fail-closed guarantee at the retrieval boundary.
    filter_str = build_search_filter([])
    assert filter_str == "document_category eq null and document_category ne null"


def test_trim_history_keeps_everything_under_budget():
    history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    assert _trim_history(history, max_tokens=1000) == history


def test_trim_history_drops_oldest_turns_first():
    # Each turn here is ~1 token (short words); a tiny budget should keep only the most recent.
    history = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "second"},
        {"role": "user", "content": "third"},
    ]
    trimmed = _trim_history(history, max_tokens=1)
    assert trimmed == [{"role": "user", "content": "third"}]
    assert trimmed != history


def test_trim_history_preserves_chronological_order():
    history = [{"role": "user", "content": f"turn {i}"} for i in range(5)]
    trimmed = _trim_history(history, max_tokens=1000)
    assert [t["content"] for t in trimmed] == [t["content"] for t in history]


def test_build_grounded_prompt_includes_citation_instruction_and_context():
    chunks = [{"document_name": "policy.pdf", "page_number": 3, "content": "Employees may work remotely."}]
    messages = build_grounded_prompt("Can I work remotely?", chunks, history=[])

    assert messages[0]["role"] == "system"
    assert "cite" in messages[0]["content"].lower()
    assert "I don't have enough information" in messages[0]["content"]

    user_message = messages[-1]["content"]
    assert "[1] policy.pdf p.3" in user_message
    assert "Employees may work remotely." in user_message
    assert "Can I work remotely?" in user_message


def test_build_grounded_prompt_with_no_chunks_says_so_in_context():
    messages = build_grounded_prompt("Anything?", chunks=[], history=[])
    assert "no relevant context" in messages[-1]["content"].lower()
