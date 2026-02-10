import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/schemas/[id]/versions/[version]/rollback
 * Rollback schema to a specific version
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const supabase = await createClient();
    const { id: schemaId, version } = await params;
    const versionNumber = parseInt(version, 10);

    if (isNaN(versionNumber)) {
      return NextResponse.json(
        { error: 'Invalid version number' },
        { status: 400 }
      );
    }

    // Get current schema version before rollback
    const { data: currentSchema } = await supabase
      .from('extraction_schemas')
      .select('schema_version')
      .eq('id', schemaId)
      .single();

    const previousVersion = currentSchema?.schema_version || 1;

    // Call the rollback function
    const { data, error } = await supabase.rpc('rollback_to_version', {
      p_schema_id: schemaId,
      p_version_number: versionNumber,
    });

    if (error) {
      console.error('Error rolling back schema:', error);
      return NextResponse.json(
        { error: 'Failed to rollback schema', details: error.message },
        { status: 500 }
      );
    }

    // Get the new version number
    const { data: updatedSchema } = await supabase
      .from('extraction_schemas')
      .select('schema_version')
      .eq('id', schemaId)
      .single();

    const newVersion = updatedSchema?.schema_version || previousVersion + 1;

    return NextResponse.json({
      schema_id: schemaId,
      previous_version: previousVersion,
      new_version: newVersion,
      restored_from_version: versionNumber,
      new_version_id: data,
      change_summary: `Rolled back to version ${versionNumber}`,
    });
  } catch (error) {
    console.error('Unexpected error in rollback API:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
