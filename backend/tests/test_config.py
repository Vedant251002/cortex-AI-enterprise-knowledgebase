"""Regression test for a real bug caught during development: a blank quota env var
(`DAILY_TOKEN_QUOTA_ADMIN=`) used to crash Settings() with a pydantic int_parsing error instead
of being treated as "unlimited"."""

from app.core.config import Settings


def _settings(**overrides):
    base = {
        "azure_openai_endpoint": "https://x.invalid/",
        "azure_openai_api_key": "k",
        "azure_search_endpoint": "https://x.invalid",
        "azure_search_api_key": "k",
        "azure_docintel_endpoint": "https://x.invalid/",
        "azure_docintel_api_key": "k",
        "azure_storage_account_name": "x",
        "azure_storage_account_key": "k",
        "azure_cosmos_endpoint": "https://x.invalid:443/",
        "azure_cosmos_key": "k",
        "azure_content_safety_endpoint": "https://x.invalid/",
        "azure_content_safety_key": "k",
        "jwt_secret_key": "s",
    }
    base.update(overrides)
    return Settings(**base)


def test_blank_quota_string_means_unlimited():
    settings = _settings(daily_token_quota_admin="")
    assert settings.daily_token_quota_admin is None


def test_whitespace_only_quota_string_means_unlimited():
    settings = _settings(daily_token_quota_analyst="   ")
    assert settings.daily_token_quota_analyst is None


def test_numeric_quota_string_still_parses_to_int():
    settings = _settings(daily_token_quota_viewer="15000")
    assert settings.daily_token_quota_viewer == 15000


def test_default_quotas_match_documented_values():
    settings = _settings()
    assert settings.daily_token_quota_admin is None
    assert settings.daily_token_quota_analyst == 50000
    assert settings.daily_token_quota_viewer == 20000
