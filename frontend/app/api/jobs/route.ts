import { NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';

const apiLogger = logger.child('jobs-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

// Helper to refresh job status from backend
async function refreshJobStatusFromBackend(
  jobId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    if (!jobId) {
      apiLogger.warn('Skipping refresh for job with no job_id');
      return;
    }

    const response = await fetch(
      `${API_BASE_URL}/extractions/${jobId}`,
      {
        headers: {
          'X-API-Key': API_KEY
        }
      }
    );

    if (!response.ok) {
      apiLogger.warn('Failed to refresh job status from backend', {
        jobId,
        status: response.status
      });
      return;
    }

    const jobData = await response.json();

    // First, verify the job exists in Supabase
    const { data: existingJob, error: checkError } = await supabase
      .from('extraction_jobs')
      .select('job_id, status')
      .eq('job_id', jobId)
      .single();

    if (checkError || !existingJob) {
      apiLogger.warn('Job not found in Supabase before update', {
        jobId,
        error: checkError,
        backendStatus: jobData.status
      });
      return;
    }

    // Update job status in Supabase
    const updateData: {
      status: string;
      updated_at: string;
      completed_documents?: number;
      results?: unknown[];
      completed_at?: string;
    } = {
      status: jobData.status,
      updated_at: new Date().toISOString(),
    };

    if (jobData.results && jobData.results.length > 0) {
      // Count all processed documents (both completed and failed) as completed_documents
      const processedCount = jobData.results.filter(
        (r: { status: string }) =>
          r.status === 'completed' ||
          r.status === 'failed' ||
          r.status === 'partially_completed'
      ).length;
      updateData.completed_documents = processedCount;
      updateData.results = jobData.results;
    }

    // Update completed_at for terminal states
    if (jobData.status === 'SUCCESS' ||
        jobData.status === 'FAILURE' ||
        jobData.status === 'COMPLETED' ||
        jobData.status === 'PARTIALLY_COMPLETED') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: updateResult, error: updateError } = await supabase
      .from('extraction_jobs')
      .update(updateData)
      .eq('job_id', jobId)
      .select();

    if (updateError) {
      apiLogger.error('Failed to update job status in Supabase after refresh', updateError, {
        jobId,
        updateData
      });
    } else if (!updateResult || updateResult.length === 0) {
      apiLogger.warn('No rows updated in Supabase - job might not exist or job_id mismatch', {
        jobId,
        updateData,
        backendStatus: jobData.status
      });
    } else {
      apiLogger.info('Successfully refreshed and updated job status', {
        jobId,
        status: jobData.status,
        updatedRows: updateResult.length,
        oldStatus: updateResult[0]?.status,
        newStatus: updateData.status
      });
    }
  } catch (error) {
    apiLogger.error('Error refreshing job status from backend', error, { jobId });
    // Don't throw - let other jobs refresh even if one fails
  }
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Fetch extraction jobs from Supabase
    const jobsQueryResult = await supabase
      .from('extraction_jobs')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    let jobs = jobsQueryResult.data;
    const jobsError = jobsQueryResult.error;

    if (jobsError) {
      console.error("Error fetching jobs: ", jobsError);
      return NextResponse.json(
        { error: "Failed to fetch jobs" },
        { status: 500 }
      );
    }

    // Refresh status from backend for:
    // 1. In-progress jobs (always refresh these)
    // 2. Recently updated jobs (within last 5 minutes) - to catch jobs that just completed/failed
    const inProgressStatuses = ['PENDING', 'STARTED', 'PROCESSING', 'IN_PROGRESS', 'QUEUED'];
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const jobsToRefresh = (jobs || []).filter((job: any) => {
      if (!job.job_id) return false;

      const status = job.status?.toUpperCase();
      const isInProgress = inProgressStatuses.includes(status);

      // Also refresh jobs that were recently updated (might have just completed/failed)
      const updatedAt = job.updated_at ? new Date(job.updated_at) : null;
      const isRecentlyUpdated = updatedAt && updatedAt > fiveMinutesAgo;

      return isInProgress || isRecentlyUpdated;
    });

    // Refresh all relevant jobs in parallel (but don't fail if refresh fails)
    if (jobsToRefresh.length > 0) {
      apiLogger.info('Refreshing status for jobs', {
        count: jobsToRefresh.length,
        inProgress: jobsToRefresh.filter((j: any) => inProgressStatuses.includes(j.status?.toUpperCase())).length,
        recentlyUpdated: jobsToRefresh.filter((j: any) => {
          const updatedAt = j.updated_at ? new Date(j.updated_at) : null;
          return updatedAt && updatedAt > fiveMinutesAgo;
        }).length
      });

      try {
        // Refresh in parallel - use Promise.allSettled to not fail if individual refreshes fail
        await Promise.allSettled(
          jobsToRefresh.map((job: any) => refreshJobStatusFromBackend(job.job_id, supabase))
        );

        // Re-fetch jobs from Supabase after refresh to get updated statuses
        const { data: refreshedJobs, error: refreshedError } = await supabase
          .from('extraction_jobs')
          .select('*')
          .eq('user_id', userData.user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (!refreshedError && refreshedJobs) {
          // Use refreshed jobs instead of original jobs
          jobs = refreshedJobs;
        } else if (refreshedError) {
          apiLogger.warn('Failed to re-fetch jobs after refresh, using original jobs', refreshedError);
        }
      } catch (error) {
        apiLogger.error('Error during job refresh process, continuing with original jobs', error);
        // Continue with original jobs if refresh fails
      }
    }

    // Fetch collection names for unique collection IDs
    const collectionIds = [...new Set((jobs || []).map((job: any) => job.collection_id).filter(Boolean))];
    const collectionMap = new Map<string, string>();

    if (collectionIds.length > 0) {
      const { data: collections } = await supabase
        .from('collections')
        .select('id, name')
        .in('id', collectionIds);

      if (collections) {
        collections.forEach((collection: any) => {
          collectionMap.set(collection.id, collection.name);
        });
      }
    }

    // Fetch schema names for unique schema IDs
    const schemaIds = [...new Set((jobs || []).map((job: any) => job.schema_id).filter(Boolean))];
    const schemaMap = new Map<string, string>();

    if (schemaIds.length > 0) {
      const { data: schemas } = await supabase
        .from('extraction_schemas')
        .select('id, name')
        .in('id', schemaIds);

      if (schemas) {
        schemas.forEach((schema: any) => {
          schemaMap.set(schema.id, schema.name);
        });
      }
    }

    // Fetch user emails from user_profiles table
    const userIds = [...new Set((jobs || []).map((job: any) => job.user_id).filter(Boolean))];
    let userEmails: Record<string, string> = {};

    if (userIds.length > 0) {
      try {
        const { data: userProfiles, error: profilesError } = await supabase
          .from('user_profiles')
          .select('id, email')
          .in('id', userIds);

        if (profilesError) {
          apiLogger.warn("Failed to fetch user profiles", { error: profilesError });
        } else if (userProfiles && Array.isArray(userProfiles)) {
          userEmails = userProfiles.reduce((acc: Record<string, string>, profile: any) => {
            if (profile.id && profile.email) {
              acc[profile.id] = profile.email;
            }
            return acc;
          }, {} as Record<string, string>);
        }
      } catch (error) {
        apiLogger.warn("Failed to fetch user emails for jobs", { error });
        // Continue without user emails if fetch fails
      }
    }

    // Add collection names to jobs and calculate timing information
    const jobsWithCollectionNames = (jobs || []).map((job: any) => {
      const now = new Date();
      const createdAt = new Date(job.created_at);
      const startedAt = job.started_at ? new Date(job.started_at) : null;
      const completedAt = job.completed_at ? new Date(job.completed_at) : null;

      // Calculate elapsed time
      let elapsedTimeSeconds: number | null = null;
      if (startedAt) {
        const endTime = completedAt || now;
        elapsedTimeSeconds = Math.floor((endTime.getTime() - startedAt.getTime()) / 1000);
      }

      // Calculate estimated time remaining for in-progress jobs
      let estimatedTimeRemainingSeconds: number | null = null;
      let avgTimePerDocumentSeconds: number | null = null;

      if (job.status === 'PROCESSING' || job.status === 'STARTED') {
        const completedDocs = job.completed_documents || 0;
        const totalDocs = job.total_documents || 0;

        if (completedDocs > 0 && totalDocs > 0 && startedAt) {
          const elapsed = (now.getTime() - startedAt.getTime()) / 1000;
          avgTimePerDocumentSeconds = elapsed / completedDocs;
          const remainingDocs = totalDocs - completedDocs;
          estimatedTimeRemainingSeconds = Math.floor(avgTimePerDocumentSeconds * remainingDocs);
        }
      }

      return {
        ...job,
        collection_name: job.collection_id ? collectionMap.get(job.collection_id) || null : null,
        schema_name: job.schema_id ? schemaMap.get(job.schema_id) || null : null,
        elapsed_time_seconds: elapsedTimeSeconds,
        estimated_time_remaining_seconds: estimatedTimeRemainingSeconds,
        avg_time_per_document_seconds: avgTimePerDocumentSeconds,
        user: job.user_id && userEmails[job.user_id]
          ? { email: userEmails[job.user_id] }
          : undefined,
      };
    });

    return NextResponse.json({
      jobs: jobsWithCollectionNames,
      total: jobsWithCollectionNames.length
    });
  } catch (error) {
    console.error("Error in jobs route: ", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
