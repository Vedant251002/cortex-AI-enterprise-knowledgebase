"""Pytest bootstrap: sets dummy Azure config *before* any `app.*` module is imported.

Settings (app/core/config.py) has several required fields with no defaults, and reads
`backend/.env` if present - which, in a real checkout, holds real Azure credentials. Environment
variables take precedence over `.env` file values in pydantic-settings, so setting all of the
below here guarantees every test runs against harmless placeholder config and never touches a
real Azure resource, regardless of what's in a developer's local `.env`.

This file must only be imported by pytest (which loads conftest.py before collecting sibling
test modules), never by application code.
"""

import os

_DUMMY_ENV = {
    "AZURE_OPENAI_ENDPOINT": "https://test-openai.invalid/",
    "AZURE_OPENAI_API_KEY": "test-key",
    "AZURE_SEARCH_ENDPOINT": "https://test-search.invalid",
    "AZURE_SEARCH_API_KEY": "test-key",
    "AZURE_DOCINTEL_ENDPOINT": "https://test-docintel.invalid/",
    "AZURE_DOCINTEL_API_KEY": "test-key",
    "AZURE_STORAGE_ACCOUNT_NAME": "teststorage",
    "AZURE_STORAGE_ACCOUNT_KEY": "test-key",
    "AZURE_COSMOS_ENDPOINT": "https://test-cosmos.invalid:443/",
    "AZURE_COSMOS_KEY": "test-key",
    "AZURE_CONTENT_SAFETY_ENDPOINT": "https://test-contentsafety.invalid/",
    "AZURE_CONTENT_SAFETY_KEY": "test-key",
    "JWT_SECRET_KEY": "test-secret-not-for-production",
    # Force both off regardless of what a real .env sets, so no test can trigger a live
    # Key Vault lookup or managed-identity token request.
    "AZURE_KEY_VAULT_URL": "",
    "AZURE_USE_MANAGED_IDENTITY": "false",
}

for _key, _value in _DUMMY_ENV.items():
    os.environ[_key] = _value
