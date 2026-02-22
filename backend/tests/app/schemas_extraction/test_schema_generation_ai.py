"""
Comprehensive tests for AI-Powered Schema Generation.

Tests cover:
- Schema generation start (POST /api/schemas/generate)
- Schema refinement (POST /api/schemas/generate/{session_id}/refine)
- Get generation session (GET /api/schemas/generate/{session_id})
- Cancel generation (DELETE /api/schemas/generate/{session_id})
- Simple generation (POST /api/schema-generator/simple)
- Chat generation (POST /api/schema-generator/chat)
- Test generated schema (POST /api/schema-generator/test)
"""

import os
import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OpenAI API key required")
class TestSchemaGenerationStart:
    """Test initiating AI schema generation."""

    @pytest.mark.anyio
    async def test_start_generation_with_description(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test starting schema generation with text description."""
        request_data = {
            "description": "Extract party names, contract dates, and monetary amounts from legal contracts",
            "output_format": "json_schema"
        }
        
        response = await client.post(
            "/api/schemas/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "session_id" in data
        assert "schema" in data or "status" in data

    @pytest.mark.anyio
    async def test_start_generation_with_samples(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_document_text: str
    ):
        """Test generation with sample documents."""
        request_data = {
            "description": "Extract contract details",
            "sample_documents": [sample_document_text],
            "output_format": "json_schema"
        }
        
        response = await client.post(
            "/api/schemas/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = response.json()
        assert "session_id" in data

    @pytest.mark.anyio
    async def test_start_generation_minimal(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test generation with minimal information."""
        request_data = {
            "description": "Extract basic information"
        }
        
        response = await client.post(
            "/api/schemas/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 201

    @pytest.mark.anyio
    async def test_start_generation_without_auth(
        self,
        client: AsyncClient
    ):
        """Test generation fails without authentication."""
        request_data = {
            "description": "Test schema"
        }
        
        response = await client.post(
            "/api/schemas/generate",
            json=request_data
        )
        
        assert response.status_code in [401, 403]

    @pytest.mark.anyio
    async def test_start_generation_empty_description(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test generation fails with empty description."""
        request_data = {
            "description": ""
        }
        
        response = await client.post(
            "/api/schemas/generate",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 422


@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OpenAI API key required")
class TestSchemaRefinement:
    """Test refining generated schemas."""

    @pytest.mark.anyio
    async def test_refine_schema(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test refining a generated schema."""
        # Start generation
        start_response = await client.post(
            "/api/schemas/generate",
            json={"description": "Extract contract parties"},
            headers=auth_headers
        )
        session_id = start_response.json()["session_id"]
        
        # Refine it
        refine_data = {
            "refinement": "Also extract contract dates and amounts"
        }
        
        response = await client.post(
            f"/api/schemas/generate/{session_id}/refine",
            json=refine_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "schema" in data or "updated_schema" in data

    @pytest.mark.anyio
    async def test_refine_add_fields(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test refinement that adds new fields."""
        # Start generation
        start_response = await client.post(
            "/api/schemas/generate",
            json={"description": "Extract party names"},
            headers=auth_headers
        )
        session_id = start_response.json()["session_id"]
        
        # Add fields
        refine_data = {
            "refinement": "Add extraction of party addresses and contact information"
        }
        
        response = await client.post(
            f"/api/schemas/generate/{session_id}/refine",
            json=refine_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200

    @pytest.mark.anyio
    async def test_refine_nonexistent_session(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test refining non-existent session fails."""
        response = await client.post(
            "/api/schemas/generate/nonexistent-session-999/refine",
            json={"refinement": "Test"},
            headers=auth_headers
        )
        
        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_multiple_refinements(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test multiple sequential refinements."""
        # Start generation
        start_response = await client.post(
            "/api/schemas/generate",
            json={"description": "Extract contract info"},
            headers=auth_headers
        )
        session_id = start_response.json()["session_id"]
        
        # First refinement
        await client.post(
            f"/api/schemas/generate/{session_id}/refine",
            json={"refinement": "Add party names"},
            headers=auth_headers
        )
        
        # Second refinement
        response = await client.post(
            f"/api/schemas/generate/{session_id}/refine",
            json={"refinement": "Add contract dates"},
            headers=auth_headers
        )
        
        assert response.status_code == 200


@pytest.mark.integration
class TestGetGenerationSession:
    """Test retrieving generation session status."""

    @pytest.mark.anyio
    async def test_get_session_status(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test getting generation session status."""
        # Start generation
        start_response = await client.post(
            "/api/schemas/generate",
            json={"description": "Test schema"},
            headers=auth_headers
        )
        session_id = start_response.json()["session_id"]
        
        # Get session
        response = await client.get(
            f"/api/schemas/generate/{session_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data
        assert "status" in data or "schema" in data

    @pytest.mark.anyio
    async def test_get_nonexistent_session(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test getting non-existent session fails."""
        response = await client.get(
            "/api/schemas/generate/nonexistent-session-999",
            headers=auth_headers
        )
        
        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_get_session_without_auth(
        self,
        client: AsyncClient,
        mock_session_id: str
    ):
        """Test getting session fails without auth."""
        response = await client.get(
            f"/api/schemas/generate/{mock_session_id}"
        )
        
        assert response.status_code in [401, 403]


@pytest.mark.integration
class TestCancelGeneration:
    """Test canceling generation sessions."""

    @pytest.mark.anyio
    async def test_cancel_session(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test canceling a generation session."""
        # Start generation
        start_response = await client.post(
            "/api/schemas/generate",
            json={"description": "Test schema"},
            headers=auth_headers
        )
        session_id = start_response.json()["session_id"]
        
        # Cancel it
        response = await client.delete(
            f"/api/schemas/generate/{session_id}",
            headers=auth_headers
        )
        
        assert response.status_code == 204

    @pytest.mark.anyio
    async def test_cancel_nonexistent_session(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test canceling non-existent session."""
        response = await client.delete(
            "/api/schemas/generate/nonexistent-session-999",
            headers=auth_headers
        )
        
        assert response.status_code == 404

    @pytest.mark.anyio
    async def test_cancel_session_without_auth(
        self,
        client: AsyncClient,
        mock_session_id: str
    ):
        """Test canceling fails without auth."""
        response = await client.delete(
            f"/api/schemas/generate/{mock_session_id}"
        )
        
        assert response.status_code in [401, 403]


@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OpenAI API key required")
class TestSimpleGeneration:
    """Test simple schema generation endpoint."""

    @pytest.mark.anyio
    async def test_simple_generation(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test simple schema generation."""
        request_data = {
            "description": "Extract party names, dates, and amounts from contracts"
        }
        
        response = await client.post(
            "/api/schema-generator/simple",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "schema" in data
        assert "fields" in data["schema"]

    @pytest.mark.anyio
    async def test_simple_generation_with_sample(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_document_text: str
    ):
        """Test simple generation with sample text."""
        request_data = {
            "description": "Extract contract details",
            "sample_text": sample_document_text
        }
        
        response = await client.post(
            "/api/schema-generator/simple",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "schema" in data

    @pytest.mark.anyio
    async def test_simple_generation_contract_schema(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test generating contract schema."""
        request_data = {
            "description": "Extract party information, contract dates, amounts, and terms"
        }
        
        response = await client.post(
            "/api/schema-generator/simple",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        schema = data["schema"]
        
        # Check for expected fields
        field_names = [f["name"] for f in schema["fields"]]
        assert any("part" in name.lower() for name in field_names)

    @pytest.mark.anyio
    async def test_simple_generation_judgment_schema(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test generating court judgment schema."""
        request_data = {
            "description": "Extract judge names, case numbers, verdicts, and legal basis"
        }
        
        response = await client.post(
            "/api/schema-generator/simple",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        schema = data["schema"]
        
        # Check for expected fields
        field_names = [f["name"] for f in schema["fields"]]
        assert len(field_names) >= 2


@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OpenAI API key required")
class TestChatGeneration:
    """Test chat-based schema generation."""

    @pytest.mark.anyio
    async def test_chat_generation_initial(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test initial chat generation request."""
        request_data = {
            "message": "I need to extract party names from contracts",
            "conversation_id": None
        }
        
        response = await client.post(
            "/api/schema-generator/chat",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "conversation_id" in data
        assert "schema" in data or "response" in data

    @pytest.mark.anyio
    async def test_chat_generation_refinement(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test chat refinement in conversation."""
        # Initial request
        initial_response = await client.post(
            "/api/schema-generator/chat",
            json={
                "message": "Extract party names from contracts",
                "conversation_id": None
            },
            headers=auth_headers
        )
        conversation_id = initial_response.json()["conversation_id"]
        
        # Refinement
        refine_response = await client.post(
            "/api/schema-generator/chat",
            json={
                "message": "Also add contract date extraction",
                "conversation_id": conversation_id
            },
            headers=auth_headers
        )
        
        assert refine_response.status_code == 200
        data = refine_response.json()
        assert data["conversation_id"] == conversation_id

    @pytest.mark.anyio
    async def test_chat_generation_multiple_turns(
        self,
        client: AsyncClient,
        auth_headers: dict
    ):
        """Test multi-turn chat conversation."""
        # Turn 1
        response1 = await client.post(
            "/api/schema-generator/chat",
            json={"message": "Extract parties", "conversation_id": None},
            headers=auth_headers
        )
        conv_id = response1.json()["conversation_id"]
        
        # Turn 2
        response2 = await client.post(
            "/api/schema-generator/chat",
            json={"message": "Add dates", "conversation_id": conv_id},
            headers=auth_headers
        )
        
        # Turn 3
        response3 = await client.post(
            "/api/schema-generator/chat",
            json={"message": "Add amounts", "conversation_id": conv_id},
            headers=auth_headers
        )
        
        assert response3.status_code == 200


@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("OPENAI_API_KEY"), reason="OpenAI API key required")
class TestSchemaTest:
    """Test testing generated schemas."""

    @pytest.mark.anyio
    async def test_test_generated_schema(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_schema_data: dict,
        sample_document_text: str
    ):
        """Test a generated schema on sample text."""
        request_data = {
            "schema": sample_schema_data,
            "sample_text": sample_document_text
        }
        
        response = await client.post(
            "/api/schema-generator/test",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "extracted" in data or "results" in data

    @pytest.mark.anyio
    async def test_test_schema_with_document_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_schema_data: dict
    ):
        """Test schema with document ID."""
        request_data = {
            "schema": sample_schema_data,
            "document_id": "test-doc-123"
        }
        
        response = await client.post(
            "/api/schema-generator/test",
            json=request_data,
            headers=auth_headers
        )
        
        # May succeed or fail based on document existence
        assert response.status_code in [200, 404]

    @pytest.mark.anyio
    async def test_test_schema_validation_mode(
        self,
        client: AsyncClient,
        auth_headers: dict,
        sample_schema_data: dict,
        sample_document_text: str
    ):
        """Test schema with strict validation."""
        request_data = {
            "schema": sample_schema_data,
            "sample_text": sample_document_text,
            "validation_mode": "strict"
        }
        
        response = await client.post(
            "/api/schema-generator/test",
            json=request_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
