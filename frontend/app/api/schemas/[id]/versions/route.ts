import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logger } from "@/lib/logger";

/**
 * GET /api/schemas/[id]/versions
 * Fetch version history for a specific schema
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const schemaId = id;

    // First get the current version from the schema
    const { data: schema, error: schemaError } = await supabase
      .from('extraction_schemas')
      .select('schema_version')
      .eq('id', schemaId)
      .single();

    if (schemaError) {
      logger.error('Error fetching schema:', schemaError);
      return NextResponse.json(
        { error: 'Schema not found', details: schemaError.message },
        { status: 404 }
      );
    }

    const currentVersion = schema?.schema_version || 1;

    // Fetch all versions for this schema, ordered by version number descending
    const { data: versions, error } = await supabase
      .from('schema_versions')
      .select(`
        id,
        schema_id,
        version_number,
        change_type,
        change_summary,
        changed_fields,
        diff_from_previous,
        user_id,
        created_at
      `)
      .eq('schema_id', schemaId)
      .order('version_number', { ascending: false });

    if (error) {
      logger.error('Error fetching schema versions:', error);
      return NextResponse.json(
        { error: 'Failed to fetch schema versions', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      schema_id: schemaId,
      current_version: currentVersion,
      versions: versions || [],
      total: versions?.length || 0,
    });
  } catch (error) {
    logger.error('Unexpected error in versions API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schemas/[id]/versions/rollback
 * Rollback schema to a specific version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const schemaId = id;
    const body = await request.json();
    const { version_number } = body;

    if (!version_number || typeof version_number !== 'number') {
      return NextResponse.json(
        { error: 'version_number is required and must be a number' },
        { status: 400 }
      );
    }

    // Call the rollback function
    const { error } = await supabase.rpc('rollback_to_version', {
      p_schema_id: schemaId,
      p_version_number: version_number,
    });

    if (error) {
      logger.error('Error rolling back schema:', error);
      return NextResponse.json(
        { error: 'Failed to rollback schema', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully rolled back to version ${version_number}`,
    });
  } catch (error) {
    logger.error('Unexpected error in rollback API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
