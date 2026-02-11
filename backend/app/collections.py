from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Path
from pydantic import BaseModel, Field, field_validator
from juddges_search.db.supabase_db import get_collections_db
from app.models import validate_id_format
from loguru import logger

router = APIRouter(prefix="/collections", tags=["collections"])


class Collection(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: str
    updated_at: str


class CollectionWithDocuments(Collection):
    documents: List[str] = []
    document_count: int = 0


class CreateCollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)


class UpdateCollectionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class AddDocumentRequest(BaseModel):
    document_id: str = Field(min_length=1, max_length=255)
    collection_id: Optional[str] = Field(
        None, description="Collection ID (ignored, from URL)"
    )

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, v: str) -> str:
        return validate_id_format(v, "document_id")


def get_current_user(x_user_id: str = Header(..., alias="X-User-ID")) -> str:
    """Extract user ID from request header."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID header is required")
    return x_user_id


def transform_collection(data) -> CollectionWithDocuments:
    documents = []
    # Use collection_supabase_documents for Weaviate document IDs (text type)
    if "collection_supabase_documents" in data:
        # Keep document IDs as strings (they are string identifiers from Weaviate)
        documents = [str(cd["document_id"]) for cd in data["collection_supabase_documents"]]

    # Use document_count if available, otherwise count from documents list
    document_count = data.get("document_count", len(documents))

    return CollectionWithDocuments(
        id=data["id"],
        user_id=data["user_id"],
        name=data["name"],
        description=data.get("description"),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        documents=documents,
        document_count=document_count,
    )


@router.get("", response_model=List[CollectionWithDocuments])
async def list_collections(
    db=Depends(get_collections_db), user_id: str = Depends(get_current_user)
):
    collections = await db.get_user_collections(user_id)
    return [transform_collection(c) for c in collections]


@router.post("", response_model=Collection)
async def create_collection(
    request: CreateCollectionRequest,
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    collection = await db.create_collection(user_id, request.name, request.description)
    return Collection(**collection)


@router.get("/{collection_id}", response_model=CollectionWithDocuments)
async def get_collection(
    collection_id: str = Path(..., description="Collection ID to retrieve"),
    limit: Optional[int] = None,
    offset: int = 0,
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Get a collection with its documents.

    Args:
        collection_id: Collection ID to retrieve
        limit: Maximum number of documents to return (default: all). Use 20 for initial load.
        offset: Number of documents to skip (for pagination)
    """
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    collection = await db.find_collection(collection_id, user_id, limit=limit, offset=offset)
    if not collection:
        raise HTTPException(404, "Collection not found")
    return transform_collection(collection)


@router.put("/{collection_id}", response_model=Collection)
async def update_collection(
    request: UpdateCollectionRequest,
    collection_id: str = Path(..., description="Collection ID to update"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    collection = await db.update_collection(collection_id, user_id, request.name)
    return Collection(**collection)


@router.delete("/{collection_id}")
async def delete_collection(
    collection_id: str = Path(..., description="Collection ID to delete"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    await db.delete_collection(collection_id, user_id)
    return {"message": "Collection deleted successfully"}


@router.get("/{collection_id}/documents")
async def get_collection_documents(
    collection_id: str = Path(..., description="Collection ID to get documents from"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Get all documents in a collection with their full metadata."""
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    documents = await db.get_collection_documents(collection_id, user_id)
    return documents


@router.post("/{collection_id}/documents")
async def add_document(
    request: AddDocumentRequest,
    collection_id: str = Path(..., description="Collection ID to add document to"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    await db.add_document(collection_id, request.document_id, user_id)
    return {
        "message": "Document added successfully",
        "document_id": request.document_id,
    }


class AddDocumentsRequest(BaseModel):
    """Request model for adding multiple documents to a collection."""

    document_ids: List[str] = Field(description="List of document IDs to add", min_length=1)

    @field_validator("document_ids")
    @classmethod
    def validate_document_ids(cls, v: List[str]) -> List[str]:
        validated = []
        for doc_id in v:
            validated.append(validate_id_format(doc_id.strip(), "document_id"))
        return validated


@router.post("/{collection_id}/documents/batch")
async def add_documents_batch(
    request: AddDocumentsRequest,
    collection_id: str = Path(..., description="Collection ID to add documents to"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Add multiple documents to a collection at once."""
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    added = []
    failed = []

    for document_id in request.document_ids:
        try:
            await db.add_document(collection_id, document_id, user_id)
            added.append(document_id)
        except Exception as e:
            logger.warning(f"Failed to add document {document_id}: {e}")
            failed.append({"document_id": document_id, "error": str(e)})

    return {
        "message": f"Added {len(added)} documents, {len(failed)} failed",
        "added": added,
        "failed": failed,
        "total_requested": len(request.document_ids),
    }


class RemoveDocumentRequest(BaseModel):
    """Request model for removing a document from a collection."""

    document_id: str = Field(description="ID of the document to remove", min_length=1, max_length=255)

    @field_validator("document_id")
    @classmethod
    def validate_document_id(cls, v: str) -> str:
        return validate_id_format(v, "document_id")


@router.delete("/{collection_id}/documents")
async def remove_document_by_body(
    request: RemoveDocumentRequest,
    collection_id: str = Path(..., description="Collection ID to remove document from"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Remove a document from a collection (expects document_id in request body)."""
    # Validate collection_id
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        logger.warning(f"Invalid collection_id format: {collection_id}")
        raise HTTPException(status_code=400, detail=str(e))

    await db.remove_document(collection_id, request.document_id, user_id)
    return {"message": "Document removed successfully"}


@router.delete("/{collection_id}/documents/{document_id}")
async def remove_document_by_url(
    collection_id: str = Path(..., description="Collection ID to remove document from"),
    document_id: str = Path(..., description="Document ID to remove"),
    db=Depends(get_collections_db),
    user_id: str = Depends(get_current_user),
):
    """Remove a document from a collection (document_id in URL path)."""
    # Validate both IDs
    try:
        collection_id = validate_id_format(collection_id, "collection_id")
        document_id = validate_id_format(document_id, "document_id")
    except ValueError as e:
        logger.warning(f"Invalid ID format: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

    await db.remove_document(collection_id, document_id, user_id)
    return {"message": "Document removed successfully"}
