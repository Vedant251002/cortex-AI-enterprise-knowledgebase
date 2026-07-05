"""Creates the `kb-chunks` Azure AI Search index used by the RAG ingestion pipeline.

Idempotent: if the index already exists, create_or_update_index() will update it in place
(field additions are safe; changing an existing field's type is not supported by the service
and will raise - that's intentional, it should fail loudly rather than silently drift).

Run as a module from backend/:
    python -m scripts.create_search_index
"""

import logging

from azure.search.documents.indexes.models import (
    HnswAlgorithmConfiguration,
    SearchableField,
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SemanticConfiguration,
    SemanticField,
    SemanticPrioritizedFields,
    SemanticSearch,
    SimpleField,
    VectorSearch,
    VectorSearchProfile,
)

from app.core.azure_clients import get_search_index_client
from app.core.config import get_settings

logger = logging.getLogger(__name__)

EMBEDDING_DIMENSIONS = 1536
HNSW_ALGORITHM_NAME = "kb-hnsw-algorithm"
VECTOR_PROFILE_NAME = "kb-vector-profile"
SEMANTIC_CONFIG_NAME = "kb-semantic-config"


def build_index(index_name: str) -> SearchIndex:
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchableField(name="content", type=SearchFieldDataType.String),
        SearchField(
            name="content_vector",
            type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
            searchable=True,
            vector_search_dimensions=EMBEDDING_DIMENSIONS,
            vector_search_profile_name=VECTOR_PROFILE_NAME,
        ),
        SearchableField(name="document_name", type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="page_number", type=SearchFieldDataType.Int32, filterable=True, sortable=True),
        SearchableField(name="section_heading", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="chunk_index", type=SearchFieldDataType.Int32, filterable=True, sortable=True),
        # RBAC filter field - every query MUST filter on this against the caller's allowed categories.
        SimpleField(name="document_category", type=SearchFieldDataType.String, filterable=True, facetable=True),
        SimpleField(name="uploaded_by", type=SearchFieldDataType.String, filterable=True),
        SimpleField(name="upload_timestamp", type=SearchFieldDataType.String, filterable=True, sortable=True),
    ]

    vector_search = VectorSearch(
        algorithms=[HnswAlgorithmConfiguration(name=HNSW_ALGORITHM_NAME)],
        profiles=[
            VectorSearchProfile(
                name=VECTOR_PROFILE_NAME,
                algorithm_configuration_name=HNSW_ALGORITHM_NAME,
            )
        ],
    )

    semantic_search = SemanticSearch(
        default_configuration_name=SEMANTIC_CONFIG_NAME,
        configurations=[
            SemanticConfiguration(
                name=SEMANTIC_CONFIG_NAME,
                prioritized_fields=SemanticPrioritizedFields(
                    title_field=SemanticField(field_name="document_name"),
                    content_fields=[SemanticField(field_name="content")],
                    keywords_fields=[SemanticField(field_name="section_heading")],
                ),
            )
        ],
    )

    return SearchIndex(
        name=index_name,
        fields=fields,
        vector_search=vector_search,
        semantic_search=semantic_search,
    )


def create_index_if_not_exists() -> SearchIndex:
    settings = get_settings()
    client = get_search_index_client()
    index_name = settings.azure_search_index_name

    existing_names = set(client.list_index_names())
    if index_name in existing_names:
        logger.info("Search index '%s' already exists; leaving it untouched.", index_name)
        return client.get_index(index_name)

    index = build_index(index_name)
    result = client.create_or_update_index(index)
    logger.info("Created search index '%s'.", index_name)
    return result


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    create_index_if_not_exists()


if __name__ == "__main__":
    main()
