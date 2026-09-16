"use client";

import React, { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
 LoadingIndicator,
 EmptyState,
 Badge,
 VariantButton,
 PageContainer,
} from "@/lib/styles/components";
import { Input } from "@/components/ui/input";
import {
 Popover,
 PopoverTrigger,
 PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
 CheckCircle2,
 XCircle,
 RefreshCw,
 Clock,
 FileText,
 FolderOpen,
 Plus,
 Eye,
 Trash2,
 Search,
 X,
 Info,
 Calendar,
 User,
 Filter,
 ChevronLeft,
 ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { DocumentExtractionResult } from "@/types/search";
import { DeleteConfirmationDialog } from "@/lib/styles/components/delete-confirmation-dialog";
import { EditorialCard, Headline } from "@/components/editorial";
import { StatusBadge } from "@/components/editorial/StatusBadge";
import { logger } from "@/lib/logger";

export const dynamic = 'force-dynamic';

// Status types
type StatusFilter = 'all' | 'completed' | 'in_progress' | 'failed';
type SortOption = 'newest' | 'oldest';

// Shared control styling — sharp edges, hairline rules, mono labels
const TOOLBAR_BUTTON = "inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors";
const TOOLBAR_BUTTON_IDLE = "border-rule bg-transparent text-ink-soft hover:border-ink hover:text-ink";
const TOOLBAR_BUTTON_ACTIVE = "border-ink bg-ink text-parchment";
const TOOLBAR_BUTTON_DISABLED = "border-rule text-ink-soft opacity-50 cursor-not-allowed";

interface ExtractionJob {
 job_id: string;
 collection_id?: string;
 collection_name?: string | null;
 schema_id?: string;
 schema_name?: string | null;
 status: string;
 created_at: string;
 updated_at?: string;
 started_at?: string;
 completed_at?: string;
 total_documents?: number;
 completed_documents?: number;
 user?: { email: string };
}

interface JobWithResults extends ExtractionJob {
 results?: DocumentExtractionResult[];
 resultsLoading?: boolean;
 document_ids?: string[];
 language?: string;
 extraction_context?: string;
}

// Helper function to extract username from email
function getUsernameFromEmail(email: string | undefined): string {
 if (!email) return 'Unknown';
 const parts = email.split('@');
 return parts[0] || 'Unknown';
}

// Helper function to format date compactly
function formatDateCompact(dateString: string): string {
 const date = new Date(dateString);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

 if (diffDays === 0) return 'Today';
 if (diffDays === 1) return 'Yesterday';
 if (diffDays < 7) return `${diffDays}d ago`;
 if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

 return date.toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
 });
}

// Normalize status to a standard format
function normalizeStatus(status: string): 'completed' | 'processing' | 'failed' | 'pending' {
 const normalized = status?.toUpperCase?.().trim() ?? '';
 if (['COMPLETED', 'SUCCESS', 'PARTIALLY_COMPLETED'].includes(normalized)) return 'completed';
 if (['FAILED', 'FAILURE', 'CANCELLED', 'REVOKED'].includes(normalized)) return 'failed';
 if (['PENDING', 'QUEUED'].includes(normalized)) return 'pending';
 return 'processing';
}

// Get status display text
function getStatusDisplayText(status: string): string {
 const normalized = normalizeStatus(status);
 switch (normalized) {
 case 'completed': return 'Completed';
 case 'failed': return 'Failed';
 case 'pending': return 'Pending';
 default: return 'In Progress';
 }
}

// Pagination
const ITEMS_PER_PAGE = 12;

// Filter buttons configuration
const FILTER_OPTIONS: { value: StatusFilter; label: string; icon: React.ElementType }[] = [
 { value: 'all', label: 'All', icon: Filter },
 { value: 'completed', label: 'Completed', icon: CheckCircle2 },
 { value: 'in_progress', label: 'In Progress', icon: RefreshCw },
 { value: 'failed', label: 'Failed', icon: XCircle },
];

function ExtractionsContent() {
 const router = useRouter();
 const searchParams = useSearchParams();
 const { user } = useAuth();
 const [loading, setLoading] = useState(true);
 const [jobs, setJobs] = useState<JobWithResults[]>([]);
 const [deletingJobId, setDeletingJobId] = useState<string | null>(null);
 const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
 const [isDeleting, setIsDeleting] = useState(false);
 const [retryingJobs, setRetryingJobs] = useState<Set<string>>(new Set());

 // Filter and sort state - initialized from URL params
 const [statusFilter, setStatusFilter] = useState<StatusFilter>(
 (searchParams.get('status') as StatusFilter) || 'all'
 );
 const [sortOption, setSortOption] = useState<SortOption>(
 (searchParams.get('sort') as SortOption) || 'newest'
 );
 const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
 const [currentPage, setCurrentPage] = useState(
 parseInt(searchParams.get('page') || '1', 10)
 );

 // Redirect to detail page if jobId query param is present
 useEffect(() => {
 const jobId = searchParams.get('jobId');
 if (jobId) {
 router.replace(`/extractions/${jobId}`);
 }
 }, [searchParams, router]);

 // Reset page when filters change
 useEffect(() => {
 setCurrentPage(1);
 }, [statusFilter, sortOption, searchQuery]);

 // Update URL when filters/page change
 useEffect(() => {
 const params = new URLSearchParams();
 if (statusFilter !== 'all') params.set('status', statusFilter);
 if (sortOption !== 'newest') params.set('sort', sortOption);
 if (searchQuery) params.set('q', searchQuery);
 if (currentPage > 1) params.set('page', currentPage.toString());

 const newUrl = params.toString() ? `?${params.toString()}` : '/extractions';
 window.history.replaceState({}, '', newUrl);
 }, [statusFilter, sortOption, searchQuery, currentPage]);

 // Fetch extraction jobs
 useEffect(() => {
 async function fetchJobs() {
 try {
 setLoading(true);

 const response = await fetch("/api/jobs", {
 method: "GET",
 headers: {
"Content-Type": "application/json",
 },
 });

 if (!response.ok) {
 throw new Error(`Failed to fetch jobs: ${response.statusText}`);
 }

 const data = await response.json();
 setJobs(data.jobs || []);
 } catch (error) {
 logger.error("Error fetching extraction jobs: ", error);
 toast.error("Failed to load extraction jobs");
 } finally {
 setLoading(false);
 }
 }

 fetchJobs();
 }, [user]);

 // Filter jobs based on search query
 const searchedJobs = useMemo(() => {
 if (!searchQuery.trim()) return jobs;
 const query = searchQuery.toLowerCase().trim();
 return jobs.filter(
 (job) =>
 job.schema_name?.toLowerCase().includes(query) ||
 job.collection_name?.toLowerCase().includes(query) ||
 job.job_id.toLowerCase().includes(query)
 );
 }, [jobs, searchQuery]);

 // Filter jobs by status
 const filteredJobs = useMemo(() => {
 if (statusFilter === 'all') return searchedJobs;

 return searchedJobs.filter((job) => {
 const status = normalizeStatus(job.status);
 switch (statusFilter) {
 case 'completed':
 return status === 'completed';
 case 'in_progress':
 return status === 'processing' || status === 'pending';
 case 'failed':
 return status === 'failed';
 default:
 return true;
 }
 });
 }, [searchedJobs, statusFilter]);

 // Sort jobs
 const sortedJobs = useMemo(() => {
 return [...filteredJobs].sort((a, b) => {
 const dateA = new Date(a.created_at).getTime();
 const dateB = new Date(b.created_at).getTime();
 return sortOption === 'newest' ? dateB - dateA : dateA - dateB;
 });
 }, [filteredJobs, sortOption]);

 // Get counts for filter badges
 const statusCounts = useMemo(() => {
 const counts = { all: jobs.length, completed: 0, in_progress: 0, failed: 0 };
 jobs.forEach((job) => {
 const status = normalizeStatus(job.status);
 if (status === 'completed') counts.completed++;
 else if (status === 'failed') counts.failed++;
 else counts.in_progress++;
 });
 return counts;
 }, [jobs]);

 // Pagination
 const totalPages = Math.ceil(sortedJobs.length / ITEMS_PER_PAGE);
 const paginatedJobs = useMemo(() => {
 const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
 return sortedJobs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
 }, [sortedJobs, currentPage]);

 const handleRetry = async (job: JobWithResults) => {
 if (!job.collection_id || !job.schema_id) {
 toast.error("Cannot retry: Missing collection or schema information");
 return;
 }

 try {
 setRetryingJobs(prev => new Set(prev).add(job.job_id));

 let documentIds: string[] = job.document_ids || [];
 const language = job.language || 'pl';
 const extractionContext = job.extraction_context || 'Extract structured information from legal documents using the provided schema.';

 if (documentIds.length === 0) {
 try {
 const jobDetailsResponse = await fetch(`/api/extractions?job_id=${job.job_id}`);
 if (jobDetailsResponse.ok) {
 const jobDetails = await jobDetailsResponse.json();
 if (jobDetails.results && Array.isArray(jobDetails.results)) {
 documentIds = jobDetails.results.map((r: DocumentExtractionResult) => r.document_id).filter(Boolean);
 }
 }
 } catch (error) {
 logger.warn('Could not fetch job details for document_ids:', error);
 }
 }

 if (documentIds.length === 0) {
 toast.error("Cannot retry: Document IDs not available. Please create a new extraction.");
 return;
 }

 const response = await fetch('/api/extractions', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 collection_id: job.collection_id,
 schema_id: job.schema_id,
 document_ids: documentIds,
 language: language,
 extraction_context: extractionContext,
 }),
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || errorData.error || `Failed to retry extraction: ${response.statusText}`);
 }

 const result = await response.json();
 toast.success('Extraction job retried successfully');

 const jobsResponse = await fetch("/api/jobs");
 if (jobsResponse.ok) {
 const data = await jobsResponse.json();
 setJobs(data.jobs || []);
 }

 if (result.job_id) {
 router.push(`/extractions?jobId=${result.job_id}`);
 }
 } catch (error) {
 logger.error('Error retrying extraction:', error);
 toast.error(error instanceof Error ? error.message : 'Failed to retry extraction');
 } finally {
 setRetryingJobs(prev => {
 const newSet = new Set(prev);
 newSet.delete(job.job_id);
 return newSet;
 });
 }
 };

 const handleDeleteClick = (job: JobWithResults) => {
 setDeletingJobId(job.job_id);
 setDeleteDialogOpen(true);
 };

 const handleDeleteConfirm = async () => {
 if (!deletingJobId) return;

 try {
 setIsDeleting(true);

 const response = await fetch(`/api/extractions/delete?job_id=${deletingJobId}`, {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json' },
 });

 if (!response.ok) {
 const errorData = await response.json().catch(() => ({}));
 throw new Error(errorData.message || errorData.error || `Failed to delete job: ${response.statusText}`);
 }

 toast.success('Extraction job deleted successfully');
 setJobs(prev => prev.filter(j => j.job_id !== deletingJobId));
 setDeleteDialogOpen(false);
 setDeletingJobId(null);
 } catch (error) {
 logger.error('Error deleting extraction job:', error);
 toast.error(error instanceof Error ? error.message : 'Failed to delete extraction job');
 } finally {
 setIsDeleting(false);
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
 <LoadingIndicator size="lg"message="Loading extraction jobs..."/>
 </div>
 );
 }

 return (
 <PageContainer fillViewport={true}>
 {jobs.length === 0 ? (
 <EmptyState
 title="No Extractions Yet"
 description="You haven't extracted any data from your documents yet. Start by selecting a collection and schema to extract structured information."
 icon={FileText}
 variant="default"
 primaryAction={{
 label: "Start Extraction",
 onClick: () => router.push("/extract"),
 icon: Plus,
 }}
 secondaryAction={{
 label: "Browse Schemas",
 onClick: () => router.push("/schemas"),
 icon: FolderOpen,
 }}
 />
 ) : (
 <>
 {/* Header Section */}
 <div className="mb-6">
 <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
 <div className="flex items-center gap-3">
 <Headline as="h1" size="xs">
 Browse your <em>extraction jobs</em>
 </Headline>
 <Popover>
 <PopoverTrigger asChild>
 <button
 type="button"
 className="inline-flex items-center justify-center w-5 h-5 text-ink-soft hover:text-ink transition-colors"
 aria-label="What is an extraction? "
 >
 <Info className="h-4 w-4"/>
 </button>
 </PopoverTrigger>
 <PopoverContent
 className="w-80 rounded-none border border-rule bg-parchment p-5 shadow-none"
 align="start"
 >
 <div className="space-y-3">
 <h4 className="font-semibold text-sm text-ink">What is an extraction job?</h4>
 <p className="text-sm text-ink-soft leading-relaxed">
 An extraction job processes documents from a collection using a schema to extract structured data.
 Each job tracks progress and stores results for all processed documents.
 </p>
 </div>
 </PopoverContent>
 </Popover>
 </div>
 <VariantButton intent="primary"
 icon={Plus}
 onClick={() => router.push('/extract')}
 >
 New Extraction
 </VariantButton>
 </div>

 {/* Search Bar */}
 <div className="space-y-3">
 <div className="relative w-full">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground"/>
 <Input
 type="search"
 placeholder="Search by schema, collection, or job ID..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className={cn(
"w-full pl-10 pr-10 h-12",
"rounded-none border-rule bg-parchment",
"focus:border-ink focus-visible:ring-0"
 )}
 />
 {searchQuery && (
 <button
 onClick={() => setSearchQuery('')}
 className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-soft hover:text-ink transition-colors"
 aria-label="Clear search"
 >
 <X className="h-4 w-4 text-muted-foreground hover:text-foreground"/>
 </button>
 )}
 </div>

 {/* Filter Tabs and Sort */}
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 {/* Filter Tabs */}
 <div className="flex flex-wrap gap-2">
 {FILTER_OPTIONS.map(({ value, label, icon: Icon }) => (
 <button
 key={value}
 onClick={() => setStatusFilter(value)}
 className={cn(
TOOLBAR_BUTTON,
 statusFilter === value ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_IDLE
 )}
 aria-pressed={statusFilter === value}
 >
 <Icon className="h-3.5 w-3.5"/>
 {label}
 <span className="ml-1 tabular-nums opacity-70">
 {statusCounts[value]}
 </span>
 </button>
 ))}
 </div>

 {/* Sort Dropdown */}
 <div className="flex items-center gap-2">
 <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Sort by</span>
 <select
 value={sortOption}
 onChange={(e) => setSortOption(e.target.value as SortOption)}
 className="border border-rule bg-parchment px-2 py-1 font-mono text-[11px] uppercase tracking-wider text-ink"
 >
 <option value="newest">Newest First</option>
 <option value="oldest">Oldest First</option>
 </select>
 </div>
 </div>

 {/* Results count */}
 <div className="text-sm text-ink-soft">
 {searchQuery || statusFilter !== 'all' ? (
 <>
 Found <span className="font-mono tabular-nums text-ink">{sortedJobs.length}</span> extraction{sortedJobs.length !== 1 ? 's' : ''}
 </>
 ) : (
 <>
 <span className="font-mono tabular-nums text-ink">{jobs.length}</span> extraction{jobs.length !== 1 ? 's' : ''} total
 </>
 )}
 </div>
 </div>
 </div>

 {/* Empty filtered state */}
 {sortedJobs.length === 0 ? (
 <EmptyState
 title="No Matching Extractions"
 description={searchQuery ? `No extractions found matching"${searchQuery}".` : "No extractions match the selected filter."}
 icon={Search}
 variant="default"
 primaryAction={{
 label: "Clear Filters",
 onClick: () => {
 setSearchQuery('');
 setStatusFilter('all');
 },
 icon: X,
 }}
 />
 ) : (
 <>
 {/* Extraction Cards Grid */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
 {paginatedJobs.map((job) => {
 const status = normalizeStatus(job.status);
 const username = getUsernameFromEmail(job.user?.email);
 const isRetrying = retryingJobs.has(job.job_id);

 return (
 <EditorialCard
 key={job.job_id}
 clickable
 onClick={() => router.push(`/extractions/${job.job_id}`)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 router.push(`/extractions/${job.job_id}`);
 }
 }}
 role="button"
 tabIndex={0}
 className={cn(
"group min-h-[280px]",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
 )}
 aria-label={`Extraction: ${job.schema_name || 'Unnamed'}. Status: ${getStatusDisplayText(job.status)}. Click to view details.`}
 >
 {/* Header */}
 <div className="flex flex-col gap-2 mb-3">
 <h3 className="editorial-display text-lg leading-tight line-clamp-2 text-ink">
 {job.schema_name || 'Extraction Job'}
 </h3>
 <div className="flex gap-2 flex-wrap">
 <StatusBadge status={status} label={getStatusDisplayText(job.status)} size="sm" />
 <Badge variant="outline"className="font-mono text-xs px-2 py-0.5 tabular-nums">
 {job.completed_documents || 0}/{job.total_documents || 0} docs
 </Badge>
 </div>
 </div>

 {/* Collection */}
 <div className="flex-1 min-h-0 mb-4">
 <div className="flex items-center gap-2 text-sm text-ink-soft mb-2">
 <FolderOpen className="h-4 w-4 shrink-0"/>
 <span className="truncate">
 {job.collection_name || 'Unknown Collection'}
 </span>
 </div>
 </div>

 {/* Metadata Footer */}
 <div className="flex flex-col gap-3 mt-auto">
 {/* Metadata */}
 <div className="flex flex-col gap-1.5 text-xs text-ink-soft">
 <div className="flex items-center gap-2">
 <Calendar className="h-3.5 w-3.5 shrink-0"/>
 <span>Created: {formatDateCompact(job.created_at)}</span>
 </div>
 {job.updated_at && job.updated_at !== job.created_at && (
 <div className="flex items-center gap-2">
 <Clock className="h-3.5 w-3.5 shrink-0"/>
 <span>Updated: {formatDateCompact(job.updated_at)}</span>
 </div>
 )}
 <div className="flex items-center gap-2">
 <User className="h-3.5 w-3.5 shrink-0"/>
 <span className="truncate">By: {username}</span>
 </div>
 </div>

 {/* Action Buttons - Revealed on hover */}
 <div className="flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200 pt-2 border-t border-rule">
 <button
 onClick={(e) => {
 e.stopPropagation();
 router.push(`/extractions/${job.job_id}`);
 }}
 className={cn(
"flex-1 justify-center",
 TOOLBAR_BUTTON,
 TOOLBAR_BUTTON_IDLE
 )}
 aria-label="View results"
 >
 <Eye className="h-3.5 w-3.5"/>
 View
 </button>
 {status === 'failed' && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleRetry(job);
 }}
 disabled={isRetrying}
 className={cn(
"justify-center",
 TOOLBAR_BUTTON,
 isRetrying ? TOOLBAR_BUTTON_DISABLED : TOOLBAR_BUTTON_IDLE
 )}
 aria-label="Retry extraction"
 >
 <RefreshCw className={cn("h-3.5 w-3.5", isRetrying &&"animate-spin")} />
 {isRetrying ? '...' : 'Retry'}
 </button>
 )}
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleDeleteClick(job);
 }}
 className={cn(
"justify-center",
 TOOLBAR_BUTTON,
"border-rule text-oxblood hover:border-oxblood"
 )}
 aria-label="Delete extraction"
 >
 <Trash2 className="h-3.5 w-3.5"/>
 </button>
 </div>
 </div>
 </EditorialCard>
 );
 })}
 </div>

 {/* Pagination Controls */}
 {totalPages > 1 && (
 <div className="flex items-center justify-center gap-2 mt-8">
 <button
 onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
 disabled={currentPage === 1}
 className={cn(
TOOLBAR_BUTTON,
 currentPage === 1 ? TOOLBAR_BUTTON_DISABLED : TOOLBAR_BUTTON_IDLE
 )}
 aria-label="Previous page"
 >
 <ChevronLeft className="h-4 w-4"/>
 Previous
 </button>

 <div className="flex items-center gap-1">
 {Array.from({ length: totalPages }, (_, i) => i + 1)
 .filter(page => {
 // Show first, last, current, and adjacent pages
 if (page === 1 || page === totalPages) return true;
 if (Math.abs(page - currentPage) <= 1) return true;
 return false;
 })
 .map((page, index, arr) => {
 // Add ellipsis if there's a gap
 const prevPage = arr[index - 1];
 const showEllipsis = prevPage && page - prevPage > 1;

 return (
 <React.Fragment key={page}>
 {showEllipsis && (
 <span className="px-2 font-mono text-ink-soft">…</span>
 )}
 <button
 onClick={() => setCurrentPage(page)}
 className={cn(
"h-9 w-9 justify-center px-0 tabular-nums",
 TOOLBAR_BUTTON,
 currentPage === page ? TOOLBAR_BUTTON_ACTIVE : TOOLBAR_BUTTON_IDLE
 )}
 aria-label={`Page ${page}`}
 aria-current={currentPage === page ? 'page' : undefined}
 >
 {page}
 </button>
 </React.Fragment>
 );
 })}
 </div>

 <button
 onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
 disabled={currentPage === totalPages}
 className={cn(
TOOLBAR_BUTTON,
 currentPage === totalPages ? TOOLBAR_BUTTON_DISABLED : TOOLBAR_BUTTON_IDLE
 )}
 aria-label="Next page"
 >
 Next
 <ChevronRight className="h-4 w-4"/>
 </button>
 </div>
 )}

 {/* Page info */}
 {totalPages > 1 && (
 <div className="text-center font-mono text-[11px] uppercase tracking-wider text-ink-soft mt-4">
 Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, sortedJobs.length)} of {sortedJobs.length} extractions
 </div>
 )}
 </>
 )}
 </>
 )}

 {/* Delete Confirmation Dialog */}
 <DeleteConfirmationDialog
 open={deleteDialogOpen}
 onOpenChange={setDeleteDialogOpen}
 title="Delete Extraction Job"
 description="Are you sure you want to delete this extraction job? This action cannot be undone and all results will be permanently removed."
 itemName="extraction job"
 isDeleting={isDeleting}
 onConfirm={handleDeleteConfirm}
 />
 </PageContainer>
 );
}

function ExtractionsLoading() {
 return (
 <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
 <LoadingIndicator size="lg"message="Loading extraction jobs..."/>
 </div>
 );
}

export default function ExtractionsPage() {
 return (
 <Suspense fallback={<ExtractionsLoading />}>
 <ExtractionsContent />
 </Suspense>
 );
}
