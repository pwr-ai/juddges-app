import { NextResponse } from "next/server";

/**
 * GET /api/mock/jobs - Returns 3 mocked extraction jobs
 * (1 completed, 1 partially completed, 1 failed)
 */
export async function GET(): Promise<NextResponse> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const twoHoursAgo = new Date(now.getTime() - 7200000);
  const threeHoursAgo = new Date(now.getTime() - 10800000);

  const mockedJobs = [
    // 1. Completed job
    {
      job_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      collection_id: 'collection-1',
      collection_name: 'Appellate Judgments Collection',
      schema_id: 'schema-1',
      schema_name: 'Judgment Metadata Schema',
      status: 'SUCCESS',
      created_at: threeHoursAgo.toISOString(),
      updated_at: twoHoursAgo.toISOString(),
      started_at: threeHoursAgo.toISOString(),
      completed_at: twoHoursAgo.toISOString(),
      total_documents: 5,
      completed_documents: 5,
      elapsed_time_seconds: 3600,
      estimated_time_remaining_seconds: null,
      avg_time_per_document_seconds: 720,
    },
    // 2. Partially completed job
    {
      job_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
      collection_id: 'collection-2',
      collection_name: 'Court Decisions Collection',
      schema_id: 'schema-2',
      schema_name: 'Legal Precedent Schema',
      status: 'PROCESSING',
      created_at: oneHourAgo.toISOString(),
      updated_at: now.toISOString(),
      started_at: oneHourAgo.toISOString(),
      completed_at: null,
      total_documents: 10,
      completed_documents: 6,
      elapsed_time_seconds: 3600,
      estimated_time_remaining_seconds: 2400,
      avg_time_per_document_seconds: 600,
    },
    // 3. Failed job
    {
      job_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      collection_id: 'collection-3',
      collection_name: 'Regulatory Documents',
      schema_id: 'schema-3',
      schema_name: 'Compliance Schema',
      status: 'FAILED',
      created_at: twoHoursAgo.toISOString(),
      updated_at: oneHourAgo.toISOString(),
      started_at: twoHoursAgo.toISOString(),
      completed_at: null,
      total_documents: 8,
      completed_documents: 2,
      elapsed_time_seconds: 1800,
      estimated_time_remaining_seconds: null,
      avg_time_per_document_seconds: null,
    }
  ];

  return NextResponse.json({
    jobs: mockedJobs,
    total: mockedJobs.length
  });
}


