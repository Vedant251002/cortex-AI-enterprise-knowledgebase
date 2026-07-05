from app.services.usage import _add_doc_to_bucket, _empty_bucket, estimate_cost, get_daily_quota_for_role


def test_estimate_cost_uses_configured_rates():
    # Defaults: 0.00025/1K prompt, 0.002/1K completion, 0.00002/1K embedding.
    cost = estimate_cost(prompt_tokens=1000, completion_tokens=1000, embedding_tokens=1000)
    assert cost == 0.00025 + 0.002 + 0.00002


def test_estimate_cost_zero_tokens_is_zero_cost():
    assert estimate_cost(0, 0, 0) == 0


def test_estimate_cost_embedding_defaults_to_zero():
    assert estimate_cost(1000, 0) == 0.00025


def test_get_daily_quota_for_role_matches_defaults():
    assert get_daily_quota_for_role("admin") is None
    assert get_daily_quota_for_role("analyst") == 50000
    assert get_daily_quota_for_role("viewer") == 20000


def test_get_daily_quota_for_unknown_role_is_none():
    assert get_daily_quota_for_role("nonexistent-role") is None


def test_empty_bucket_has_all_zero_fields():
    bucket = _empty_bucket()
    assert bucket == {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "embedding_tokens": 0,
        "query_count": 0,
    }


def test_add_doc_to_bucket_accumulates_across_multiple_docs():
    bucket = _empty_bucket()
    _add_doc_to_bucket(bucket, {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120, "query_count": 1})
    _add_doc_to_bucket(bucket, {"prompt_tokens": 50, "completion_tokens": 10, "total_tokens": 60, "query_count": 1})

    assert bucket["prompt_tokens"] == 150
    assert bucket["completion_tokens"] == 30
    assert bucket["total_tokens"] == 180
    assert bucket["query_count"] == 2


def test_add_doc_to_bucket_ignores_missing_fields():
    bucket = _empty_bucket()
    _add_doc_to_bucket(bucket, {})  # a doc missing every field shouldn't raise or corrupt the bucket
    assert bucket == _empty_bucket()
