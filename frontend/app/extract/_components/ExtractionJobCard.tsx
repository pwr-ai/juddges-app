import { Calendar, FileCode, Eye, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { BaseCard, VariantButton } from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { ExtractionJob, formatName, formatTimeFromSeconds } from "./types";

interface ExtractionJobCardProps {
  job: ExtractionJob;
  onOpen: (jobId: string) => void;
  onRetry: (job: ExtractionJob) => void;
}

export function ExtractionJobCard({ job, onOpen, onRetry }: ExtractionJobCardProps) {
  const statusConfig: Record<typeof job.status, {
    icon: typeof CheckCircle2;
    color: string;
    bg: string;
    border: string;
    label: string;
  }> = {
    completed: {
      icon: CheckCircle2,
      color: 'text-green-600',
      bg: 'bg-green-50/50',
      border: 'border-green-200/50',
      label: 'Completed',
    },
    failed: {
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50/50',
      border: 'border-red-200/50',
      label: 'Failed',
    },
    in_progress: {
      icon: Clock,
      color: 'text-blue-600',
      bg: 'bg-blue-50/50',
      border: 'border-blue-200/50',
      label: 'In Progress',
    },
  };

  const config = statusConfig[job.status];
  const StatusIcon = config.icon;
  const timeAgo = new Date(job.created_at).toLocaleDateString();

  // Determine progress bar color based on status
  const getProgressBarColor = () => {
    if (job.status === 'completed') {
      return 'bg-green-600';
    } else if (job.status === 'failed') {
      return 'bg-red-500';
    }
    return 'bg-primary';
  };

  return (
    <BaseCard
      variant="light"
      className="group hover:shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-200 h-full flex flex-col cursor-pointer"
      onClick={() => onOpen(job.id)}
    >
      <div className="flex flex-col h-full space-y-4 -m-3.5 p-8">
        <div className="flex items-start justify-between gap-3 min-h-[3rem]">
          <h4 className="font-semibold text-base line-clamp-2 flex-1 min-w-0">{job.collection_name}</h4>
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium shrink-0",
              config.bg,
              config.border,
              "border",
              "transition-all duration-200 ease-in-out",
              "hover:opacity-90 hover:shadow-md",
              "transform-gpu will-change-transform",
              "relative z-10"
            )}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => e.stopPropagation()}
            onMouseLeave={(e) => e.stopPropagation()}
          >
            <StatusIcon className={cn("h-3.5 w-3.5", config.color)} />
            <span className={config.color}>{config.label}</span>
          </div>
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
