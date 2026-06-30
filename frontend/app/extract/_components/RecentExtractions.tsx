import { BaseCard } from "@/lib/styles/components";
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
      <h3 className="text-sm md:text-base font-semibold text-foreground mb-6">
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
        <BaseCard
          variant="light"
          className="text-center"
        >
          <div className="-m-3.5 p-6">
            <p className="text-sm text-muted-foreground">
              Your recent extractions will appear here once you start extracting data from documents.
            </p>
          </div>
        </BaseCard>
      )}
    </div>
  );
}
