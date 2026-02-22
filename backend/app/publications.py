"""Publications API endpoints for managing research publications with schema and collection links."""

from enum import Enum
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, Header, Path, Query
from pydantic import BaseModel, Field, field_validator
from juddges_search.db.supabase_db import get_publications_db
from app.models import validate_id_format
from loguru import logger


router = APIRouter(prefix="/publications", tags=["publications"])


# Enums matching database types
class PublicationProject(str, Enum):
    JUDDGES = "JuDDGES"
    AI_TAX = "AI-TAX"


class PublicationType(str, Enum):
    JOURNAL = "journal"
    CONFERENCE = "conference"
    PREPRINT = "preprint"
    WORKSHOP = "workshop"


class PublicationStatus(str, Enum):
    PUBLISHED = "published"
    ACCEPTED = "accepted"
    UNDER_REVIEW = "under_review"
    PREPRINT = "preprint"


# Request/Response Models
class PublicationAuthor(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    affiliation: Optional[str] = Field(None, max_length=500)
    url: Optional[str] = Field(None, max_length=500)


class PublicationLinks(BaseModel):
    pdf: Optional[str] = None
    arxiv: Optional[str] = None
    doi: Optional[str] = None
    code: Optional[str] = None
    website: Optional[str] = None
    video: Optional[str] = None


class SchemaLink(BaseModel):
    schema_id: str
    description: Optional[str] = None
    created_at: Optional[str] = None


class CollectionLink(BaseModel):
    collection_id: str
    description: Optional[str] = None
    created_at: Optional[str] = None


class ExtractionJobLink(BaseModel):
    job_id: str
    job_status: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[str] = None


class Publication(BaseModel):
    id: str
    title: str
    authors: List[PublicationAuthor]
    venue: str
    venue_short: Optional[str] = None
    year: int
    month: Optional[int] = None
    abstract: str
    project: PublicationProject
    type: PublicationType
    status: PublicationStatus
    links: PublicationLinks
    tags: Optional[List[str]] = None
    citations: Optional[int] = None
    manuscript_number: Optional[str] = None
    acceptance_date: Optional[str] = None
    publication_date: Optional[str] = None
    created_at: str
    updated_at: str


class PublicationWithResources(Publication):
    schemas: List[SchemaLink] = []
    collections: List[CollectionLink] = []
    extraction_jobs: List[ExtractionJobLink] = []


class CreatePublicationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    authors: List[PublicationAuthor] = Field(min_length=1)
    venue: str = Field(min_length=1, max_length=500)
    venue_short: Optional[str] = Field(None, max_length=50)
    year: int = Field(ge=1900, le=2100)
    month: Optional[int] = Field(None, ge=1, le=12)
    abstract: str = Field(min_length=1, max_length=10000)
    project: PublicationProject
    type: PublicationType
    status: PublicationStatus
    links: Optional[PublicationLinks] = None
    tags: Optional[List[str]] = None
    citations: Optional[int] = Field(None, ge=0)
    manuscript_number: Optional[str] = Field(None, max_length=100)
    acceptance_date: Optional[str] = None
    publication_date: Optional[str] = None
    schema_ids: Optional[List[str]] = None
    collection_ids: Optional[List[str]] = None
    extraction_job_ids: Optional[List[str]] = None


class UpdatePublicationRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    authors: Optional[List[PublicationAuthor]] = None
    venue: Optional[str] = Field(None, min_length=1, max_length=500)
    venue_short: Optional[str] = Field(None, max_length=50)
    year: Optional[int] = Field(None, ge=1900, le=2100)
    month: Optional[int] = Field(None, ge=1, le=12)
    abstract: Optional[str] = Field(None, min_length=1, max_length=10000)
    project: Optional[PublicationProject] = None
    type: Optional[PublicationType] = None
    status: Optional[PublicationStatus] = None
    links: Optional[PublicationLinks] = None
    tags: Optional[List[str]] = None
    citations: Optional[int] = Field(None, ge=0)
    manuscript_number: Optional[str] = Field(None, max_length=100)
    acceptance_date: Optional[str] = None
    publication_date: Optional[str] = None


class LinkSchemaRequest(BaseModel):
    schema_id: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("schema_id")
    @classmethod
    def validate_schema_id(cls, v: str) -> str:
        return validate_id_format(v, "schema_id")


class LinkCollectionRequest(BaseModel):
    collection_id: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("collection_id")
    @classmethod
    def validate_collection_id(cls, v: str) -> str:
        return validate_id_format(v, "collection_id")


class LinkExtractionJobRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

    @field_validator("job_id")
    @classmethod
    def validate_job_id(cls, v: str) -> str:
        return validate_id_format(v, "job_id")


def get_current_user(x_user_id: str = Header(None, alias="X-User-ID")) -> Optional[str]:
    """Extract optional user ID from request header."""
    return x_user_id


def transform_publication(data: dict) -> PublicationWithResources:
    """Transform database response to PublicationWithResources model."""
    schemas = []
    if "publication_schemas" in data:
        for ps in data.get("publication_schemas", []):
            schemas.append(
                SchemaLink(
                    schema_id=ps["schema_id"],
                    description=ps.get("description"),
                    created_at=ps.get("created_at"),
                )
            )

    collections = []
    if "publication_collections" in data:
        for pc in data.get("publication_collections", []):
            collections.append(
                CollectionLink(
                    collection_id=pc["collection_id"],
                    description=pc.get("description"),
                    created_at=pc.get("created_at"),
                )
            )

    extraction_jobs = []
    if "publication_extraction_jobs" in data:
        for pj in data.get("publication_extraction_jobs", []):
            extraction_jobs.append(
                ExtractionJobLink(
                    job_id=pj["job_id"],
                    description=pj.get("description"),
                    created_at=pj.get("created_at"),
                )
            )

    return PublicationWithResources(
        id=data["id"],
        title=data["title"],
        authors=[PublicationAuthor(**a) for a in data.get("authors", [])],
        venue=data["venue"],
        venue_short=data.get("venue_short"),
        year=data["year"],
        month=data.get("month"),
        abstract=data["abstract"],
        project=data["project"],
        type=data["type"],
        status=data["status"],
        links=PublicationLinks(**data.get("links", {})),
        tags=data.get("tags"),
        citations=data.get("citations"),
        manuscript_number=data.get("manuscript_number"),
        acceptance_date=data.get("acceptance_date"),
        publication_date=data.get("publication_date"),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        schemas=schemas,
        collections=collections,
        extraction_jobs=extraction_jobs,
    )


@router.get("", response_model=List[PublicationWithResources])
async def list_publications(
    project: Optional[PublicationProject] = Query(
        None, description="Filter by project"
    ),
    year: Optional[int] = Query(None, ge=1900, le=2100, description="Filter by year"),
    status: Optional[PublicationStatus] = Query(None, description="Filter by status"),
    pub_type: Optional[PublicationType] = Query(
        None, alias="type", description="Filter by type"
    ),
    limit: int = Query(100, ge=1, le=500, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Number of results to skip"),
    db=Depends(get_publications_db),
):
    """List all publications with optional filtering."""
    publications = await db.get_publications(
        project=project.value if project else None,
        year=year,
        status=status.value if status else None,
        pub_type=pub_type.value if pub_type else None,
        limit=limit,
        offset=offset,
    )
    return [transform_publication(p) for p in publications]


@router.post("", response_model=PublicationWithResources, status_code=201)
async def create_publication(
    request: CreatePublicationRequest,
    db=Depends(get_publications_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    """Create a new publication."""
    data = {
        "title": request.title,
        "authors": [a.model_dump() for a in request.authors],
        "venue": request.venue,
        "venue_short": request.venue_short,
        "year": request.year,
        "month": request.month,
        "abstract": request.abstract,
        "project": request.project.value,
        "type": request.type.value,
        "status": request.status.value,
        "links": request.links.model_dump() if request.links else {},
        "tags": request.tags or [],
        "citations": request.citations,
        "manuscript_number": request.manuscript_number,
        "acceptance_date": request.acceptance_date,
        "publication_date": request.publication_date,
        "user_id": user_id,
    }

    if request.schema_ids:
        data["schema_ids"] = request.schema_ids
    if request.collection_ids:
        data["collection_ids"] = request.collection_ids
    if request.extraction_job_ids:
        data["extraction_job_ids"] = request.extraction_job_ids

    publication = await db.create_publication(data)
    return transform_publication(publication)


@router.get("/{publication_id}", response_model=PublicationWithResources)
async def get_publication(
    publication_id: str = Path(..., description="Publication ID to retrieve"),
    db=Depends(get_publications_db),
):
    """Get a specific publication by ID."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        logger.warning(f"Invalid publication_id format: {publication_id}")
        raise HTTPException(status_code=400, detail=str(e))

    publication = await db.get_publication(publication_id)
    if not publication:
        raise HTTPException(status_code=404, detail="Publication not found")
    return transform_publication(publication)


@router.put("/{publication_id}", response_model=PublicationWithResources)
async def update_publication(
    request: UpdatePublicationRequest,
    publication_id: str = Path(..., description="Publication ID to update"),
    db=Depends(get_publications_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    """Update an existing publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        logger.warning(f"Invalid publication_id format: {publication_id}")
        raise HTTPException(status_code=400, detail=str(e))

    # Only include non-None fields
    data = {}
    if request.title is not None:
        data["title"] = request.title
    if request.authors is not None:
        data["authors"] = [a.model_dump() for a in request.authors]
    if request.venue is not None:
        data["venue"] = request.venue
    if request.venue_short is not None:
        data["venue_short"] = request.venue_short
    if request.year is not None:
        data["year"] = request.year
    if request.month is not None:
        data["month"] = request.month
    if request.abstract is not None:
        data["abstract"] = request.abstract
    if request.project is not None:
        data["project"] = request.project.value
    if request.type is not None:
        data["type"] = request.type.value
    if request.status is not None:
        data["status"] = request.status.value
    if request.links is not None:
        data["links"] = request.links.model_dump()
    if request.tags is not None:
        data["tags"] = request.tags
    if request.citations is not None:
        data["citations"] = request.citations
    if request.manuscript_number is not None:
        data["manuscript_number"] = request.manuscript_number
    if request.acceptance_date is not None:
        data["acceptance_date"] = request.acceptance_date
    if request.publication_date is not None:
        data["publication_date"] = request.publication_date

    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")

    publication = await db.update_publication(publication_id, data)
    return transform_publication(publication)


@router.delete("/{publication_id}")
async def delete_publication(
    publication_id: str = Path(..., description="Publication ID to delete"),
    db=Depends(get_publications_db),
    user_id: Optional[str] = Depends(get_current_user),
):
    """Delete a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        logger.warning(f"Invalid publication_id format: {publication_id}")
        raise HTTPException(status_code=400, detail=str(e))

    success = await db.delete_publication(publication_id)
    if not success:
        raise HTTPException(status_code=404, detail="Publication not found")
    return {"message": "Publication deleted successfully"}


# Schema linking endpoints
@router.get("/{publication_id}/schemas", response_model=List[SchemaLink])
async def get_publication_schemas(
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Get all schemas linked to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    schemas = await db.get_publication_schemas(publication_id)
    return [
        SchemaLink(
            schema_id=s["schema_id"],
            description=s.get("description"),
            created_at=s.get("created_at"),
        )
        for s in schemas
    ]


@router.post("/{publication_id}/schemas")
async def add_schema_link(
    request: LinkSchemaRequest,
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Link a schema to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.add_schema_link(publication_id, request.schema_id, request.description)
    return {"message": "Schema linked successfully", "schema_id": request.schema_id}


@router.delete("/{publication_id}/schemas/{schema_id}")
async def remove_schema_link(
    publication_id: str = Path(..., description="Publication ID"),
    schema_id: str = Path(..., description="Schema ID to unlink"),
    db=Depends(get_publications_db),
):
    """Remove a schema link from a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
        schema_id = validate_id_format(schema_id, "schema_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.remove_schema_link(publication_id, schema_id)
    return {"message": "Schema unlinked successfully"}


# Collection linking endpoints
@router.get("/{publication_id}/collections", response_model=List[CollectionLink])
async def get_publication_collections(
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Get all collections linked to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    collections = await db.get_publication_collections(publication_id)
    return [
        CollectionLink(
            collection_id=c["collection_id"],
            description=c.get("description"),
            created_at=c.get("created_at"),
        )
        for c in collections
    ]


@router.post("/{publication_id}/collections")
async def add_collection_link(
    request: LinkCollectionRequest,
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Link a collection to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.add_collection_link(
        publication_id, request.collection_id, request.description
    )
    return {
        "message": "Collection linked successfully",
        "collection_id": request.collection_id,
    }


@router.delete("/{publication_id}/collections/{collection_id}")
async def remove_collection_link(
    publication_id: str = Path(..., description="Publication ID"),
    collection_id: str = Path(..., description="Collection ID to unlink"),
    db=Depends(get_publications_db),
):
    """Remove a collection link from a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
        collection_id = validate_id_format(collection_id, "collection_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.remove_collection_link(publication_id, collection_id)
    return {"message": "Collection unlinked successfully"}


# Extraction job linking endpoints
@router.get("/{publication_id}/extraction-jobs", response_model=List[ExtractionJobLink])
async def get_publication_extraction_jobs(
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Get all extraction jobs linked to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    jobs = await db.get_publication_extraction_jobs(publication_id)
    return [
        ExtractionJobLink(
            job_id=j["job_id"],
            description=j.get("description"),
            created_at=j.get("created_at"),
        )
        for j in jobs
    ]


@router.post("/{publication_id}/extraction-jobs")
async def add_extraction_job_link(
    request: LinkExtractionJobRequest,
    publication_id: str = Path(..., description="Publication ID"),
    db=Depends(get_publications_db),
):
    """Link an extraction job to a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.add_extraction_job_link(
        publication_id, request.job_id, request.description
    )
    return {"message": "Extraction job linked successfully", "job_id": request.job_id}


@router.delete("/{publication_id}/extraction-jobs/{job_id}")
async def remove_extraction_job_link(
    publication_id: str = Path(..., description="Publication ID"),
    job_id: str = Path(..., description="Extraction job ID to unlink"),
    db=Depends(get_publications_db),
):
    """Remove an extraction job link from a publication."""
    try:
        publication_id = validate_id_format(publication_id, "publication_id")
        job_id = validate_id_format(job_id, "job_id")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.remove_extraction_job_link(publication_id, job_id)
    return {"message": "Extraction job unlinked successfully"}
