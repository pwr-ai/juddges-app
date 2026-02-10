"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  Download,
  RefreshCw
} from "lucide-react";
import { DocumentProcessingStatus } from "@/types/search";

interface ExtractionResult {
  document_id: string;
  status: DocumentProcessingStatus;
  started_at?: string;
  completed_at?: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  error_message?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data?: any;
  documents?: {
    document_id: string;
    document_date: string;
    volume_number: number;
  };
}

interface ExtractionProgressProps {
  jobId: string;
  onComplete?: (results: ExtractionResult[]) => void;
  onViewResult?: (result: ExtractionResult) => void;
  onCancel?: () => void;
}

export function ExtractionProgress({
  jobId,
  onComplete,
  onViewResult,
  onCancel
}: ExtractionProgressProps) {
  const [results, setResults] = useState<ExtractionResult[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!jobId || !isPolling) return;

    const pollResults = async () => {
      try {
        const response = await fetch(`/api/extractions?job_id=${jobId}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          
          // Parse error response (safe - returns null if not JSON)
          let errorMessage = `Error (${response.status})`;
          let errorCode: string | undefined;
          
          let errorData: any = null;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // Not JSON, use text as error message
          }
          
          if (errorData) {
            errorMessage = errorData.message || errorData.error || errorMessage;
            errorCode = errorData.code || errorData.detail?.code;
          } else if (errorText) {
            errorMessage = errorText;
          }
          
          // Check if this is a permanent error that requires stopping
          const permanentErrors = ['WEAVIATE_UNAVAILABLE', 'TASK_SUBMISSION_FAILED'];
          const isPermanentError = response.status === 401 || 
            permanentErrors.includes(errorCode || '') ||
            errorMessage.toLowerCase().includes('weaviate') ||
            errorMessage.toLowerCase().includes('vector database');
          
          if (isPermanentError) {
            setError(response.status === 401 
              ? "Authentication required. Please log in again."
              : `Service unavailable: ${errorMessage}. The job cannot complete until the service is restored.`);
            setIsPolling(false);
            return;
          }
          
          // Handle transient errors
          retryCountRef.current += 1;
          if (retryCountRef.current > 20) {
            setError(`Error: ${errorMessage}. Too many retries. Please try again later.`);
            setIsPolling(false);
          } else {
            setError(response.status === 404 ? null : `Error: ${errorMessage}. Retrying...`);
          }
          return;
        }

        // Success - reset error and retry count
        setError(null);
        retryCountRef.current = 0;

        const data = await response.json();
        setLastUpdated(new Date());

        if (data.results) {
          setResults(data.results);
        }

        // Stop polling if job is complete
        const terminalStatuses = ["SUCCESS", "FAILURE", "COMPLETED", "REVOKED", "CANCELLED"];
        if (terminalStatuses.includes(data.status)) {
          setIsPolling(false);
          if (onComplete && data.results) {
            onComplete(data.results);
          }
          if (data.status === "REVOKED" || data.status === "CANCELLED") {
            setError("Job has been cancelled.");
          }
        }

      } catch (error) {
        retryCountRef.current += 1;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error("Failed to poll extraction results:", errorMessage);
        
        if (retryCountRef.current > 30) {
          setError("Too many connection errors. Please refresh the page.");
          setIsPolling(false);
        } else {
          setError(`Connection error: ${errorMessage}. Retrying...`);
        }
      }
    };

    pollResults();
    const interval = setInterval(pollResults, 3000);
    return () => clearInterval(interval);
  }, [jobId, isPolling, onComplete]);

  const getOverallProgress = () => {
    if (results.length === 0) return 0;

    const completed = results.filter(
      result => result.status === DocumentProcessingStatus.COMPLETED
    ).length;

    return (completed / results.length) * 100;
  };

  const getStatusCounts = () => {
    const counts = {
      [DocumentProcessingStatus.PENDING]: 0,
      [DocumentProcessingStatus.PROCESSING]: 0,
      [DocumentProcessingStatus.COMPLETED]: 0,
      [DocumentProcessingStatus.FAILED]: 0,
      [DocumentProcessingStatus.PARTIALLY_COMPLETED]: 0,
    };

    results.forEach(result => {
      counts[result.status]++;
    });

    return counts;
  };

  const getStatusBadge = (status: DocumentProcessingStatus) => {
    const configs = {
      [DocumentProcessingStatus.PENDING]: {
        variant: "outline" as const,
        icon: Clock,
        label: "Pending"
      },
      [DocumentProcessingStatus.PROCESSING]: {
        variant: "secondary" as const,
        icon: RefreshCw,
        label: "Processing"
      },
      [DocumentProcessingStatus.COMPLETED]: {
        variant: "default" as const,
        icon: CheckCircle,
        label: "Completed"
      },
      [DocumentProcessingStatus.FAILED]: {
        variant: "destructive" as const,
        icon: AlertCircle,
        label: "Failed"
      },
      [DocumentProcessingStatus.PARTIALLY_COMPLETED]: {
        variant: "secondary" as const,
        icon: AlertCircle,
        label: "Partial"
      },
    };

    const config = configs[status];
    const IconComponent = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <IconComponent className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const handleViewResult = (result: ExtractionResult) => {
    if (onViewResult) {
      onViewResult(result);
    }
  };

  const handleDownloadResults = () => {
    const completedResults = results.filter(
      result => result.status === DocumentProcessingStatus.COMPLETED
    );

    const dataStr = JSON.stringify(completedResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `extraction_results_${jobId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const statusCounts = getStatusCounts();
  const overallProgress = getOverallProgress();

  return (
    <div className="space-y-6 w-full max-w-7xl mx-auto">
      {/* Summary Card */}
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Extraction Progress</CardTitle>
            <div className="flex items-center gap-2">
              {isPolling && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span className="text-sm text-muted-foreground">
                Job: {jobId.substring(0, 8)}...
              </span>
            </div>
          </div>
          {error && (
            <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Overall Progress */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-muted-foreground">
                  {Math.round(overallProgress)}%
                </span>
              </div>
              <Progress value={overallProgress} className="h-3" />
            </div>

            {/* Status Summary */}
            <div className="grid grid-cols-5 gap-4 w-full">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} className="text-center min-w-0">
                  <div className="text-2xl font-bold mb-1">{count}</div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {status.toLowerCase().replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadResults}
                disabled={statusCounts[DocumentProcessingStatus.COMPLETED] === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Results
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsPolling(!isPolling)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {isPolling ? "Pause" : "Resume"} Updates
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Results Table */}
      {results.length > 0 && (
        <Card className="w-full max-w-7xl mx-auto">
          <CardHeader>
            <CardTitle>Document Processing Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Document</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-36">Started</TableHead>
                    <TableHead className="w-36">Completed</TableHead>
                    <TableHead className="min-w-48 max-w-72">Error</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.document_id}>
                      <TableCell>
                        {result.documents ? (
                          <div>
                            <div className="font-medium">
                              Case {result.documents.volume_number}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {result.documents.document_date}
                            </div>
                          </div>
                        ) : (
                          <span>Doc {result.document_id.substring(0, 8)}...</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(result.status)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {result.started_at
                          ? new Date(result.started_at).toLocaleString()
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-sm">
                        {result.completed_at
                          ? new Date(result.completed_at).toLocaleString()
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        {result.error_message && (
                          <span className="text-red-500 text-sm whitespace-normal break-words">
                            {result.error_message}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {result.status === DocumentProcessingStatus.COMPLETED &&
                         result.extracted_data && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewResult(result)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
