from copy import deepcopy

import pytest
from juddges_search.info_extraction.extractor import InformationExtractor
from pydantic import ValidationError

from app.models import DocumentExtractionRequest

schema_ids = InformationExtractor.list_schemas()
prompt_ids = InformationExtractor.list_prompts()
user_schema = {
    "legal_basis": {
        "type": "array",
        "items": {
            "type": "string",
            "enum": [
                "art 23 KC",
                "art 24 KC",
            ],
        },
        "description": "Legal basis - articles of the Civil Code",
        "minItems": 1,
        "required": True,
    }
}


class TestDocumentExtractionRequest:
    @pytest.mark.parametrize("schema_id", schema_ids)
    @pytest.mark.parametrize("prompt_id", prompt_ids)
    def test_valid_request(self, schema_id: str, prompt_id: str) -> None:
        DocumentExtractionRequest(
            collection_id="123",
            schema_id=schema_id,
            prompt_id=prompt_id,
            user_schema=None,
            extraction_context="Test extraction from legal documents",
            additional_instructions="Be precise and thorough",
            language="pl",
            document_ids=["123"],
        )

    def test_invalid_request(self) -> None:
        with pytest.raises(ValidationError):
            DocumentExtractionRequest(
                collection_id="123",
                schema_id=None,
                user_schema=None,
                prompt_id="123",
                extraction_context="Test extraction from legal documents",
                additional_instructions="Be precise and thorough",
                language="pl",
                document_ids=["123"],
            )

    def test_passed_schema_id_and_user_schema(self) -> None:
        with pytest.raises(ValidationError):
            DocumentExtractionRequest(
                collection_id="123",
                schema_id=schema_ids[0],
                user_schema=user_schema,
                prompt_id=prompt_ids[0],
                extraction_context="Test extraction from legal documents",
                additional_instructions="Be precise and thorough",
                language="pl",
                document_ids=["123"],
            )

    def test_valid_user_schema(self) -> None:
        DocumentExtractionRequest(
            collection_id="123",
            user_schema=user_schema,
            prompt_id=prompt_ids[0],
            extraction_context="Test extraction from legal documents",
            additional_instructions="Be precise and thorough",
            language="pl",
            document_ids=["123"],
        )

    def test_missing_required_field(self) -> None:
        for field_name in InformationExtractor.SCHEMA_REQUIRED_FIELDS:
            invalid_schema = deepcopy(user_schema)
            del invalid_schema["legal_basis"][field_name]
            with pytest.raises(ValidationError):
                DocumentExtractionRequest(
                    collection_id="123",
                    schema_id="",
                    user_schema=invalid_schema,
                    prompt_id=prompt_ids[0],
                    extraction_context="Test extraction from legal documents",
                    additional_instructions="Be precise and thorough",
                    language="pl",
                    document_ids=["123"],
                )

    def test_missing_array_items(self) -> None:
        with pytest.raises(ValidationError):
            DocumentExtractionRequest(
                collection_id="123",
                schema_id="",
                user_schema={
                    "legal_basis": {
                        "type": "array",
                        "description": "Legal basis - articles of the Civil Code",
                        "minItems": 1,
                        "required": True,
                    }
                },
                prompt_id=prompt_ids[0],
                extraction_context="Test extraction from legal documents",
                additional_instructions="Be precise and thorough",
                language="pl",
                document_ids=["123"],
            )


class TestDocumentRetrievalCleanup:
    """#148: drop deprecated no-op request fields; type pagination as a model."""

    def test_request_drops_deprecated_fields(self):
        from app.models import DocumentRetrievalRequest

        fields = set(DocumentRetrievalRequest.model_fields)
        assert "max_documents" not in fields
        assert "max_threshold" not in fields

    def test_request_silently_ignores_legacy_fields(self):
        # Removing the fields must not 422 old clients still sending them.
        from app.models import DocumentRetrievalRequest

        req = DocumentRetrievalRequest.model_validate(
            {
                "question": "q",
                "mode": "rabbit",
                "max_documents": 5,
                "max_threshold": 100,
            }
        )
        assert req.question == "q"
        assert not hasattr(req, "max_documents")

    def test_response_pagination_is_typed_model(self):
        from app.models import DocumentRetrievalResponse, PaginationMetadata

        ann = DocumentRetrievalResponse.model_fields["pagination"].annotation
        # PaginationMetadata must appear in the (optional) annotation.
        assert PaginationMetadata in getattr(ann, "__args__", (ann,))

    def test_response_accepts_pagination_metadata(self):
        from app.models import DocumentRetrievalResponse, PaginationMetadata

        resp = DocumentRetrievalResponse(
            question="q",
            chunks=[],
            documents=[],
            pagination=PaginationMetadata(offset=0, limit=20, loaded_count=0),
        )
        assert isinstance(resp.pagination, PaginationMetadata)
