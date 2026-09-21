import { EditorialCard } from "@/components/editorial";
import { ExtractionJob } from "./types";
import { ExtractionJobCard } from "./ExtractionJobCard";

interface RecentExtractionsProps {
  jobs: ExtractionJob[];
  onOpen: (jobId: string) => void;
  onRetry: (job: ExtractionJob) => void;
}

export function RecentExtractions({ jobs, onOpen, onRetry }: RecentExtractionsProps) {
  return (
    <div className="mb-8 -mt-4">
      <h3 className="editorial-display text-lg text-ink mb-6">
        Recent Extractions
      </h3>
      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <ExtractionJobCard
              key={job.id}
              job={job}
              onOpen={onOpen}
              onRetry={onRetry}
            />
          ))}
        </div>
      ) : (
        <EditorialCard flat className="text-center">
          <p className="text-sm text-ink-soft">
            Your recent extractions will appear here once you start extracting data from documents.
          </p>
        </EditorialCard>
      )}
    </div>
  );
}
