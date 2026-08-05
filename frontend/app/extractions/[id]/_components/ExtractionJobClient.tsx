"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
 BaseCard,
 EmptyState,
 VariantButton,
 Badge,
 PageContainer,
 SearchableDropdownButton,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { DocumentExtractionResult, DocumentProcessingStatus } from "@/types/search";
import {
 ArrowLeft,
 CheckCircle2,
 XCircle,
 RefreshCw,
 Database,
 FileText,
 Code,
 Printer,
 FileCode,
 ExternalLink,
 FolderOpen,
 Table2,
 LayoutList,
} from "lucide-react";
import Link from "next/link";
import { ExtractionDataViewer } from "@/lib/styles/components/extraction";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import { ExtractionResultsTable } from "@/components/extraction-results-table";
import { logger } from "@/lib/logger";
import {
 isTerminalExtractionStatus,
 normalizeExtractionJobPayload,
 type ExtractionJobSnapshot,
} from "@/lib/extractions/detail-contract";
import"../print.css";

/**
 * Flattens nested object for table display
 * Converts nested objects like { a: { b: 1 } } to {"a.b": 1 }
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
 const result: Record<string, unknown> = {};

 for (const [key, value] of Object.entries(obj)) {
 const newKey = prefix ? `${prefix}.${key}` : key;

 if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
 Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
 } else if (Array.isArray(value)) {
 // Convert arrays to comma-separated strings for simple arrays
 // or JSON string for complex arrays
 if (value.length > 0 && typeof value[0] === 'object') {
 result[newKey] = JSON.stringify(value);
 } else {
 result[newKey] = value.join(', ');
 }
 } else {
 result[newKey] = value;
 }
 }

 return result;
}

export const dynamic = 'force-dynamic';

// Status badge colors
const STATUS_COLORS = {
 completed: "bg-green-100 text-green-800 border-green-200",
 processing: "bg-blue-100 text-blue-800 border-blue-200",
 failed: "bg-red-100 text-red-800 border-red-200",
};

interface ExtractionJobClientProps {
 jobId: string;
 initialJob: ExtractionJobSnapshot;
}

interface PollError {
 status: number;
 message: string;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 10_000;

export function ExtractionJobClient({ jobId, initialJob }: ExtractionJobClientProps) {
 const router = useRouter();
 const [jobData, setJobData] = useState<ExtractionJobSnapshot>(initialJob);
 const [pollError, setPollError] = useState<PollError | null>(null);
 const [selectedResult, setSelectedResult] = useState<DocumentExtractionResult | null>(null);
 const [resultsView, setResultsView] = useState<'document' | 'table'>('table');
 const [viewMode, setViewMode] = useState<'formatted' | 'json'>('formatted');

 // Update document title when a specific document is selected
 useEffect(() => {
 if (selectedResult && jobData) {
 const docName = selectedResult.document_id;
 const schema = jobData.schema_name || '';
 const dateStr = new Date().toLocaleDateString();
 document.title = `${docName} ${schema} ${dateStr}`;
 }
 }, [selectedResult, jobData]);

 // Continue polling live jobs without repeating the middleware's initial read.
 useEffect(() => {
 if (isTerminalExtractionStatus(jobData.status)) return;
 let active = true;
 let pollTimer: number | undefined;
 let requestTimeout: number | undefined;
 let requestController: AbortController | undefined;

 const schedulePoll = () => {
 if (!active) return;
 pollTimer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
 };

 const poll = async () => {
 let timedOut = false;
 requestController = new AbortController();
 requestTimeout = window.setTimeout(() => {
 timedOut = true;
 requestController?.abort();
 }, POLL_TIMEOUT_MS);
 try {
 const response = await fetch(`/api/extractions?job_id=${jobId}`, {
 method: "GET",
 headers: { Accept: "application/json" },
 cache: "no-store",
 signal: requestController.signal,
 });
 const payload: unknown = await response.json().catch(() => null);
 if (!response.ok) {
 const errorPayload = payload as Record<string, unknown> | null;
 const message =
 (typeof errorPayload?.message === "string" && errorPayload.message) ||
 (typeof errorPayload?.error === "string" && errorPayload.error) ||
 `Extraction service failed with status ${response.status}`;
 throw Object.assign(new Error(message), { status: response.status });
 }
 const nextJob = normalizeExtractionJobPayload(payload, jobId);
 if (!nextJob) {
 throw Object.assign(new Error("The extraction service returned malformed data."), {
 status: 502,
 });
 }
 if (!active) return;
 setJobData((currentJob) =>
 isTerminalExtractionStatus(currentJob.status) &&
 !isTerminalExtractionStatus(nextJob.status)
 ? currentJob
 : nextJob
 );
 setPollError(null);
 if (isTerminalExtractionStatus(nextJob.status)) return;
 } catch (error) {
 if (!active) return;
 const status =
 timedOut ? 504 :
 typeof error === "object" && error !== null && "status" in error &&
 typeof error.status === "number" ? error.status : 503;
 const message = timedOut
 ? "The extraction service timed out. Please try again."
 : error instanceof Error
 ? error.message
 : "The extraction service is unavailable.";
 logger.error("Error refreshing extraction job: ", error);
 setPollError({ status, message });
 } finally {
 if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
 requestTimeout = undefined;
 requestController = undefined;
 }
 schedulePoll();
 };
 schedulePoll();
 return () => {
 active = false;
 if (pollTimer !== undefined) window.clearTimeout(pollTimer);
 if (requestTimeout !== undefined) window.clearTimeout(requestTimeout);
 requestController?.abort();
 };
 }, [jobData.status, jobId]);

 useEffect(() => {
 const dateStr = new Date().toLocaleDateString();
 document.title = `${jobData.collection_name || ''} ${jobData.schema_name || ''} ${dateStr}`.trim();
 }, [jobData.collection_name, jobData.schema_name]);

 const normalizeStatus = (status: string | DocumentProcessingStatus): string => {
 if (typeof status === 'string') {
 return status.toLowerCase().trim();
 }
 return status;
 };

 // Get all results and filter by status
 const allResults = jobData?.results || [];
 const completedResults = allResults.filter((r: DocumentExtractionResult) => {
 const status = normalizeStatus(r.status);
 return status === DocumentProcessingStatus.COMPLETED ||
 status === 'completed' ||
 status === 'success';
 });

 const failedResults = allResults.filter((r: DocumentExtractionResult) => {
 const status = normalizeStatus(r.status);
 return status === DocumentProcessingStatus.FAILED ||
 status === 'failed' ||
 status === 'failure';
 });

 const totalResults = allResults.length;
 const processedCount = completedResults.length;
 const failedCount = failedResults.length;

 // Compute table data: flatten all completed results and extract columns
 const tableData = useMemo(() => {
 if (completedResults.length === 0) {
 return { columns: [], rows: [] };
 }

 // Collect all unique column names from all results
 const columnSet = new Set<string>();
 const rows: Array<{ document_id: string; status: string; data: Record<string, unknown> }> = [];

 completedResults.forEach((result) => {
 if (!result.extracted_data) return;

 const flattened = flattenObject(result.extracted_data);
 Object.keys(flattened).forEach((key) => columnSet.add(key));

 rows.push({
 document_id: result.document_id,
 status: result.status,
 data: flattened,
 });
 });

 // Sort columns alphabetically
 const columns = Array.from(columnSet).sort();

 return { columns, rows };
 }, [completedResults]);

 // Auto-select first completed result if available, otherwise first result
 useEffect(() => {
 if (!selectedResult && jobData) {
 if (completedResults.length > 0) {
 setSelectedResult(completedResults[0]);
 } else if (allResults.length > 0) {
 setSelectedResult(allResults[0]);
 }
 }
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [jobData]);

 // Get status badge for a result
 const getStatusBadge = (result: DocumentExtractionResult) => {
 const status = normalizeStatus(result.status);
 if (status === DocumentProcessingStatus.COMPLETED || status === 'completed' || status === 'success') {
 return { className: STATUS_COLORS.completed, label: 'Completed', icon: CheckCircle2 };
 }
 if (status === DocumentProcessingStatus.FAILED || status === 'failed' || status === 'failure') {
 return { className: STATUS_COLORS.failed, label: 'Failed', icon: XCircle };
 }
 return { className: STATUS_COLORS.processing, label: 'In Progress', icon: RefreshCw };
 };

 // Create document options for selector
 const documentOptions = allResults.map((result, index) => {
 const statusInfo = getStatusBadge(result);
 const status = normalizeStatus(result.status);
 const isFailed = status === DocumentProcessingStatus.FAILED || status === 'failed' || status === 'failure';

 let description = result.completed_at
 ? `Completed: ${new Date(result.completed_at).toLocaleString()}`
 : result.started_at
 ? `Started: ${new Date(result.started_at).toLocaleString()}`
 : 'Pending';

 // Add error message to description for failed documents
 if (isFailed && result.error_message) {
 description = `Failed: ${result.error_message}`;
 }

 return {
 value: result.document_id || `doc-${index}`,
 label: result.document_id || `Document ${index + 1}`,
 description,
 badge: statusInfo.label,
 };
 });

 // Get selected document result
 const selectedDocumentId = selectedResult?.document_id;
 const handleDocumentChange = (documentId: string) => {
 const result = allResults.find(r => r.document_id === documentId);
 setSelectedResult(result || null);
 };

 // Handler for viewing the document
 const handleViewDocument = () => {
 if (selectedDocumentId) {
 const cleanedId = cleanDocumentIdForUrl(selectedDocumentId);
 window.open(`/documents/${cleanedId}`, '_blank');
 }
 };

 // Main job details view
 return (
 <PageContainer fillViewport={true}>
 {pollError && (
 <BaseCard variant="light" className="mb-6 border-red-200">
 <div className="flex items-start gap-3 -m-3.5 p-6" role="alert">
 <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
 <div>
 <h2 className="font-semibold text-red-900">
 Extraction service error ({pollError.status})
 </h2>
 <p className="text-sm text-red-800">{pollError.message}</p>
 <p className="mt-1 text-xs text-red-700">
 The last verified job data remains visible while the service recovers.
 </p>
 </div>
 </div>
 </BaseCard>
 )}
 {/* Back button */}
 <div className="flex items-center gap-4 mb-6 print:hidden">
 <VariantButton intent="secondary"
 icon={ArrowLeft}
 onClick={() => router.push('/extractions')}
 >
 Back to Extractions
 </VariantButton>
 </div>

 <div className="space-y-4">
 <BaseCard
 variant="light"
 title={
 jobData.created_at
 ? `Extraction - ${new Date(jobData.created_at).toLocaleString()}`
 : 'Extraction'
 }
 >
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 -m-3.5 p-6">
 {/* Job ID and Processed Documents - full width row */}
 <div className="md:col-span-2">
 <div className="grid grid-cols-2 gap-4">
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Job ID</div>
 <div className="font-mono text-sm break-all">{jobId}</div>
 </div>
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Processed Documents</div>
 <div className="text-sm">
 {processedCount} / {totalResults}
 {failedCount > 0 && (
 <span className="text-red-600 ml-2">
 ({failedCount} failed)
 </span>
 )}
 </div>
 </div>
 </div>
 </div>

 {/* Schema Name */}
 {jobData.schema_name && (
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Schema</div>
 <div className="flex items-center gap-1.5 text-sm">
 <Database className="h-4 w-4 text-muted-foreground"/>
 {jobData.schema_id ? (
 <Link
 href={`/schemas/${jobData.schema_id}`}
 className="text-primary hover:underline flex items-center gap-1"
 >
 {jobData.schema_name}
 <ExternalLink className="h-3 w-3"/>
 </Link>
 ) : (
 <span>{jobData.schema_name}</span>
 )}
 </div>
 </div>
 )}

 {/* Collection Name */}
 {jobData.collection_name && (
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Collection</div>
 <div className="flex items-center gap-1.5 text-sm">
 <FolderOpen className="h-4 w-4 text-muted-foreground"/>
 {jobData.collection_id ? (
 <Link
 href={`/collections/${jobData.collection_id}`}
 className="text-primary hover:underline flex items-center gap-1"
 >
 {jobData.collection_name}
 <ExternalLink className="h-3 w-3"/>
 </Link>
 ) : (
 <span>{jobData.collection_name}</span>
 )}
 </div>
 </div>
 )}

 {/* Status */}
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</div>
 <Badge
 variant={jobData.status?.toLowerCase() === 'failed' || jobData.status?.toLowerCase() === 'failure' ? 'destructive' : 'outline'}
 className={cn(
"font-medium w-fit",
 (jobData.status?.toLowerCase() === 'completed' || jobData.status?.toLowerCase() === 'success') &&"bg-green-100 text-green-800 border-green-200",
 jobData.status?.toLowerCase() === 'processing' &&"bg-blue-100 text-blue-800 border-blue-200"
 )}
 >
 {jobData.status?.toLowerCase() === 'processing' && <RefreshCw className="h-3 w-3 mr-1 animate-spin"/>}
 {(jobData.status?.toLowerCase() === 'completed' || jobData.status?.toLowerCase() === 'success') && <CheckCircle2 className="h-3 w-3 mr-1"/>}
 {(jobData.status?.toLowerCase() === 'failed' || jobData.status?.toLowerCase() === 'failure') && <XCircle className="h-3 w-3 mr-1"/>}
 {jobData.status.charAt(0).toUpperCase() + jobData.status.slice(1)}
 </Badge>
 </div>

 {/* Completion Time */}
 {jobData.updated_at && (
 <div className="space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
 {jobData.status === 'completed' ? 'Completed' : 'Last Updated'}
 </div>
 <div className="text-sm">{new Date(jobData.updated_at).toLocaleString()}</div>
 </div>
 )}
 </div>
 </BaseCard>

 </div>

 {/* View Toggle */}
 {completedResults.length > 0 && (
 <div className="flex items-center justify-between mb-6 print:hidden">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
 Results View
 </div>
 <div className="flex items-center gap-2">
 <Tabs value={resultsView} onValueChange={(v) => setResultsView(v as 'document' | 'table')}>
 <TabsList className="bg-slate-100/60 border border-slate-200/50 h-9">
 <TabsTrigger
 value="table"
 className="flex items-center gap-2 px-3 data-[state=active]:bg-white/80 data-[state=active]:shadow-sm"
 >
 <Table2 className="h-4 w-4"/>
 Table
 </TabsTrigger>
 <TabsTrigger
 value="document"
 className="flex items-center gap-2 px-3 data-[state=active]:bg-white/80 data-[state=active]:shadow-sm"
 >
 <LayoutList className="h-4 w-4"/>
 Document
 </TabsTrigger>
 </TabsList>
 </Tabs>
 </div>
 </div>
 )}

 {/* Table View */}
 {resultsView === 'table' && completedResults.length > 0 && (
 <div className="mb-6 print:hidden">
 <ExtractionResultsTable
 columns={tableData.columns}
 rows={tableData.rows}
 pageSize={20}
 pageSizeOptions={[10, 20, 50, 100]}
 onDocumentClick={(documentId) => {
 const cleanedId = cleanDocumentIdForUrl(documentId);
 window.open(`/documents/${cleanedId}`, '_blank');
 }}
 onRowClick={(row) => {
 const result = completedResults.find(r => r.document_id === row.document_id);
 if (result) {
 setSelectedResult(result);
 setResultsView('document');
 }
 }}
 emptyMessage="No completed extraction results"
 exportOptions={{
 enabled: true,
 filename: `${jobData?.collection_name || 'extraction'}_${jobData?.schema_name || 'results'}_${new Date().toISOString().split('T')[0]}`.replace(/\s+/g, '-'),
 formats: ['xlsx', 'csv', 'json'],
 exportFiltered: true,
 }}
 />
 </div>
 )}

 {/* Document View: Document Selector */}
 {resultsView === 'document' && (
 <div className="mb-6 print:hidden space-y-1">
 <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document</div>
 <div className="flex items-center gap-3">
 <div className="flex-1">
 <SearchableDropdownButton
 icon={<FileCode size={16} />}
 label="Select a document"
 value={selectedDocumentId || ""}
 options={documentOptions}
 onChange={handleDocumentChange}
 searchPlaceholder="Search documents by ID..."
 />
 </div>
 {selectedDocumentId && (
 <VariantButton intent="secondary"
 icon={ExternalLink}
 onClick={handleViewDocument}
 >
 View Document
 </VariantButton>
 )}
 </div>
 </div>
 )}

 {/* Failed Documents Summary */}
 {failedCount > 0 && (
 <div className="mb-6">
 <BaseCard variant="light"className="border-red-200">
 <div className="flex items-start gap-3 -m-3.5 p-6">
 <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5"/>
 <div className="flex-1 min-w-0">
 <h3 className="text-sm font-semibold text-red-900 mb-2">
 {failedCount} Document{failedCount !== 1 ? 's' : ''} Failed
 </h3>
 <div className="space-y-2">
 {failedResults.map((result) => (
 <div
 key={result.document_id}
 className="text-sm p-2 bg-red-50 rounded border border-red-200"
 >
 <div className="font-mono text-xs text-red-900 mb-1">
 {result.document_id}
 </div>
 {result.error_message && (
 <div className="text-xs text-red-800 whitespace-pre-wrap break-words">
 {result.error_message}
 </div>
 )}
 </div>
 ))}
 </div>
 </div>
 </div>
 </BaseCard>
 </div>
 )}

 {/* Empty State if no results */}
 {totalResults === 0 && (
 <EmptyState
 title="No Results Available"
 description="This extraction job hasn't produced any results yet"
 icon={Database}
 variant="default"
 />
 )}

 {/* Selected Document Data Viewer - Only show in document view for successful documents */}
 {resultsView === 'document' && selectedResult && (() => {
 const status = normalizeStatus(selectedResult.status);
 const isFailed = status === DocumentProcessingStatus.FAILED || status === 'failed' || status === 'failure';
 const hasData = selectedResult.extracted_data && Object.keys(selectedResult.extracted_data).length > 0;

 // Only show data viewer for successful documents with data
 if (isFailed || !hasData) {
 return null;
 }

 return (
 <div className="mt-6">
 {/* Print-only document title and schema header */}
 <div className="hidden print:block print:border-b print:border-black print:mb-4 print:pb-4">
 <h1 className="print:text-2xl print:font-bold print:m-0 print:p-0">
 {selectedResult.document_id || "Document"}
 </h1>
 <h3 className="text-base font-semibold text-foreground truncate">
 {`${jobData.collection_name || ''} ${jobData.schema_name || ''}`.trim()}
 {jobData.updated_at && (
 <>
 <span className="mx-2">|</span>
 {new Date(jobData.updated_at).toLocaleDateString()}
 </>
 )}
 </h3>
 </div>

 <BaseCard variant="light"className="p-0">
 <div className="space-y-6 -m-3.5 p-6">
 {/* Tabs and Print button header */}
 <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-200/50">
 <Tabs
 value={viewMode}
 onValueChange={(value) => setViewMode(value as"formatted"|"json")}
 className="flex-1"
 >
 <TabsList className="bg-slate-100/60 border border-slate-200/50 h-10">
 <TabsTrigger
 value="formatted"
 className="flex items-center gap-2 px-4 data-[state=active]:bg-white/80 data-[state=active]:shadow-sm data-[state=active]:text-foreground"
 >
 <FileText className="h-4 w-4"/>
 Formatted View
 </TabsTrigger>
 <TabsTrigger
 value="json"
 className="flex items-center gap-2 px-4 data-[state=active]:bg-white/80 data-[state=active]:shadow-sm data-[state=active]:text-foreground"
 >
 <Code className="h-4 w-4"/>
 JSON View
 </TabsTrigger>
 </TabsList>
 </Tabs>
 <VariantButton intent="secondary"
 icon={Printer}
 onClick={() => window.print()}
 size="sm"
 >
 Print
 </VariantButton>
 </div>

 {/* Tab content */}
 <Tabs
 value={viewMode}
 onValueChange={(value) => setViewMode(value as"formatted"|"json")}
 className="w-full"
 >
 <TabsContent value="formatted"className="mt-0 px-6 pb-6">
 <ExtractionDataViewer
 data={selectedResult.extracted_data}
 viewMode="document"
 globalLayout="list"
 />
 </TabsContent>
 <TabsContent value="json"className="mt-0 px-6 pb-6">
 <div className="overflow-auto max-h-[80vh] rounded-lg border border-slate-200/50">
 <pre className="text-sm whitespace-pre-wrap font-mono bg-slate-50/60 p-6 rounded-lg">
 {JSON.stringify(selectedResult.extracted_data, null, 2)}
 </pre>
 </div>
 </TabsContent>
 </Tabs>
 </div>
 </BaseCard>
 </div>
 );
 })()}
 </PageContainer>
 );
}
