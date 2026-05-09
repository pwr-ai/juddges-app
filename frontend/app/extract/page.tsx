"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Wand2, Eye, X, Link as LinkIcon, FileText, Calendar, Sparkles, FolderOpen, FileCode, Globe, AlertCircle, ChevronUp, ChevronDown, Clock, CheckCircle2, XCircle, RefreshCw, Loader2, Layers } from "lucide-react";
import { toast } from "sonner";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { SchemaPreview } from "@/lib/styles/components/schema-preview";
import { SchemaGenerator } from "@/components/SchemaGenerator";
import { BulkExtractionDialog } from "@/components/BulkExtractionDialog";
import { Progress } from "@/components/ui/progress";
import {
 Header,
 BaseCard,
 PrimaryButton,
 SecondaryButton,
 AccentButton,
 TextButton,
 LoadingIndicator,
 EmptyState,
 DropdownButton,
 SearchableDropdownButton,
 AIBadge,
 PageContainer,
 SectionHeader,
 GlassButton,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { ErrorCode } from "@/lib/errors";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import { logger } from "@/lib/logger";

interface Collection {
 id: string;
 name: string;
 description?: string | null;
 documents?: { id: string }[] | null;
 document_count?: number | null;
}

interface CollectionDocument {
 id: string;
 document_id: string;
 document_date: string | null;
 volume_number: number;
 title?: string | null;
 document_title?: string | null;
 document_number?: string | null;
 docket_number?: string | null;
 document_type?: string | null;
}

/**
 * Error code to user-friendly message mapping
 */
const ERROR_MESSAGES: Record<string, string> = {
 [ErrorCode.EMPTY_DOCUMENT_LIST]: "The selected collection is empty. Please add documents to the collection before starting extraction.",
 EMPTY_COLLECTION: "The selected collection is empty. Please add documents to the collection before starting extraction.",
 [ErrorCode.MISSING_REQUIRED_FIELD]: "Please ensure both collection and schema are selected.",
 MISSING_SCHEMA_ID: "Please ensure both collection and schema are selected.",
 MISSING_COLLECTION_ID: "Please ensure both collection and schema are selected.",
 [ErrorCode.UNAUTHORIZED]: "Your session has expired. Please log in again.",
 [ErrorCode.TASK_SUBMISSION_FAILED]: "The extraction service is temporarily unavailable. Please try again in a few moments.",
 BACKEND_ERROR: "The extraction service is temporarily unavailable. Please try again in a few moments.",
 [ErrorCode.VECTOR_DB_UNAVAILABLE]: "The vector database service is currently unavailable. Please check the service status and try again later.",
 [ErrorCode.LLM_SERVICE_UNAVAILABLE]: "The AI service is currently unavailable. Please try again later.",
 [ErrorCode.DATABASE_UNAVAILABLE]: "The database service is currently unavailable. Please try again later.",
 [ErrorCode.VALIDATION_ERROR]: "The request contains invalid data. Please check your inputs.",
 [ErrorCode.INTERNAL_ERROR]: "An internal error occurred. Please try again or contact support.",
};

/**
 * HTTP status code to default error message mapping
 */
const STATUS_MESSAGES: Record<number, string> = {
 400: "The request contains invalid data. Please check your inputs.",
 401: "Your session has expired. Please log in again.",
 403: "You don't have permission to perform this action.",
 404: "The requested resource was not found.",
 429: "Too many requests. Please try again later.",
 500: "An internal server error occurred. Please try again or contact support.",
 503: "The extraction service is temporarily unavailable. Please try again in a few moments.",
};

/**
 * Parse error response from API
 */
interface ParsedError {
 errorTitle: string;
 errorMessage: string;
 errorCode: string | null;
}

function parseErrorResponse(
 response: Response,
 errorData: unknown
): ParsedError {
 let errorTitle ="Extraction Failed";
 let errorMessage = STATUS_MESSAGES[response.status] || `Server returned error status ${response.status}`;
 let errorCode: string | null = null;

 if (!errorData || typeof errorData !== 'object') {
 return { errorTitle, errorMessage, errorCode };
 }

 const error = errorData as Record<string, unknown>;

 // Extract error title
 if (error.error && typeof error.error === 'string') {
 errorTitle = error.error;
 }

 // Track parsed details for nested error code checking
 let parsedDetails: Record<string, unknown> | null = null;

 // Parse error details
 if (error.details) {
 if (typeof error.details === 'string') {
 // Try to parse details as JSON if it's a string
 try {
 parsedDetails = JSON.parse(error.details);
 if (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.message) {
 errorMessage = parsedDetails.message as string;
 if (parsedDetails.error && typeof parsedDetails.error === 'string' && !errorTitle) {
 errorTitle = parsedDetails.error;
 }
 } else {
 errorMessage = error.details;
 }
 } catch {
 // If parsing fails, use the string as-is
 errorMessage = error.details;
 }
 } else if (typeof error.details === 'object' && error.details !== null) {
 const details = error.details as Record<string, unknown>;
 if ('issues' in details && Array.isArray(details.issues)) {
 // Format Zod validation errors nicely
 errorMessage = (details.issues as Array<{ path: string; message: string }>)
 .map((issue) => `${issue.path}: ${issue.message}`)
 .join(', ');
 } else if ('message' in details && typeof details.message === 'string') {
 // If details is an object with a message property
 errorMessage = details.message;
 parsedDetails = details;
 } else {
 errorMessage = JSON.stringify(error.details, null, 2);
 }
 } else {
 errorMessage = JSON.stringify(error.details, null, 2);
 }
 } else if (error.debug) {
 errorMessage = typeof error.debug === 'string'
 ? error.debug
 : JSON.stringify(error.debug, null, 2);
 }

 // Extract error code (check both top-level and nested)
 errorCode = (error.code && typeof error.code === 'string')
 ? error.code
 : (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.code && typeof parsedDetails.code === 'string')
 ? parsedDetails.code
 : null;

 // Apply error code-specific message if available
 if (errorCode && ERROR_MESSAGES[errorCode]) {
 const codeMessage = ERROR_MESSAGES[errorCode];
 // Only override if we don't have a good message yet or if it's a generic status message
 if (!errorMessage || errorMessage === `Server returned error status ${response.status}`) {
 errorMessage = codeMessage;
 }
 }

 // Fallback to status-based message if we still have a generic message
 if (response.status === 503 && (!errorMessage || errorMessage === `Server returned error status ${response.status}`)) {
 errorMessage = STATUS_MESSAGES[503] || errorMessage;
 }

 return { errorTitle, errorMessage, errorCode };
}

/**
 * Log error information for debugging
 */
function logError(response: Response, errorData: unknown, parsedDetails: Record<string, unknown> | null): void {
 const errorLog: Record<string, unknown> = {
 status: response.status,
 };

 if (errorData && typeof errorData === 'object') {
 const error = errorData as Record<string, unknown>;
 if ('code' in error) errorLog.code = error.code;
 if ('error' in error) errorLog.error = error.error;
 if ('details' in error) {
 if (parsedDetails) {
 errorLog.details = error.details;
 errorLog.parsedDetails = parsedDetails;
 } else {
 errorLog.details = error.details;
 }
 }
 if ('debug' in error) errorLog.debug = error.debug;
 // Log the full errorData if it has unexpected structure
 if (Object.keys(error).length > 0 && Object.keys(errorLog).length <= 1) {
 errorLog.fullErrorData = errorData;
 }
 } else {
 errorLog.rawErrorData = errorData;
 }

 logger.error("Extraction error: ", errorLog);
}

interface ExtractionResult {
 document_id: string;
 status: string;
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

interface ExtractionJob {
 id: string;
 collection_id?: string | null;
 collection_name: string;
 schema_id?: string | null;
 schema_name: string;
 document_count: number;
 status: 'completed' | 'failed' | 'in_progress';
 created_at: string;
 completed_at?: string;
 completed_documents?: number;
 estimated_time_remaining_seconds?: number | null;
}

const documentTypeBadgeStyles: Record<string, string> = {
 judgment: "bg-blue-400/8 text-blue-800 border border-blue-400/15 shadow-sm shadow-blue-400/5",
 default: "bg-slate-200/40 text-slate-700 border border-slate-200/30",
};

const formatDocumentTypeLabel = (type: string) =>
 type
 .replace(/_/g,"")
 .split("")
 .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
 .join("");

// Convert names to human-readable format (sentence case)
const formatName = (name: string): string => {
 // Handle snake_case: replace underscores with spaces
 let formatted = name.replace(/_/g, ' ');

 // Handle camelCase: insert space before capital letters
 formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');

 // Split into words
 const words = formatted.split(/\s+/).map(w => w.toLowerCase());

 // Capitalize only the first word
 if (words.length > 0) {
 words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
 }

 return words.join(' ');
};

const getDocumentTypeBadge = (type?: string | null) => {
 if (!type) {
 return { label: "Legal Document", className: documentTypeBadgeStyles.default };
 }

 const normalized = type.toLowerCase().trim();

 // Check for judgment variations
 if (normalized === "judgment"|| normalized === "judgement"|| normalized.includes("judgment")) {
 return {
 label: "Judgment",
 className: documentTypeBadgeStyles.judgment,
 };
 }

 // Fallback to formatted label
 return {
 label: formatDocumentTypeLabel(type),
 className: documentTypeBadgeStyles.default,
 };
};

function ExtractPageContent() {
 const { user } = useAuth();
 const searchParams = useSearchParams();
 const router = useRouter();

 // Format time from seconds to human-readable format
 const formatTimeFromSeconds = (seconds: number): string => {
 if (seconds < 60) return `${Math.floor(seconds)}s`;
 if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
 if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
 return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
 };
 const [selectedCollection, setSelectedCollection] = useState<string>("");
 const [selectedSchema, setSelectedSchema] = useState<string>("");
 const [selectedLanguage, setSelectedLanguage] = useState<string>("pl");
 const [isLoading, setIsLoading] = useState(false);
 const [collections, setCollections] = useState<Collection[]>([]);
 const [schemas, setSchemas] = useState<ExtractionSchema[]>([]);
 const [isFetching, setIsFetching] = useState(true);
 const [currentJobId, setCurrentJobId] = useState<string | null>(null);
 const [showSchemaGenerator, setShowSchemaGenerator] = useState(false);
 const [showBulkExtraction, setShowBulkExtraction] = useState(false);
 const [showResultViewer, setShowResultViewer] = useState(false);
 const [selectedResult, setSelectedResult] = useState<ExtractionResult | null>(null);
 const [preselectedFromUrl, setPreselectedFromUrl] = useState<{
 collection?: string;
 schema?: string;
 }>({});
 const [collectionDocuments, setCollectionDocuments] = useState<CollectionDocument[]>([]);
 const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
 const [documentsError, setDocumentsError] = useState<string | null>(null);
 const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(true);
 const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
 const [recentJobs, setRecentJobs] = useState<ExtractionJob[]>([]);

 useEffect(() => {
 const fetchData = async () => {
 try {
 setIsFetching(true);
 // Fetch collections
 const collectionsResponse = await fetch('/api/collections');
 if (!collectionsResponse.ok) {
 let errorMessage = 'Failed to fetch collections';
 try {
 const errorData = await collectionsResponse.json();
 errorMessage = errorData.message || errorData.error || errorMessage;
 } catch {
 // Use default error message if parsing fails
 }
 throw new Error(errorMessage);
 }
 const collectionsData = await collectionsResponse.json();
 setCollections(collectionsData);

 // Fetch schemas
 const schemasResponse = await fetch('/api/schemas');
 if (!schemasResponse.ok) {
 let errorMessage = 'Failed to fetch schemas';
 try {
 const errorData = await schemasResponse.json();
 errorMessage = errorData.message || errorData.error || errorMessage;
 logger.error('Schemas API error:', errorData);
 } catch {
 // Use default error message if parsing fails
 }
 throw new Error(errorMessage);
 }
 const schemasResponseData = await schemasResponse.json();
 // Handle both paginated and non-paginated responses
 const schemasData = Array.isArray(schemasResponseData)
 ? schemasResponseData
 : (schemasResponseData.data || []);
 // Filter out schemas without IDs and ensure unique IDs
 const validSchemas = (schemasData as ExtractionSchema[])
 .filter((schema) => schema.id)
 .filter((schema, index, self) =>
 index === self.findIndex((s) => s.id === schema.id)
 );
 setSchemas(validSchemas);

 // Fetch recent extractions
 try {
 const jobsResponse = await fetch('/api/jobs');
 if (jobsResponse.ok) {
 const jobsData = await jobsResponse.json();
 const jobs = jobsData.jobs || [];

 // Map extractions to the expected format
 const mappedJobs: ExtractionJob[] = jobs
 .filter((job: any) => job.collection_name && job.schema_name)
 .slice(0, 3)
 .map((job: any) => {
 const normalizedStatus = job.status?.toUpperCase().trim() || '';
 let status: 'completed' | 'failed' | 'in_progress' = 'in_progress';

 if (normalizedStatus === 'SUCCESS' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'PARTIALLY_COMPLETED') {
 status = 'completed';
 } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'FAILURE' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'REVOKED') {
 status = 'failed';
 } else if (normalizedStatus === 'PROCESSING' || normalizedStatus === 'STARTED' || normalizedStatus === 'PENDING') {
 status = 'in_progress';
 }

 return {
 id: job.job_id || job.id || '',
 collection_id: job.collection_id || null,
 collection_name: job.collection_name || 'Unknown Collection',
 schema_id: job.schema_id || null,
 schema_name: job.schema_name || 'Unknown Schema',
 document_count: job.total_documents || 0,
 status,
 created_at: job.created_at || new Date().toISOString(),
 completed_at: job.completed_at || undefined,
 completed_documents: job.completed_documents || 0,
 estimated_time_remaining_seconds: job.estimated_time_remaining_seconds || null,
 };
 });

 setRecentJobs(mappedJobs);
 } else {
 logger.warn('Failed to fetch extractions');
 setRecentJobs([]);
 }
 } catch (error) {
 logger.error('Error fetching extractions:', error);
 setRecentJobs([]);
 }

 // Handle URL parameters for pre-selection
 const urlCollection = searchParams.get('collection');
 const urlSchema = searchParams.get('schema');
 const preselected: { collection?: string; schema?: string } = {};

 if (urlCollection) {
 const collectionExists = collectionsData.some(
 (c: Collection) => c.id === urlCollection
 );
 if (collectionExists) {
 setSelectedCollection(urlCollection);
 preselected.collection = urlCollection;
 } else {
 toast.error("The collection ID from the URL was not found.");
 }
 }

 if (urlSchema) {
 const schemaExists = schemasData.some(
 (s: ExtractionSchema) => s.id === urlSchema
 );
 if (schemaExists) {
 setSelectedSchema(urlSchema);
 preselected.schema = urlSchema;
 } else {
 toast.error("The schema ID from the URL was not found.");
 }
 }

 if (Object.keys(preselected).length > 0) {
 setPreselectedFromUrl(preselected);
 }
 } catch (error) {
 logger.error('Error fetching data:', error);
 const errorMessage = error instanceof Error ? error.message : "Failed to load collections and schemas";
 toast.error(errorMessage);
 } finally {
 setIsFetching(false);
 }
 };

 fetchData();
 }, [searchParams]);

 // Poll for extraction updates when there are in-progress extractions
 useEffect(() => {
 const hasInProgressJobs = recentJobs.some(job => job.status === 'in_progress');
 if (!hasInProgressJobs) return;

 const pollInterval = setInterval(async () => {
 try {
 const jobsResponse = await fetch('/api/jobs');
 if (jobsResponse.ok) {
 const jobsData = await jobsResponse.json();
 const jobs = jobsData.jobs || [];

 const mappedJobs: ExtractionJob[] = jobs
 .filter((job: any) => job.collection_name && job.schema_name)
 .slice(0, 6)
 .map((job: any) => {
 const normalizedStatus = job.status?.toUpperCase().trim() || '';
 let status: 'completed' | 'failed' | 'in_progress' = 'in_progress';

 if (normalizedStatus === 'SUCCESS' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'PARTIALLY_COMPLETED') {
 status = 'completed';
 } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'FAILURE' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'REVOKED') {
 status = 'failed';
 } else if (normalizedStatus === 'PROCESSING' || normalizedStatus === 'STARTED' || normalizedStatus === 'PENDING') {
 status = 'in_progress';
 }

 return {
 id: job.job_id || job.id || '',
 collection_name: job.collection_name || 'Unknown Collection',
 schema_name: job.schema_name || 'Unknown Schema',
 document_count: job.total_documents || 0,
 status,
 created_at: job.created_at || new Date().toISOString(),
 completed_at: job.completed_at || undefined,
 completed_documents: job.completed_documents || 0,
 estimated_time_remaining_seconds: job.estimated_time_remaining_seconds || null,
 };
 });

 setRecentJobs(mappedJobs);
 }
 } catch (error) {
 logger.error('Error polling extractions:', error);
 }
 }, 5000); // Poll every 5 seconds

 return () => clearInterval(pollInterval);
 }, [recentJobs]);

 // Fetch documents when collection is selected
 useEffect(() => {
 const fetchDocuments = async () => {
 if (!selectedCollection) {
 setCollectionDocuments([]);
 setDocumentsError(null);
 setSelectedDocuments(new Set());
 return;
 }

 setIsLoadingDocuments(true);
 setDocumentsError(null);
 setSelectedDocuments(new Set()); // Reset selection when collection changes

 try {
 const response = await fetch(`/api/collections/${selectedCollection}/documents`);

 if (!response.ok) {
 throw new Error('Failed to fetch documents');
 }

 const documents = await response.json();
 setCollectionDocuments(documents);

 // Select all documents by default
 if (documents && documents.length > 0) {
 setSelectedDocuments(new Set(documents.map((doc: CollectionDocument) => doc.document_id)));

 // Fetch document metadata (document_type and docket_number) via batch endpoint AFTER collection is selected
 // Normalize document IDs by removing /doc/ prefix if present (some judgments have this prefix)
 const documentIds = documents.map((doc: CollectionDocument) => cleanDocumentIdForUrl(doc.document_id));

 try {
 const metadataResponse = await fetch('/api/documents/batch', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 document_ids: documentIds,
 return_vectors: false,
 return_properties: ['document_id', 'document_type', 'document_number'],
 }),
 });

 if (metadataResponse.ok) {
 const metadataData = await metadataResponse.json();

 if (metadataData.documents && Array.isArray(metadataData.documents)) {
 const metadataMap = new Map(
 metadataData.documents.map((doc: any) => {
 // Normalize document_id for matching (remove /doc/ prefix if present)
 const normalizedDocId = cleanDocumentIdForUrl(doc.document_id);
 return [
 normalizedDocId,
 {
 document_type: doc.document_type || null,
 docket_number: doc.document_number || null, // document_number from API becomes docket_number
 document_number: doc.document_number || null, // Keep document_number as fallback
 },
 ];
 })
 );

 // Merge metadata with documents (normalize document_id for matching)
 const documentsWithMetadata = documents.map((doc: CollectionDocument) => {
 const normalizedDocId = cleanDocumentIdForUrl(doc.document_id);
 return {
 ...doc,
 ...(metadataMap.get(normalizedDocId) || {}),
 };
 });

 setCollectionDocuments(documentsWithMetadata);
 } else {
 logger.warn('Invalid metadata response format:', metadataData);
 // Continue with documents without metadata
 }
 } else {
 logger.warn('Failed to fetch document metadata:', { status: metadataResponse.status, body: await metadataResponse.text().catch(() => '') });
 // Continue with documents without metadata
 }
 } catch (metadataError) {
 logger.warn('Failed to fetch document metadata:', metadataError);
 // Continue with documents without metadata
 }
 }
 } catch (error) {
 logger.error('Error fetching documents:', error);
 setDocumentsError(error instanceof Error ? error.message : 'Failed to load documents');
 setCollectionDocuments([]);
 } finally {
 setIsLoadingDocuments(false);
 }
 };

 fetchDocuments();
 }, [selectedCollection]);

 const selectedSchemaObject = schemas.find(s => s.id === selectedSchema);

 const handleClearSelection = () => {
 setSelectedCollection("");
 setSelectedSchema("");
 setPreselectedFromUrl({});
 setSelectedDocuments(new Set());
 toast.info("Collection and schema selections have been cleared.");
 };

 const hasUrlPreselection = Object.keys(preselectedFromUrl).length > 0;

 const handleToggleDocument = (documentId: string) => {
 setSelectedDocuments(prev => {
 const newSet = new Set(prev);
 if (newSet.has(documentId)) {
 newSet.delete(documentId);
 } else {
 newSet.add(documentId);
 }
 return newSet;
 });
 };

 const handleSelectAll = () => {
 if (selectedDocuments.size === collectionDocuments.length) {
 // Deselect all
 setSelectedDocuments(new Set());
 } else {
 // Select all
 setSelectedDocuments(new Set(collectionDocuments.map(doc => doc.document_id)));
 }
 };

 const handleRetry = async (job: ExtractionJob) => {
 try {
 // Find collection by ID or name
 let collectionId = job.collection_id;
 if (!collectionId) {
 const collection = collections.find(c => c.name === job.collection_name);
 if (collection) {
 collectionId = collection.id;
 } else {
 toast.error("Collection not found. Please select it manually.");
 return;
 }
 }

 // Find schema by ID or name
 let schemaId = job.schema_id;
 if (!schemaId) {
 const schema = schemas.find(s => s.name === job.schema_name);
 if (schema) {
 schemaId = schema.id;
 } else {
 toast.error("Schema not found. Please select it manually.");
 return;
 }
 }

 // Set form fields
 setSelectedCollection(collectionId);
 setSelectedSchema(schemaId);
 setSelectedDocuments(new Set()); // Clear document selection for retry

 // Scroll to form section
 setTimeout(() => {
 const formSection = document.getElementById('extraction-form-section');
 if (formSection) {
 formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
 }
 }, 100);

 // Wait a bit for state to update, then trigger extraction
 setTimeout(() => {
 handleExtract();
 }, 200);
 } catch (error) {
 logger.error('Error retrying extraction:', error);
 toast.error("Failed to retry extraction. Please configure manually.");
 }
 };

 const handleExtract = async () => {
 if (!selectedCollection || !selectedSchema) return;

 setIsLoading(true);
 try {
 const requestBody: {
 collection_id: string;
 schema_id: string;
 extraction_context: string;
 language: string;
 document_ids?: string[];
 } = {
 collection_id: selectedCollection,
 schema_id: selectedSchema,
 extraction_context: 'Extract structured information from legal documents using the provided schema.',
 language: selectedLanguage
 };

 // Only include document_ids if specific documents are selected
 if (selectedDocuments.size > 0) {
 requestBody.document_ids = Array.from(selectedDocuments);
 }

 const response = await fetch('/api/extractions', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(requestBody)
 });

 if (!response.ok) {
 try {
 const errorData = await response.json();
 const parsedError = parseErrorResponse(response, errorData);

 // Extract parsedDetails for logging (if available)
 let parsedDetails: Record<string, unknown> | null = null;
 if (errorData && typeof errorData === 'object') {
 const error = errorData as Record<string, unknown>;
 if (error.details && typeof error.details === 'object') {
 parsedDetails = error.details as Record<string, unknown>;
 } else if (error.details && typeof error.details === 'string') {
 try {
 parsedDetails = JSON.parse(error.details);
 } catch {
 // Ignore parse errors
 }
 }
 }

 logError(response, errorData, parsedDetails);

 toast.error(parsedError.errorMessage, {
 duration: 7000, // Show error longer so user can read it
 });
 } catch (parseError) {
 logger.error("Failed to parse error response: ", parseError);
 const errorMessage = STATUS_MESSAGES[response.status]
 || `Server error (${response.status}). ${response.statusText || 'Please try again or contact support.'}`;

 toast.error(errorMessage, {
 duration: 7000,
 });
 }

 return;
 }

 const data = await response.json();
 const { job_id } = data;

 if (!job_id) {
 logger.error("No job_id in response: ", data);
 toast.error("The server did not return a valid job ID. Please try again or contact support.", {
 duration: 7000,
 });
 return;
 }

 setCurrentJobId(job_id);

 // Refresh extractions list to show the new extraction
 try {
 const jobsResponse = await fetch('/api/jobs');
 if (jobsResponse.ok) {
 const jobsData = await jobsResponse.json();
 const jobs = jobsData.jobs || [];

 // Map extractions to the expected format
 const mappedJobs: ExtractionJob[] = jobs
 .filter((job: any) => job.collection_name && job.schema_name)
 .slice(0, 3)
 .map((job: any) => {
 const normalizedStatus = job.status?.toUpperCase().trim() || '';
 let status: 'completed' | 'failed' | 'in_progress' = 'in_progress';

 if (normalizedStatus === 'SUCCESS' || normalizedStatus === 'COMPLETED' || normalizedStatus === 'PARTIALLY_COMPLETED') {
 status = 'completed';
 } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'FAILURE' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'REVOKED') {
 status = 'failed';
 } else if (normalizedStatus === 'PROCESSING' || normalizedStatus === 'STARTED' || normalizedStatus === 'PENDING') {
 status = 'in_progress';
 }

 return {
 id: job.job_id || job.id || '',
 collection_name: job.collection_name || 'Unknown Collection',
 schema_name: job.schema_name || 'Unknown Schema',
 document_count: job.total_documents || 0,
 status,
 created_at: job.created_at || new Date().toISOString(),
 completed_at: job.completed_at || undefined,
 completed_documents: job.completed_documents || 0,
 estimated_time_remaining_seconds: job.estimated_time_remaining_seconds || null,
 };
 });

 setRecentJobs(mappedJobs);
 }
 } catch (error) {
 logger.error('Error refreshing extractions list:', error);
 }

 toast.success("The extraction process has been initiated. Monitor progress in the recent extractions section.");
 } catch (error) {
 logger.error("Extraction request failed: ", error);

 const errorMessage = error instanceof Error ? error.message : "Unknown error";

 // Network or unexpected errors
 toast.error(`Failed to connect to the server: ${errorMessage}. Please check your internet connection and try again.`, {
 duration: 7000,
 });
 } finally {
 setIsLoading(false);
 }
 };

 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const handleSchemaGenerated = async (newSchema: any) => {
 // Save the generated schema to the database
 try {
 const schemaToSave = {
 name: newSchema.name || `Generated Schema ${Date.now()}`,
 description: newSchema.description || "AI-generated extraction schema",
 type: "generated",
 category: "ai-generated",
 text: newSchema.schema || newSchema,
 dates: {}
 };

 const response = await fetch('/api/schemas', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify(schemaToSave)
 });

 if (!response.ok) {
 throw new Error(`Failed to save schema: ${response.status}`);
 }

 const savedSchema = await response.json();

 // Add the saved schema to the schemas list and select it
 setSchemas(prev => [savedSchema, ...prev]);
 setSelectedSchema(savedSchema.id);

 toast.success("Schema generated and saved successfully");
 } catch (error) {
 logger.error('Failed to save generated schema:', error);
 toast.error("Schema generated but failed to save. Please try creating it manually.");
 }
 };

 const handleViewResult = (result: ExtractionResult) => {
 setSelectedResult(result);
 setShowResultViewer(true);
 };

 const handleExtractionComplete = (results: ExtractionResult[]) => {
 toast.success(`Successfully processed ${results.length} documents`);
 };


 if (!user) {
 return null;
 }

 // Show loading indicator while fetching initial data
 if (isFetching) {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <LoadingIndicator
 message="Loading extraction page..."
 subtitle="Fetching collections and schemas"
 subtitleIcon={Wand2}
 variant="centered"
 size="lg"
 />
 </PageContainer>
 );
 }

 return (
 <PageContainer fillViewport className="flex flex-col">
 {/* Recent Extractions Section - Above main form */}
 <div className="mb-8 -mt-4">
 <h3 className="text-sm md:text-base font-semibold text-foreground mb-6">
 Recent Extractions
 </h3>
 {recentJobs.length > 0 ? (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {recentJobs.map((job) => {
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
 key={job.id}
 variant="light"
 className="group hover:shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-200 h-full flex flex-col cursor-pointer"
 onClick={() => router.push(`/extractions/${job.id}`)}
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
 <FileCode className="h-4 w-4 shrink-0"/>
 <span className="line-clamp-1">{formatName(job.schema_name)}</span>
 </div>
 <div className="flex items-center gap-2">
 <Calendar className="h-4 w-4 shrink-0"/>
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
 <Clock className="h-3.5 w-3.5"/>
 <span>~{formatTimeFromSeconds(job.estimated_time_remaining_seconds)} remaining</span>
 </div>
 )}
 </div>
 )}

 {/* Spacer to push buttons to bottom */}
 <div className="flex-1"/>

 {/* Action buttons */}
 <div className="mt-auto">
 {job.status === 'in_progress' && (
 <AccentButton
 size="sm"
 icon={Eye}
 onClick={() => {
 router.push(`/extractions/${job.id}`);
 }}
 className="w-full"
 >
 Open Details
 </AccentButton>
 )}

 {job.status === 'completed' && (
 <AccentButton
 size="sm"
 icon={Eye}
 onClick={() => {
 router.push(`/extractions/${job.id}`);
 }}
 className="w-full"
 >
 View Results
 </AccentButton>
 )}

 {job.status === 'failed' && (
 <GlassButton
 variant="white"
 onClick={() => {
 handleRetry(job);
 }}
 className="w-full"
 >
 <RefreshCw className="h-4 w-4"/>
 Retry Extraction
 </GlassButton>
 )}
 </div>
 </div>
 </BaseCard>
 );
 })}
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

 {/* Subtle visual separator */}
 <div className="my-8 border-t border-slate-200/30"/>

 {/* Extraction Configuration Section */}
 <div id="extraction-form-section"className="mb-8">
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 {/* Configuration Panel */}
 <div>
 <BaseCard
 variant="light"
 title="New Extraction"
 >
 <div className="space-y-6 -mt-3 -m-3.5 p-8">
 {hasUrlPreselection && (
 <div className="flex items-center gap-2 text-xs text-slate-600">
 <LinkIcon className="h-3.5 w-3.5"/>
 <span>Pre-selected from URL</span>
 </div>
 )}
 <div className="space-y-2">
 <label className="text-sm font-medium">Collection</label>
 <SearchableDropdownButton
 icon={<FolderOpen size={16} />}
 label={isFetching ? "Loading collections...": "Select a collection"}
 value={selectedCollection}
 options={collections.map((collection) => {
 const docCount = collection.document_count ?? collection.documents?.length ?? 0;
 // Show only the document count number
 const badge = String(docCount);
 return {
 value: collection.id,
 label: collection.name,
 description: collection.description || undefined,
 badge: badge,
 };
 })}
 onChange={(value) => setSelectedCollection(value)}
 disabled={isFetching}
 searchPlaceholder="Search collections by name or description..."
 maxHeight="max-h-[300px]"
 />
 </div>

 {/* Document Preview Section */}
 {selectedCollection && (
 <div className={cn(
"rounded-lg border",
"bg-slate-50/50",
"border-slate-200/50",
"overflow-hidden"
 )}>
 {collectionDocuments.length > 0 && (
 <button
 type="button"
 onClick={() => setIsDocumentsExpanded(!isDocumentsExpanded)}
 className={cn(
"w-full flex items-center justify-between gap-2 p-3",
"hover:bg-slate-100/50",
"transition-colors",
"border-b border-slate-200/50"
 )}
 >
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-muted-foreground"/>
 <span className="text-sm font-medium">Select Documents</span>
 </div>
 <div className="flex items-center gap-2">
 {!isLoadingDocuments && !documentsError && selectedDocuments.size > 0 && (
 <AIBadge
 text={String(selectedDocuments.size)}
 icon={FileText}
 size="sm"
 className="font-mono"
 />
 )}
 {isLoadingDocuments ? (
 <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin"/>
 ) : isDocumentsExpanded ? (
 <ChevronUp className="h-4 w-4 text-muted-foreground"/>
 ) : (
 <ChevronDown className="h-4 w-4 text-muted-foreground"/>
 )}
 </div>
 </button>
 )}

 {(isDocumentsExpanded || collectionDocuments.length === 0) && (
 <div className="p-3">
 {isLoadingDocuments ? (
 <LoadingIndicator
 message="Loading documents..."
 variant="inline"
 size="sm"
 className="py-8"
 />
 ) : documentsError ? (
 <div className="py-4 text-sm text-destructive text-center">
 {documentsError}
 </div>
 ) : collectionDocuments.length === 0 ? (
 <EmptyState
 title="No documents in this collection"
 description="Add documents to this collection to start extraction"
 icon={FileText}
 variant="default"
 primaryAction={{
 label: "Go to Collection",
 onClick: () => router.push(`/collections/${selectedCollection}`),
 icon: FolderOpen,
 }}
 />
 ) : (
 <>
 <div className="flex items-center justify-between mb-3">
 <div className="text-xs text-muted-foreground">
 {selectedDocuments.size > 0
 ? `${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'document' : 'documents'} selected`
 : 'No documents selected'
 }
 </div>
 <TextButton
 onClick={handleSelectAll}
 className="text-xs"
 >
 {selectedDocuments.size === collectionDocuments.length ? 'Deselect All' : 'Select All'}
 </TextButton>
 </div>
 <div className="space-y-2 max-h-64 overflow-y-auto">
 {collectionDocuments.map((doc) => {
 // Display docket_number if available, otherwise document_number, fallback to document_id
 const displayNumber = doc.docket_number || doc.document_number || doc.document_id;

 const { label: typeLabel, className: typeClassName } = getDocumentTypeBadge(doc.document_type);

 return (
 <div
 key={doc.id}
 className={cn(
"flex items-center gap-3 p-3 rounded-md transition-colors cursor-pointer",
"bg-slate-50/50",
"hover:bg-slate-100/50",
"border border-slate-200/50"
 )}
 onClick={() => handleToggleDocument(doc.document_id)}
 >
 <Checkbox
 checked={selectedDocuments.has(doc.document_id)}
 onCheckedChange={() => handleToggleDocument(doc.document_id)}
 onClick={(e) => e.stopPropagation()}
 />
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2">
 <span className={cn(
"text-sm font-medium truncate",
 (!doc.docket_number && !doc.document_number) &&"text-muted-foreground"
 )}>
 {displayNumber}
 </span>
 {doc.document_type && (
 <Badge
 className={cn(
"text-xs font-medium shrink-0 px-2.5 py-1 rounded-md backdrop-blur-sm",
 typeClassName
 )}
 >
 {typeLabel}
 </Badge>
 )}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </>
 )}
 </div>
 )}
 </div>
 )}

 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <label className="text-sm font-medium">Extraction Schema</label>
 <SecondaryButton
 size="sm"
 onClick={() => {
 setShowSchemaGenerator(true);
 }}
 icon={Wand2}
 >
 Generate New
 </SecondaryButton>
 </div>
 <SearchableDropdownButton
 icon={<FileCode size={16} />}
 label={isFetching ? "Loading schemas...": "Select a schema"}
 value={selectedSchema}
 options={schemas
 .filter((schema) => schema.status === 'published' || schema.status === null) // Only show published schemas in dropdowns (treat null as published for backwards compatibility)
 .sort((a, b) => {
 // Sort verified schemas first
 if (a.is_verified && !b.is_verified) return -1;
 if (!a.is_verified && b.is_verified) return 1;
 return 0; // Keep original order for schemas with same verification status
 })
 .map((schema) => ({
 value: schema.id,
 label: formatName(schema.name),
 description: schema.description,
 status: schema.status ?? undefined,
 isVerified: schema.is_verified,
 }))}
 onChange={(value) => setSelectedSchema(value)}
 disabled={isFetching || !!(selectedCollection && collectionDocuments.length === 0)}
 searchPlaceholder="Search schemas by name or description..."
 maxHeight="max-h-[300px]"
 />
 </div>

 <div className="space-y-2">
 <label className="text-sm font-medium">Language</label>
 <DropdownButton
 icon={<Globe size={16} />}
 label="Select language"
 value={selectedLanguage}
 options={[
 { value: "pl", label: "Polish (Polski)"},
 { value: "en", label: "English"},
 // { value: "de", label: "German (Deutsch)"},
 // { value: "fr", label: "French (Français)"},
 // { value: "es", label: "Spanish (Español)"},
 ]}
 onChange={(value) => setSelectedLanguage(value)}
 disabled={!!(selectedCollection && collectionDocuments.length === 0)}
 className="w-full justify-start"
 />
 </div>

 {selectedCollection && selectedSchema && collectionDocuments.length > 0 && selectedDocuments.size === 0 && (
 <BaseCard
 clickable={false}
 className={cn(
"p-3",
"bg-amber-50/50",
"border-amber-200/50"
 )}
 >
 <div className="flex items-start gap-2.5 w-full">
 <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"/>
 <span className="text-sm font-medium text-muted-foreground leading-relaxed">
 Please select at least one document to start extraction
 </span>
 </div>
 </BaseCard>
 )}

 <div className="flex gap-2">
 <GlassButton
 onClick={handleExtract}
 disabled={
 !selectedCollection ||
 !selectedSchema ||
 isLoading ||
 isFetching ||
 isLoadingDocuments ||
 !!(selectedCollection && collectionDocuments.length === 0) ||
 selectedDocuments.size === 0
 }
 className="flex-1"
 isLoading={isLoading}
 >
 {isLoading ? (
 <span>Starting Extraction...</span>
 ) : (
 <>
 <Sparkles className="h-4 w-4"/>
 {isLoadingDocuments
 ? "Loading Documents..."
 : selectedDocuments.size > 0
 ? `Start Extraction (${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'document' : 'documents'})`
 : "Start Extraction"
 }
 </>
 )}
 </GlassButton>
 <SecondaryButton
 onClick={() => setShowBulkExtraction(true)}
 disabled={
 !selectedCollection ||
 schemas.length < 2 ||
 isFetching ||
 isLoadingDocuments ||
 !!(selectedCollection && collectionDocuments.length === 0) ||
 selectedDocuments.size === 0
 }
 >
 <Layers className="h-4 w-4"/>
 Bulk
 </SecondaryButton>
 </div>
 </div>
 </BaseCard>
 </div>

 {/* Schema Preview Panel */}
 <div>
 <SchemaPreview
 schema={selectedSchemaObject || null}
 />
 </div>
 </div>
 </div>



 {/* Bulk Extraction Dialog */}
 <BulkExtractionDialog
 isOpen={showBulkExtraction}
 onClose={() => setShowBulkExtraction(false)}
 schemas={schemas}
 collectionId={selectedCollection}
 collectionName={collections.find(c => c.id === selectedCollection)?.name || ""}
 documentIds={Array.from(selectedDocuments)}
 documentCount={selectedDocuments.size}
 language={selectedLanguage}
 />

 {/* Schema Generator Dialog */}
 <SchemaGenerator
 isOpen={showSchemaGenerator}
 onClose={() => setShowSchemaGenerator(false)}
 onSchemaGenerated={handleSchemaGenerated}
 collectionId={selectedCollection}
 />

 {/* Result Viewer Dialog */}
 <Dialog open={showResultViewer} onOpenChange={setShowResultViewer}>
 <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Eye className="h-5 w-5"/>
 Extraction Result
 </DialogTitle>
 </DialogHeader>
 {selectedResult && (
 <div className="space-y-4">
 <div className="grid grid-cols-2 gap-4 text-sm">
 <div>
 <span className="font-medium">Document:</span>
 <span className="ml-2">
 {selectedResult.documents
 ? `Case ${selectedResult.documents.volume_number} (${selectedResult.documents.document_date})`
 : selectedResult.document_id
 }
 </span>
 </div>
 <div>
 <span className="font-medium">Completed:</span>
 <span className="ml-2">
 {selectedResult.completed_at
 ? new Date(selectedResult.completed_at).toLocaleString()
 : 'N/A'
 }
 </span>
 </div>
 </div>
 <div>
 <h4 className="font-medium mb-2">Extracted Data:</h4>
 <pre className={cn(
"p-4 rounded-lg text-sm overflow-auto max-h-96",
"bg-slate-50/50",
"border border-slate-200/50"
 )}>
 {JSON.stringify(selectedResult.extracted_data, null, 2)}
 </pre>
 </div>
 </div>
 )}
 </DialogContent>
 </Dialog>
 </PageContainer>
 );
}

function ExtractPageLoading() {
 return (
 <PageContainer fillViewport className="flex items-center justify-center">
 <LoadingIndicator
 message="Loading extraction page..."
 subtitle="Preparing document extraction tools"
 subtitleIcon={Wand2}
 variant="centered"
 size="lg"
 />
 </PageContainer>
 );
}

export default function ExtractPage() {
 return (
 <Suspense fallback={<ExtractPageLoading />}>
 <ExtractPageContent />
 </Suspense>
 );
}
