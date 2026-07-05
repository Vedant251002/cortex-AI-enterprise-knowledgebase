"""Lazily-instantiated singleton clients for every Azure SDK used in the project.

Each getter is cached with lru_cache so the client (and its underlying HTTP connection pool)
is created once per process. Import the getter functions, not the clients directly, so tests
can monkeypatch them easily.

Auth mode: every client below branches on settings.azure_use_managed_identity. When true, it
authenticates via a shared DefaultAzureCredential (managed identity in Azure, `az login` or
env-var credentials locally) instead of the corresponding *_api_key/*_account_key/*_key setting.
This is what actually exercises azure-identity end to end, not just as an unused dependency -
flip the flag on once a managed identity is assigned to the App Service/Container App and the
per-service key settings become unnecessary (Key Vault-resolved or not).
"""

from functools import lru_cache

from azure.ai.contentsafety import ContentSafetyClient
from azure.ai.documentintelligence import DocumentIntelligenceClient
from azure.core.credentials import AzureKeyCredential, TokenCredential
from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.container import ContainerProxy
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.storage.blob import BlobServiceClient, ContainerClient
from openai import AzureOpenAI

from app.core.config import Settings, get_settings


@lru_cache
def get_credential() -> TokenCredential:
    from azure.identity import DefaultAzureCredential

    return DefaultAzureCredential()


def _cognitive_services_token_provider():
    from azure.identity import get_bearer_token_provider

    return get_bearer_token_provider(get_credential(), "https://cognitiveservices.azure.com/.default")


def _key_or_credential(settings: Settings, key: str) -> AzureKeyCredential | TokenCredential:
    return get_credential() if settings.azure_use_managed_identity else AzureKeyCredential(key)


@lru_cache
def get_openai_client() -> AzureOpenAI:
    settings = get_settings()
    if settings.azure_use_managed_identity:
        return AzureOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            azure_ad_token_provider=_cognitive_services_token_provider(),
            api_version=settings.azure_openai_api_version,
        )
    return AzureOpenAI(
        azure_endpoint=settings.azure_openai_endpoint,
        api_key=settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )


@lru_cache
def get_embedding_client() -> AzureOpenAI:
    """Separate client for embedding calls - only differs from get_openai_client() when the
    embedding model's SKU has no quota on the main resource's region (see config.py)."""
    settings = get_settings()
    endpoint = settings.azure_openai_embedding_endpoint or settings.azure_openai_endpoint
    if settings.azure_use_managed_identity:
        return AzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=_cognitive_services_token_provider(),
            api_version=settings.azure_openai_api_version,
        )
    return AzureOpenAI(
        azure_endpoint=endpoint,
        api_key=settings.azure_openai_embedding_api_key or settings.azure_openai_api_key,
        api_version=settings.azure_openai_api_version,
    )


@lru_cache
def get_search_client() -> SearchClient:
    settings = get_settings()
    return SearchClient(
        endpoint=settings.azure_search_endpoint,
        index_name=settings.azure_search_index_name,
        credential=_key_or_credential(settings, settings.azure_search_api_key),
    )


@lru_cache
def get_search_index_client() -> SearchIndexClient:
    settings = get_settings()
    return SearchIndexClient(
        endpoint=settings.azure_search_endpoint,
        credential=_key_or_credential(settings, settings.azure_search_api_key),
    )


@lru_cache
def get_document_intelligence_client() -> DocumentIntelligenceClient:
    settings = get_settings()
    return DocumentIntelligenceClient(
        endpoint=settings.azure_docintel_endpoint,
        credential=_key_or_credential(settings, settings.azure_docintel_api_key),
    )


@lru_cache
def get_content_safety_client() -> ContentSafetyClient:
    settings = get_settings()
    return ContentSafetyClient(
        endpoint=settings.azure_content_safety_endpoint,
        credential=_key_or_credential(settings, settings.azure_content_safety_key),
    )


@lru_cache
def get_blob_service_client() -> BlobServiceClient:
    settings = get_settings()
    account_url = f"https://{settings.azure_storage_account_name}.blob.core.windows.net"
    credential = get_credential() if settings.azure_use_managed_identity else settings.azure_storage_account_key
    return BlobServiceClient(account_url=account_url, credential=credential)


@lru_cache
def get_blob_container_client() -> ContainerClient:
    settings = get_settings()
    client = get_blob_service_client().get_container_client(settings.azure_storage_container_name)
    if not client.exists():
        client.create_container()
    return client


@lru_cache
def get_cosmos_client() -> CosmosClient:
    settings = get_settings()
    credential = get_credential() if settings.azure_use_managed_identity else settings.azure_cosmos_key
    return CosmosClient(url=settings.azure_cosmos_endpoint, credential=credential)


@lru_cache
def get_audit_container() -> ContainerProxy:
    settings = get_settings()
    db = get_cosmos_client().create_database_if_not_exists(settings.azure_cosmos_database_name)
    return db.create_container_if_not_exists(
        id=settings.azure_cosmos_audit_container,
        partition_key=PartitionKey(path="/user_id"),
    )


@lru_cache
def get_usage_container() -> ContainerProxy:
    settings = get_settings()
    db = get_cosmos_client().create_database_if_not_exists(settings.azure_cosmos_database_name)
    return db.create_container_if_not_exists(
        id=settings.azure_cosmos_usage_container,
        partition_key=PartitionKey(path="/user_id"),
    )


@lru_cache
def get_documents_container() -> ContainerProxy:
    """Tracks per-document ingestion status (uploaded/extracting/chunking/indexing/ready/failed).

    Not part of the original data model (which only defines audit_logs/user_usage), but
    real-time upload status polling needs its own container. Partitioned by document_category
    since RBAC-filtered listing (GET /documents) is the main query pattern.
    """
    settings = get_settings()
    db = get_cosmos_client().create_database_if_not_exists(settings.azure_cosmos_database_name)
    return db.create_container_if_not_exists(
        id=getattr(settings, "azure_cosmos_documents_container", "documents"),
        partition_key=PartitionKey(path="/document_category"),
    )
