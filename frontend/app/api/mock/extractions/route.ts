import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * GET /api/mock/extractions?job_id=<job_id> - Returns mocked extraction results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedJobId = searchParams.get('job_id');

  const mockedJobIds = {
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890': 'completed',
    'b2c3d4e5-f6a7-8901-bcde-f12345678901': 'processing',
    'c3d4e5f6-a7b8-9012-cdef-123456789012': 'failed'
  };

    if (!requestedJobId || !(requestedJobId in mockedJobIds)) {
      return NextResponse.json(
        { error: "Invalid or missing job_id. Use one of the mocked job IDs." },
        { status: 400 }
      );
    }

    // In Next.js, when running from frontend/, process.cwd() is the frontend directory
    // The public folder is at frontend/public/
    const fakeJobPath = join(process.cwd(), "public", "fake-extraction-job.json");
    const fileContent = readFileSync(fakeJobPath, "utf-8");
    const fakeJobData = JSON.parse(fileContent);

    const jobStatus = mockedJobIds[requestedJobId as keyof typeof mockedJobIds];

    if (jobStatus === 'processing') {
      // Partially completed - return all documents with their statuses
      const completedResults = fakeJobData.results?.slice(0, 6) || [];
      const totalDocuments = 10;
      const completedCount = 6;

      // Generate remaining documents with "processing" status
      const processingResults = Array.from({ length: totalDocuments - completedCount }, (_, i) => ({
        document_id: `doc-1235${i}-sample`,
        status: 'processing',
        started_at: new Date().toISOString(),
        completed_at: null
      }));

      return NextResponse.json({
        ...fakeJobData,
        job_id: requestedJobId,
        status: 'PROCESSING',
        completed_documents: completedCount,
        total_documents: totalDocuments,
        results: [...completedResults, ...processingResults]
      });
    } else if (jobStatus === 'failed') {
      // Failed - return all documents with their statuses
      const totalDocuments = 8;
      const failedCount = 2;
      const completedCount = 2; // Some documents completed before failure (matching mock jobs route)

      // Failed documents
      const failedResults = [
        {
          document_id: 'doc-failed-1',
          status: 'failed',
          error_message: 'OCR Service Timeout',
          started_at: new Date(Date.now() - 3600000).toISOString(),
          completed_at: null
        },
        {
          document_id: 'doc-failed-2',
          status: 'failed',
          error_message: 'File Corrupted',
          started_at: new Date(Date.now() - 3300000).toISOString(),
          completed_at: null
        }
      ];

      // Completed documents (before failure)
      const completedResults = (fakeJobData.results?.slice(0, completedCount) || []).map((doc: any) => ({
        ...doc,
        completed_at: doc.completed_at || new Date(Date.now() - 1800000).toISOString()
      }));

      // Processing documents (interrupted by failure)
      const processingResults = Array.from({ length: totalDocuments - failedCount - completedCount }, (_, i) => ({
        document_id: `doc-processing-${i + 1}`,
        status: 'processing',
        started_at: new Date(Date.now() - 3000000 + i * 60000).toISOString(),
        completed_at: null
      }));

      return NextResponse.json({
        ...fakeJobData,
        job_id: requestedJobId,
        status: 'FAILED',
        completed_documents: completedCount,
        total_documents: totalDocuments,
        results: [...completedResults, ...failedResults, ...processingResults]
      });
    } else {
      // Completed (default)
      return NextResponse.json({
        ...fakeJobData,
        job_id: requestedJobId
      });
    }
  } catch (error) {
    console.error("Error reading fake extraction job file: ", error);
    return NextResponse.json(
      {
        error: "Failed to load mocked extraction job",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
