"""Extraction result export, base-schema extraction, filtering, and facets routes."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from juddges_search.info_extraction import BaseSchemaExtractor
from loguru import logger

from app.extraction_domain.shared import get_current_user, supabase
from app.models import (
    BaseSchemaDefinitionResponse,
    BaseSchemaExtractionRequest,
    BaseSchemaExtractionResponse,
    BaseSchemaExtractionResult,
    ExtractedDataFilterRequest,
    FacetCount,
    FacetCountsResponse,
    FilterFieldConfig,
    FilterOptionsResponse,
)

router = APIRouter()


@router.get(
    "/{job_id}/export",
    summary="Export extraction results",
    description="Export extraction results as CSV or Excel file. Returns file as download.",
)
async def export_extraction_results(
    job_id: str = Path(..., description="Extraction job ID"),
    format: str = Query("xlsx", description="Export format: 'xlsx' or 'csv'"),
    user_id: str = Depends(get_current_user),
):
    """
    Export extraction results to CSV or Excel format.

    **Path Parameters:**
    - **job_id**: The ID of the extraction job to export

    **Query Parameters:**
    - **format**: Export format ('xlsx' or 'csv', default: 'xlsx')

    **Authorization:**
    - Requires X-User-ID header
    - Only the job owner can export results

    **Returns:**
    - File download with extraction results
    - Each row represents a document
    - Columns are flattened schema fields
    """
    from io import BytesIO

    import pandas as pd
    from fastapi.responses import StreamingResponse

    # Validate format
    format = format.lower()
    if format not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid Format",
                "message": "Export format must be 'xlsx' or 'csv'",
                "code": "INVALID_FORMAT",
            },
        )

    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service Unavailable",
                "message": "Database service is unavailable",
                "code": "DATABASE_UNAVAILABLE",
            },
        )

    try:
        # Fetch job data from Supabase
        job_response = (
            supabase.table("extraction_jobs")
            .select("job_id, user_id, collection_id, schema_id, results, status")
            .eq("job_id", job_id)
            .single()
            .execute()
        )

        if not job_response.data:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "Job Not Found",
                    "message": f"Extraction job '{job_id}' was not found",
                    "code": "JOB_NOT_FOUND",
                },
            )

        job_data = job_response.data

        # Verify ownership
        if job_data.get("user_id") != user_id:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "Access Denied",
                    "message": "You do not have permission to export this job",
                    "code": "ACCESS_DENIED",
                },
            )

        results = job_data.get("results", [])

        if not results:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No Results",
                    "message": "This job has no results to export",
                    "code": "NO_RESULTS",
                },
            )

        # Fetch collection and schema names for filename
        collection_name = "extraction"
        schema_name = ""

        if job_data.get("collection_id"):
            try:
                col_response = (
                    supabase.table("collections")
                    .select("name")
                    .eq("id", job_data["collection_id"])
                    .single()
                    .execute()
                )
                if col_response.data:
                    collection_name = col_response.data.get("name", "extraction")
            except Exception:
                pass

        if job_data.get("schema_id"):
            try:
                schema_response = (
                    supabase.table("extraction_schemas")
                    .select("name")
                    .eq("id", job_data["schema_id"])
                    .single()
                    .execute()
                )
                if schema_response.data:
                    schema_name = schema_response.data.get("name", "")
            except Exception:
                pass

        # Filter completed results and flatten data
        rows = []
        for result in results:
            status = str(result.get("status", "")).lower()
            # Include completed, success, and partially_completed documents
            if status not in ("completed", "success", "partially_completed"):
                continue

            extracted_data = result.get("extracted_data", {})
            if not extracted_data:
                continue

            # Start with metadata
            row = {
                "document_id": result.get("document_id", ""),
                "status": result.get("status", ""),
                "completed_at": result.get("completed_at", ""),
            }

            # Flatten nested extracted_data
            def flatten_dict(d: dict, parent_key: str = "") -> dict:
                items = {}
                for k, v in d.items():
                    new_key = f"{parent_key}.{k}" if parent_key else k
                    if isinstance(v, dict):
                        items.update(flatten_dict(v, new_key))
                    elif isinstance(v, list):
                        # Convert lists to JSON string or comma-separated for simple values
                        if v and isinstance(v[0], dict):
                            items[new_key] = json.dumps(v, ensure_ascii=False)
                        else:
                            items[new_key] = ", ".join(str(x) for x in v)
                    else:
                        items[new_key] = v
                return items

            flattened = flatten_dict(extracted_data)
            row.update(flattened)
            rows.append(row)

        if not rows:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "No Completed Results",
                    "message": "No completed results with data available to export",
                    "code": "NO_COMPLETED_RESULTS",
                },
            )

        # Create DataFrame
        df = pd.DataFrame(rows)

        # Reorder columns: document_id, status, completed_at first, then alphabetically
        priority_cols = ["document_id", "status", "completed_at"]
        other_cols = sorted([c for c in df.columns if c not in priority_cols])
        ordered_cols = [c for c in priority_cols if c in df.columns] + other_cols
        df = df[ordered_cols]

        # Generate filename
        safe_collection = "".join(
            c if c.isalnum() or c in ("-", "_") else "-" for c in collection_name
        )
        safe_schema = (
            "".join(c if c.isalnum() or c in ("-", "_") else "-" for c in schema_name)
            if schema_name
            else ""
        )
        date_str = datetime.now(UTC).strftime("%Y-%m-%d")

        filename_parts = [p for p in [safe_collection, safe_schema, date_str] if p]
        filename = "_".join(filename_parts)

        # Create file in memory
        output = BytesIO()

        if format == "xlsx":
            # Excel export
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                sheet_name = (schema_name or "Results")[:31]  # Excel 31 char limit
                df.to_excel(writer, sheet_name=sheet_name, index=False)

            output.seek(0)
            media_type = (
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            filename_ext = f"{filename}.xlsx"
        else:
            # CSV export with UTF-8 BOM for Excel compatibility
            csv_content = df.to_csv(index=False)
            output.write(b"\xef\xbb\xbf")  # UTF-8 BOM
            output.write(csv_content.encode("utf-8"))

            output.seek(0)
            media_type = "text/csv; charset=utf-8"
            filename_ext = f"{filename}.csv"

        logger.info(
            f"Exporting job {job_id} as {format}: {len(rows)} rows, filename={filename_ext}"
        )

        return StreamingResponse(
            output,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{filename_ext}"',
                "X-Rows-Count": str(len(rows)),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.opt(exception=e).error("Error exporting job {}.", job_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Export Failed",
                "message": f"Failed to export results: {e!s}",
                "code": "EXPORT_FAILED",
            },
        )


# =============================================================================
# BASE SCHEMA EXTRACTION ENDPOINTS
# =============================================================================


@router.post(
    "/base-schema",
    response_model=BaseSchemaExtractionResponse,
    summary="Extract using universal base schema",
    description="Extract structured data from legal documents using the universal base schema with jurisdiction detection.",
)
async def extract_with_base_schema(
    request: BaseSchemaExtractionRequest,
) -> BaseSchemaExtractionResponse:
    """
    Extract structured data from legal documents using the universal base schema.

    This endpoint:
    1. Automatically detects document jurisdiction (EN_UK, PL, etc.)
    2. Applies jurisdiction-specific field mappings
    3. Extracts all 50+ fields defined in the base schema
    4. Stores extracted data in the extracted_data JSONB column

    The extracted data can then be used for faceted filtering and search.
    """
    from langchain_openai import ChatOpenAI

    results: list[BaseSchemaExtractionResult] = []
    successful = 0
    failed = 0

    # Initialize extractor with specified model
    model = ChatOpenAI(model=request.llm_name, temperature=0)
    extractor = BaseSchemaExtractor(model=model)

    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            },
        )

    for doc_id in request.document_ids:
        try:
            # Fetch document from Supabase
            doc_response = (
                supabase.table("judgments")
                .select("id, full_text, jurisdiction, court_name")
                .eq("id", doc_id)
                .maybe_single()
                .execute()
            )
            doc = doc_response.data if doc_response else None
            if not doc:
                results.append(
                    BaseSchemaExtractionResult(
                        document_id=doc_id,
                        jurisdiction="unknown",
                        status="failed",
                        error_message=f"Document not found: {doc_id}",
                    )
                )
                failed += 1
                continue

            # Extract full text
            full_text = doc.get("full_text", "")
            if not full_text:
                results.append(
                    BaseSchemaExtractionResult(
                        document_id=doc_id,
                        jurisdiction="unknown",
                        status="failed",
                        error_message="Document has no text content",
                    )
                )
                failed += 1
                continue

            # Perform extraction
            jurisdiction_override = request.jurisdiction_override  # type: ignore
            jurisdiction = doc.get("jurisdiction")
            language_hint = (
                "pl" if jurisdiction == "PL" else "en" if jurisdiction == "UK" else None
            )
            extracted_data, jurisdiction = await extractor.extract(
                document_text=full_text,
                language=language_hint,
                court_name=doc.get("court_name"),
                jurisdiction_override=jurisdiction_override,
                additional_instructions=request.additional_instructions,
            )

            # Validate extraction
            is_valid, validation_errors = extractor.validate_extraction(extracted_data)

            # Store in Supabase
            if supabase:
                try:
                    supabase.table("judgments").update(
                        {
                            "base_raw_extraction": extracted_data,
                            "base_extraction_status": "completed",
                            "base_extraction_model": request.llm_name,
                            "base_extraction_error": None,
                            "base_extracted_at": datetime.now(UTC).isoformat(),
                        }
                    ).eq("id", doc_id).execute()
                except Exception as e:
                    logger.warning(f"Failed to store extracted data for {doc_id}: {e}")

            results.append(
                BaseSchemaExtractionResult(
                    document_id=doc_id,
                    jurisdiction=jurisdiction,
                    status="completed",
                    extracted_data=extracted_data,
                    validation_errors=validation_errors if validation_errors else None,
                )
            )
            successful += 1

        except Exception as e:
            logger.opt(exception=e).error("Failed to extract from document {}.", doc_id)
            results.append(
                BaseSchemaExtractionResult(
                    document_id=doc_id,
                    jurisdiction="unknown",
                    status="failed",
                    error_message=str(e),
                )
            )
            failed += 1

    return BaseSchemaExtractionResponse(
        results=results,
        total_documents=len(request.document_ids),
        successful_extractions=successful,
        failed_extractions=failed,
    )


@router.post(
    "/base-schema/filter",
    summary="Filter documents by extracted data",
    description="Filter documents using extracted_data fields with faceted filtering and text search.",
)
async def filter_by_extracted_data(
    request: ExtractedDataFilterRequest,
):
    """
    Filter documents by extracted_data fields.

    Supports:
    - Faceted filtering on enum fields (e.g., appellant, appeal_outcome)
    - Full-text search on text fields (e.g., case_name, offender_representative_name)
    - Array containment queries (e.g., keywords, convict_offences)
    - Range queries on numeric fields (e.g., num_victims, case_number)
    """
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            },
        )

    try:
        # Call the stored function for filtering
        response = supabase.rpc(
            "filter_documents_by_extracted_data",
            {
                "p_filters": request.filters,
                "p_text_query": request.text_query,
                "p_limit": request.limit,
                "p_offset": request.offset,
            },
        ).execute()

        if response.data:
            documents = response.data
            total_count = documents[0].get("total_count", 0) if documents else 0
            return {
                "documents": documents,
                "total_count": total_count,
                "limit": request.limit,
                "offset": request.offset,
                "has_more": len(documents) == request.limit,
            }
        return {
            "documents": [],
            "total_count": 0,
            "limit": request.limit,
            "offset": request.offset,
            "has_more": False,
        }

    except Exception as e:
        logger.error(f"Failed to filter documents: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Filter Failed",
                "message": str(e),
                "code": "FILTER_FAILED",
            },
        )


@router.get(
    "/base-schema/facets/{field}",
    response_model=FacetCountsResponse,
    summary="Get facet counts for a field",
    description="Get value counts for a specific extracted_data field for faceted filtering.",
)
async def get_facet_counts(
    field: str = Path(description="Field name to get facet counts for"),
):
    """
    Get value counts for a specific extracted_data field.

    Returns a list of values and their occurrence counts, useful for
    building faceted filter UI components.
    """
    if not supabase:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Database Unavailable",
                "message": "Database connection not available.",
                "code": "DATABASE_UNAVAILABLE",
            },
        )

    try:
        # Call the stored function for facet counts
        response = supabase.rpc(
            "get_extracted_facet_counts", {"field_path": field}
        ).execute()

        counts = [
            FacetCount(value=row["value"], count=row["count"])
            for row in (response.data or [])
            if row.get("value")
        ]

        return FacetCountsResponse(
            field=field,
            counts=counts,
            total=sum(c.count for c in counts),
        )

    except Exception as e:
        logger.error(f"Failed to get facet counts for {field}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Facet Query Failed",
                "message": str(e),
                "code": "FACET_QUERY_FAILED",
            },
        )


@router.get(
    "/base-schema/definition",
    response_model=BaseSchemaDefinitionResponse,
    summary="Get localized base schema definition",
    description="Get the universal base schema in English and Polish variants for UI display.",
)
async def get_base_schema_definition() -> BaseSchemaDefinitionResponse:
    """
    Return the official base extraction schema used for judgments.

    The schema key and field names stay stable across locales; only display
    metadata (title/descriptions/enum labels) is localized.
    """
    extractor = BaseSchemaExtractor()

    return BaseSchemaDefinitionResponse(
        schema_key="universal_legal_document_base_schema",
        default_locale="en",
        available_locales=["en", "pl"],
        schemas={
            "en": extractor.get_schema_variant("en"),
            "pl": extractor.get_schema_variant("pl"),
        },
    )


@router.get(
    "/base-schema/filter-options",
    response_model=FilterOptionsResponse,
    summary="Get available filter options",
    description="Get all available filter fields with their types and configurations.",
)
async def get_filter_options():
    """
    Get all available filter fields for the base schema.

    Returns field configurations including:
    - Field name and type
    - Filter type (facet, text_search, range, array_contains)
    - UI label and order
    - Enum values for facet fields
    """
    extractor = BaseSchemaExtractor()
    filter_configs = extractor.get_filter_config()

    fields = [
        FilterFieldConfig(
            field=config["field"],
            type=config["type"],
            filter_type=config["filter_type"],
            label=config["label"],
            order=config["order"],
            description=config["description"],
            enum_values=config.get("enum_values"),
        )
        for config in filter_configs
    ]

    return FilterOptionsResponse(fields=fields)
