from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Azure OpenAI
    azure_openai_endpoint: str
    azure_openai_api_key: str
    azure_openai_api_version: str = "2024-10-21"
    azure_openai_chat_deployment: str = "gpt-5-mini"
    azure_openai_embedding_deployment: str = "text-embedding-3-small"
    # Embeddings can live on a different Azure OpenAI resource than chat (e.g. when the primary
    # resource's region has zero quota for the embedding model's SKU). Falls back to the main
    # endpoint/key above when left blank - see get_embedding_client() in azure_clients.py.
    azure_openai_embedding_endpoint: str = ""
    azure_openai_embedding_api_key: str = ""

    # Azure AI Search
    azure_search_endpoint: str
    azure_search_api_key: str
    azure_search_index_name: str = "kb-chunks"

    # Azure Document Intelligence
    azure_docintel_endpoint: str
    azure_docintel_api_key: str

    # Azure Blob Storage
    azure_storage_account_name: str
    azure_storage_account_key: str
    azure_storage_container_name: str = "documents"

    # Azure Cosmos DB
    azure_cosmos_endpoint: str
    azure_cosmos_key: str
    azure_cosmos_database_name: str = "cortex"
    azure_cosmos_audit_container: str = "audit_logs"
    azure_cosmos_usage_container: str = "user_usage"

    # Azure Content Safety
    azure_content_safety_endpoint: str
    azure_content_safety_key: str

    # Azure Key Vault (production path). When set, model_post_init() below overrides every
    # secret field with the Key Vault value (falling back to the .env value on any failure),
    # so local dev (blank) and production (set + managed identity) both work unmodified.
    azure_key_vault_url: str = ""

    # When true, every Azure SDK client in core/azure_clients.py authenticates via
    # DefaultAzureCredential (managed identity in Azure, `az login`/env vars locally) instead
    # of the *_api_key/*_account_key/*_key settings above. Off by default so local dev keeps
    # working from a plain .env with zero Azure AD setup required.
    azure_use_managed_identity: bool = False

    # Application Insights
    applicationinsights_connection_string: str = ""

    # Simulated auth
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 480

    # Cost estimation
    cost_per_1k_prompt_tokens: float = 0.00025
    cost_per_1k_completion_tokens: float = 0.002
    cost_per_1k_embedding_tokens: float = 0.00002

    # RAG tuning
    rag_top_k: int = 5
    rag_chunk_token_size: int = 800
    rag_chunk_overlap_pct: float = 0.15

    # Token quotas (§7.3, optional enhancement). None disables quota enforcement for that role.
    # Per-role only (not per-user) - see README Known Limitations for the per-user roadmap note.
    daily_token_quota_admin: int | None = None
    daily_token_quota_analyst: int | None = 50000
    daily_token_quota_viewer: int | None = 20000
    quota_warning_threshold_pct: float = 0.8

    @field_validator(
        "daily_token_quota_admin", "daily_token_quota_analyst", "daily_token_quota_viewer", mode="before"
    )
    @classmethod
    def _blank_quota_means_unlimited(cls, value: object) -> object:
        # A quota env var left blank (e.g. `DAILY_TOKEN_QUOTA_ADMIN=` in .env) should mean
        # "unlimited", not a validation error - pydantic-settings otherwise tries to parse the
        # empty string as an int and fails.
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    def model_post_init(self, __context: object) -> None:
        if not self.azure_key_vault_url:
            return
        from app.core.keyvault import SECRET_NAME_MAP, resolve_secret

        for field_name, secret_name in SECRET_NAME_MAP.items():
            current_value = getattr(self, field_name)
            resolved = resolve_secret(self.azure_key_vault_url, secret_name, current_value)
            setattr(self, field_name, resolved)


@lru_cache
def get_settings() -> Settings:
    return Settings()
