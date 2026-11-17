export interface AvailableExtractionJob {
  /** Celery task id; the identifier publication links reference. */
  job_id: string;
  schema_name?: string;
  status: string;
  created_at?: string;
}

interface NamedResource {
  id: string;
  name: string;
}

const SHORT_ID_LENGTH = 8;

/** Shortened id used only when a name cannot be resolved. */
export function shortId(id: string): string {
  return id.length > SHORT_ID_LENGTH ? `${id.slice(0, SHORT_ID_LENGTH)}…` : id;
}

/** Name from the lookup list, falling back to the stored name, then a short id. */
export function resolveResourceName(
  id: string,
  storedName: string | undefined,
  available: NamedResource[]
): string {
  return available.find((r) => r.id === id)?.name || storedName || shortId(id);
}

/** Maps the `GET /api/jobs` payload (`{ jobs: [...] }`) to picker options. */
export function mapJobsResponse(payload: unknown): AvailableExtractionJob[] {
  const jobs = (payload as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter((j): j is Record<string, unknown> => !!j && typeof j.job_id === "string")
    .map((j) => ({
      job_id: j.job_id as string,
      schema_name: typeof j.schema_name === "string" ? j.schema_name : undefined,
      status: typeof j.status === "string" ? j.status : "UNKNOWN",
      created_at: typeof j.created_at === "string" ? j.created_at : undefined,
    }));
}

/** Label for a job: schema name plus short id, or just the short id. */
export function jobLabel(
  jobId: string,
  job: AvailableExtractionJob | undefined
): string {
  return job?.schema_name ? `${job.schema_name} (${shortId(jobId)})` : shortId(jobId);
}
