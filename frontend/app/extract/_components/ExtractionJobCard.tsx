import { Calendar, FileCode, Eye, Clock, RefreshCw } from "lucide-react";
import { BaseCard, VariantButton } from "@/lib/styles/components";
import { StatusBadge } from "@/components/editorial";
import { cn } from "@/lib/utils";
import { ExtractionJob, formatName, formatTimeFromSeconds } from "./types";

interface ExtractionJobCardProps {
  job: ExtractionJob;
  onOpen: (jobId: string) => void;
  onRetry: (job: ExtractionJob) => void;
}

export function ExtractionJobCard({ job, onOpen, onRetry }: ExtractionJobCardProps) {
  const timeAgo = new Date(job.created_at).toLocaleDateString();

  // Determine progress bar color based on status
  const getProgressBarColor = () => {
    if (job.status === 'failed') {
      return 'bg-oxblood';
    } else if (job.status === 'in_progress') {
      return 'bg-gold';
    }
    return 'bg-ink';
  };

  return (
    <BaseCard
      variant="light"
      className="group hover:-translate-y-px transition-transform h-full flex flex-col cursor-pointer"
      onClick={() => onOpen(job.id)}
    >
      <div className="flex flex-col h-full space-y-4 -m-3.5 p-8">
        <div className="flex items-start justify-between gap-3 min-h-[3rem]">
          <h4 className="font-semibold text-base line-clamp-2 flex-1 min-w-0">{job.collection_name}</h4>
          <StatusBadge
            status={job.status}
            label={job.status === 'in_progress' ? 'In Progress' : undefined}
          />
        </div>

        <div className="space-y-2 text-sm text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 shrink-0" />
            <span className="line-clamp-1">{formatName(job.schema_name)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* Progress bar for all extractions */}
        {job.completed_documents !== undefined && job.document_count !== undefined && job.document_count > 0 && (
          <div className="space-y-2 mt-3 pt-3 border-t">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-muted-foreground">Progress</span>
                <span className="text-xs text-muted-foreground">
                  {job.completed_documents} / {job.document_count}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                <div
                  className={cn("h-full transition-all", getProgressBarColor())}
                  style={{
                    width: `${job.status === 'failed'
                      ? 100
                      : (job.completed_documents / job.document_count) * 100}%`
                  }}
                />
              </div>
            </div>
            {(job.status === 'in_progress' && job.estimated_time_remaining_seconds !== null && job.estimated_time_remaining_seconds !== undefined && job.estimated_time_remaining_seconds > 0) && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>~{formatTimeFromSeconds(job.estimated_time_remaining_seconds)} remaining</span>
              </div>
            )}
          </div>
        )}

        {/* Spacer to push buttons to bottom */}
        <div className="flex-1" />

        {/* Action buttons */}
        <div className="mt-auto">
          {job.status === 'in_progress' && (
            <VariantButton intent="accent"
              size="sm"
              icon={Eye}
              onClick={() => {
                onOpen(job.id);
              }}
              className="w-full"
            >
              Open Details
            </VariantButton>
          )}

          {job.status === 'completed' && (
            <VariantButton intent="accent"
              size="sm"
              icon={Eye}
              onClick={() => {
                onOpen(job.id);
              }}
              className="w-full"
            >
              View Results
            </VariantButton>
          )}

          {job.status === 'failed' && (
            <VariantButton
              intent="glass"
              variant="white"
              onClick={() => {
                onRetry(job);
              }}
              className="w-full"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Extraction
            </VariantButton>
          )}
        </div>
      </div>
    </BaseCard>
  );
}
