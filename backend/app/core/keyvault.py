"""Azure Key Vault secret resolution, backed by azure-identity's DefaultAzureCredential.

Local dev: AZURE_KEY_VAULT_URL is left blank in .env, so resolve_secret() always returns the
fallback (the plain env var) and this module never talks to Azure at all.

Production: set AZURE_KEY_VAULT_URL and provision the secrets below in the vault (names use
Key Vault's hyphenated convention). DefaultAzureCredential picks up the App Service / Container
Apps managed identity automatically - no key or connection string needed for Key Vault access
itself, which is the point: Key Vault holds the *other* services' keys so they never live in
plain env vars in production.
"""

from functools import lru_cache

import structlog

logger = structlog.get_logger(__name__)

# Settings field name -> Key Vault secret name. Consumed by Settings.model_post_init in config.py.
SECRET_NAME_MAP: dict[str, str] = {
    "azure_openai_api_key": "azure-openai-api-key",
    "azure_openai_embedding_api_key": "azure-openai-embedding-api-key",
    "azure_search_api_key": "azure-search-api-key",
    "azure_docintel_api_key": "azure-docintel-api-key",
    "azure_storage_account_key": "azure-storage-account-key",
    "azure_cosmos_key": "azure-cosmos-key",
    "azure_content_safety_key": "azure-content-safety-key",
    "jwt_secret_key": "jwt-secret-key",
}


@lru_cache
def _get_credential():
    from azure.identity import DefaultAzureCredential

    return DefaultAzureCredential()


@lru_cache
def _get_secret_client(vault_url: str):
    from azure.keyvault.secrets import SecretClient

    return SecretClient(vault_url=vault_url, credential=_get_credential())


def resolve_secret(vault_url: str, secret_name: str, fallback: str) -> str:
    """Look up `secret_name` in Key Vault; fall back to `fallback` (the .env value) on any
    failure so a missing vault entry or transient outage degrades to local-style config
    rather than crashing startup."""
    if not vault_url:
        return fallback
    try:
        client = _get_secret_client(vault_url)
        secret = client.get_secret(secret_name)
        return secret.value or fallback
    except Exception:
        logger.warning("keyvault_secret_unavailable_using_fallback", secret_name=secret_name, exc_info=True)
        return fallback
