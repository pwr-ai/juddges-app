"use client";

import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
 GlassButton,
 SecondaryButton,
 LoadingIndicator,
 BaseCard,
 TextButton,
 Badge,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import {
 Layers,
 Sparkles,
 CheckCircle2,
 XCircle,
 Clock,
 Download,
 FileCode,
 AlertCircle,
 Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { submitBulkExtraction, BulkExtractionResponse, BulkExtractionJobInfo } from "@/lib/api";
import { logger } from "@/lib/logger";

interface BulkExtractionDialogProps {
 isOpen: boolean;
 onClose: () => void;
 schemas: ExtractionSchema[];
 collectionId: string;
 collectionName: string;
 documentIds: string[];
 documentCount: number;
 language: string;
 onJobsCreated?: (jobs: BulkExtractionJobInfo[]) => void;
}

// Convert names to human-readable format (sentence case)
const formatName = (name: string): string => {
 let formatted = name.replace(/_/g, ' ');
 formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
 const words = formatted.split(/\s+/).map(w => w.toLowerCase());
 if (words.length > 0) {
 words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
 }
 return words.join(' ');
};

export function BulkExtractionDialog({
 isOpen,
 onClose,
 schemas,
 collectionId,
 collectionName,
 documentIds,
 documentCount,
 language,
 onJobsCreated,
}: BulkExtractionDialogProps) {
 const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [autoExport, setAutoExport] = useState(false);
 const [bulkResult, setBulkResult] = useState<BulkExtractionResponse | null>(null);
 const [jobStatuses, setJobStatuses] = useState<Record<string, { status: string; completed: number; total: number }>>(
 {}
 );
 const [isPolling, setIsPolling] = useState(false);

 // Reset state when dialog opens
 useEffect(() => {
 if (isOpen) {
 setSelectedSchemas(new Set());
 setBulkResult(null);
 setJobStatuses({});
 setIsPolling(false);
 setAutoExport(false);
 }
 }, [isOpen]);

 const handleToggleSchema = (schemaId: string) => {
 setSelectedSchemas(prev => {
 const newSet = new Set(prev);
 if (newSet.has(schemaId)) {
 newSet.delete(schemaId);
 } else {
 if (newSet.size >= 10) {
 toast.error("Maximum 10 schemas allowed per bulk extraction");
 return prev;
 }
 newSet.add(schemaId);
 }
 return newSet;
 });
 };

 const handleSelectAll = () => {
 const publishedSchemas = schemas.filter(s => s.status === 'published' || s.status === null);
 if (selectedSchemas.size === publishedSchemas.length) {
 setSelectedSchemas(new Set());
 } else {
 const ids = publishedSchemas.slice(0, 10).map(s => s.id);
 setSelectedSchemas(new Set(ids));
 }
 };

 // Poll for job statuses
 const pollJobStatuses = useCallback(async (jobs: BulkExtractionJobInfo[]) => {
 const acceptedJobs = jobs.filter(j => j.status === 'accepted' && j.job_id);
 if (acceptedJobs.length === 0) return;

 setIsPolling(true);

 const pollInterval = setInterval(async () => {
 let allDone = true;

 for (const job of acceptedJobs) {
 try {
 const response = await fetch(`/api/extractions?job_id=${job.job_id}`);
 if (response.ok) {
 const data = await response.json();
 const normalizedStatus = data.status?.toUpperCase() || '';
 const isTerminal = ['COMPLETED', 'SUCCESS', 'PARTIALLY_COMPLETED', 'FAILED', 'FAILURE', 'CANCELLED'].includes(normalizedStatus);

 const completedDocs = data.results?.filter(
 (r: { status: string }) => r.status === 'completed' || r.status === 'failed'
 ).length || 0;

 setJobStatuses(prev => ({
 ...prev,
 [job.job_id]: {
 status: normalizedStatus,
 completed: completedDocs,
 total: documentCount,
 },
 }));

 if (!isTerminal) {
 allDone = false;
 }
 }
 } catch {
 // Ignore poll errors
 allDone = false;
 }
 }

 if (allDone) {
 clearInterval(pollInterval);
 setIsPolling(false);

 // Check if auto-export is enabled
 const successfulJobs = acceptedJobs.filter(j => {
 const s = jobStatuses[j.job_id]?.status;
 return s === 'COMPLETED' || s === 'SUCCESS' || s === 'PARTIALLY_COMPLETED';
 });

 if (successfulJobs.length > 0) {
 toast.success(`Bulk extraction complete: ${successfulJobs.length} of ${acceptedJobs.length} jobs succeeded.`);
 }
 }
 }, 5000);

 // Cleanup on unmount
 return () => clearInterval(pollInterval);
 }, [documentCount, jobStatuses]);

 const handleSubmit = async () => {
 if (selectedSchemas.size === 0) {
 toast.error("Please select at least one schema");
 return;
 }

 setIsSubmitting(true);

 try {
 const result = await submitBulkExtraction({
 collection_id: collectionId,
 schema_ids: Array.from(selectedSchemas),
 document_ids: documentIds,
 language,
 auto_export: autoExport,
 });

 setBulkResult(result);

 // Initialize job statuses
 const initialStatuses: Record<string, { status: string; completed: number; total: number }> = {};
 for (const job of result.jobs) {
 if (job.status === 'accepted') {
 initialStatuses[job.job_id] = { status: 'PENDING', completed: 0, total: documentCount };
 }
 }
 setJobStatuses(initialStatuses);

 // Notify parent
 if (onJobsCreated) {
 onJobsCreated(result.jobs.filter(j => j.status === 'accepted'));
 }

 // Start polling
 pollJobStatuses(result.jobs);

 const acceptedCount = result.jobs.filter(j => j.status === 'accepted').length;
 toast.success(`Started ${acceptedCount} extraction jobs for ${documentCount} documents.`);
 } catch (error) {
 logger.error('Bulk extraction failed:', error);
 toast.error(error instanceof Error ? error.message : 'Failed to start bulk extraction');
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleExportJob = async (jobId: string) => {
 try {
 const response = await fetch(`/api/extractions/${jobId}/export`);
 if (!response.ok) {
 throw new Error('Export failed');
 }

 const blob = await response.blob();
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `extraction-${jobId}.csv`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);

 toast.success('Export downloaded successfully');
 } catch {
 toast.error('Failed to export results');
 }
 };

 const publishedSchemas = schemas.filter(s => s.status === 'published' || s.status === null);

 const getJobStatusIcon = (status: string) => {
 const normalized = status.toUpperCase();
 if (['COMPLETED', 'SUCCESS'].includes(normalized)) {
 return <CheckCircle2 className="h-4 w-4 text-green-500"/>;
 }
 if (['FAILED', 'FAILURE', 'CANCELLED'].includes(normalized)) {
 return <XCircle className="h-4 w-4 text-red-500"/>;
 }
 if (normalized === 'PARTIALLY_COMPLETED') {
 return <AlertCircle className="h-4 w-4 text-yellow-500"/>;
 }
 return <Loader2 className="h-4 w-4 text-blue-500 animate-spin"/>;
 };

 const getJobStatusColor = (status: string): string => {
 const normalized = status.toUpperCase();
 if (['COMPLETED', 'SUCCESS'].includes(normalized)) return 'bg-green-500';
 if (['FAILED', 'FAILURE'].includes(normalized)) return 'bg-red-500';
 if (normalized === 'PARTIALLY_COMPLETED') return 'bg-yellow-500';
 return 'bg-blue-500';
 };

 return (
 <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
 <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Layers className="h-5 w-5"/>
 Bulk Extraction
 </DialogTitle>
 </DialogHeader>

 <div className="space-y-6">
 {/* Summary */}
 <div className="flex items-center gap-4 text-sm text-muted-foreground">
 <span>Collection: <span className="font-medium text-foreground">{collectionName}</span></span>
 <span>Documents: <span className="font-medium text-foreground">{documentCount}</span></span>
 </div>

 {!bulkResult ? (
 <>
 {/* Schema Selection */}
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <label className="text-sm font-medium">Select Schemas to Apply</label>
 <div className="flex items-center gap-2">
 <span className="text-xs text-muted-foreground">
 {selectedSchemas.size} selected (max 10)
 </span>
 <TextButton onClick={handleSelectAll} className="text-xs">
 {selectedSchemas.size === publishedSchemas.length ? 'Deselect All' : 'Select All'}
 </TextButton>
 </div>
 </div>

 <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
 {publishedSchemas.length === 0 ? (
 <p className="text-sm text-muted-foreground text-center py-4">
 No published schemas available. Create a schema first.
 </p>
 ) : (
 publishedSchemas
 .sort((a, b) => {
 if (a.is_verified && !b.is_verified) return -1;
 if (!a.is_verified && b.is_verified) return 1;
 return 0;
 })
 .map(schema => (
 <div
 key={schema.id}
 className={cn(
"flex items-center gap-3 p-3 rounded-md transition-colors cursor-pointer",
"hover:bg-slate-100/50",
 selectedSchemas.has(schema.id) &&"bg-primary/5 border-primary/20",
"border border-slate-200/50"
 )}
 onClick={() => handleToggleSchema(schema.id)}
 >
 <Checkbox
 checked={selectedSchemas.has(schema.id)}
 onCheckedChange={() => handleToggleSchema(schema.id)}
 onClick={(e) => e.stopPropagation()}
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <FileCode className="h-4 w-4 text-muted-foreground shrink-0"/>
 <span className="text-sm font-medium truncate">
 {formatName(schema.name)}
 </span>
 {schema.is_verified && (
 <Badge className="text-xs px-1.5 py-0 bg-green-100 text-green-700">
 Verified
 </Badge>
 )}
 </div>
 {schema.description && (
 <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
 {schema.description}
 </p>
 )}
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 {/* Options */}
 <div className="space-y-3">
 <div
 className="flex items-center gap-3 cursor-pointer"
 onClick={() => setAutoExport(!autoExport)}
 >
 <Checkbox
 checked={autoExport}
 onCheckedChange={() => setAutoExport(!autoExport)}
 />
 <div>
 <span className="text-sm font-medium">Auto-export results</span>
 <p className="text-xs text-muted-foreground">
 Automatically download CSV exports when each job completes
 </p>
 </div>
 </div>
 </div>

 {/* Summary of what will happen */}
 {selectedSchemas.size > 0 && (
 <BaseCard
 clickable={false}
 className={cn(
"p-3",
"bg-blue-50/50",
"border-blue-200/50"
 )}
 >
 <div className="flex items-start gap-2.5 w-full">
 <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-blue-500"/>
 <span className="text-sm text-muted-foreground leading-relaxed">
 This will create <span className="font-semibold text-foreground">{selectedSchemas.size}</span> extraction
 {selectedSchemas.size > 1 ? ' jobs' : ' job'}, each processing{' '}
 <span className="font-semibold text-foreground">{documentCount}</span> document{documentCount > 1 ? 's' : ''},
 for a total of{' '}
 <span className="font-semibold text-foreground">{selectedSchemas.size * documentCount}</span> extractions.
 </span>
 </div>
 </BaseCard>
 )}

 {/* Actions */}
 <div className="flex justify-end gap-3">
 <SecondaryButton onClick={onClose}>
 Cancel
 </SecondaryButton>
 <GlassButton
 onClick={handleSubmit}
 disabled={selectedSchemas.size === 0 || isSubmitting}
 isLoading={isSubmitting}
 >
 {isSubmitting ? (
 'Starting...'
 ) : (
 <>
 <Sparkles className="h-4 w-4"/>
 Start Bulk Extraction ({selectedSchemas.size} schema{selectedSchemas.size > 1 ? 's' : ''})
 </>
 )}
 </GlassButton>
 </div>
 </>
 ) : (
 /* Results View */
 <div className="space-y-4">
 <div className="text-sm text-muted-foreground">
 {bulkResult.message}
 </div>

 {/* Job Progress Cards */}
 <div className="space-y-3">
 {bulkResult.jobs.map(job => {
 const jobStatus = jobStatuses[job.job_id];
 const currentStatus = jobStatus?.status || (job.status === 'accepted' ? 'PENDING' : 'REJECTED');
 const progress = jobStatus
 ? (jobStatus.total > 0 ? (jobStatus.completed / jobStatus.total) * 100 : 0)
 : 0;

 const isTerminal = ['COMPLETED', 'SUCCESS', 'PARTIALLY_COMPLETED', 'FAILED', 'FAILURE', 'CANCELLED'].includes(
 currentStatus.toUpperCase()
 );
 const isSuccess = ['COMPLETED', 'SUCCESS', 'PARTIALLY_COMPLETED'].includes(currentStatus.toUpperCase());

 return (
 <div
 key={job.schema_id}
 className={cn(
"p-4 rounded-lg border",
"bg-white/60",
"border-slate-200/50"
 )}
 >
 <div className="flex items-center justify-between mb-2">
 <div className="flex items-center gap-2">
 {getJobStatusIcon(currentStatus)}
 <span className="text-sm font-medium">
 {job.schema_name ? formatName(job.schema_name) : job.schema_id}
 </span>
 </div>
 <div className="flex items-center gap-2">
 {isSuccess && (
 <SecondaryButton
 size="sm"
 onClick={() => handleExportJob(job.job_id)}
 icon={Download}
 >
 Export
 </SecondaryButton>
 )}
 <span className="text-xs text-muted-foreground">
 {job.status === 'rejected' ? 'Rejected' : currentStatus}
 </span>
 </div>
 </div>

 {job.status === 'accepted' && (
 <div className="space-y-1">
 <div className="flex justify-between text-xs text-muted-foreground">
 <span>{jobStatus?.completed || 0} / {jobStatus?.total || documentCount}</span>
 <span>{Math.round(progress)}%</span>
 </div>
 <Progress
 value={isTerminal && !isSuccess ? 100 : progress}
 className="h-1.5"
 />
 </div>
 )}
 </div>
 );
 })}
 </div>

 {/* Overall Status */}
 {isPolling && (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Clock className="h-4 w-4 animate-pulse"/>
 <span>Monitoring progress... Jobs update every 5 seconds.</span>
 </div>
 )}

 <div className="flex justify-end">
 <SecondaryButton onClick={onClose}>
 {isPolling ? 'Close (jobs continue in background)' : 'Close'}
 </SecondaryButton>
 </div>
 </div>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
