'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ExternalLink, ChevronDown, ChevronUp, Info, Sparkles, Plus, ArrowLeft, FileText, Loader2, Scale, MessageSquare, BookOpen } from 'lucide-react';

import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import { LoadingIndicator, BaseCard, Button, Badge, AIDisclaimerBadge, Breadcrumb, PageContainer, SecondaryButton, ErrorCard } from '@/lib/styles/components';
import { KeyInformation } from '@/lib/styles/components/key-information';
import DOMPurify from 'dompurify';
import { summarizeDocuments, type SummarizeDocumentsResponse, extractKeyPoints, type ExtractKeyPointsResponse } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import { VersionHistory } from '@/components/VersionHistory';
import { useAuth } from '@/contexts/AuthContext';

interface DocumentMetadata {
 document_id: string;
 title?: string | null;
 document_type: string;
 date_issued?: string | null;
 document_number?: string | null;
 language: string;
 country?: string;
 summary?: string | null;
 keywords?: string[] | null;
 legal_references?: unknown[] | null;
 legal_concepts?: unknown[] | null;
 court_name?: string | null;
 department_name?: string | null;
 presiding_judge?: string | null;
 judges?: string[] | null;
 parties?: string | null;
 outcome?: string | null;
 legal_bases?: string[] | null;
 extracted_legal_bases?: string | null;
 publication_date?: string | null;
 thesis?: string | null;
 processing_status?: string | null;
 interpretation_status?: string | null;
 source_url?: string | null;
 ingestion_date?: string | null;
 last_updated?: string | null;
 references?: string[] | null;
 issuing_body?: unknown | null;
 x?: number | null;
 y?: number | null;
 [key: string]: unknown; // Allow additional metadata fields
}

interface SimilarDocument {
 document_id: string;
 db_id: string;
 similarity_score: number;
 title?: string | null;
 document_type?: string | null;
 date_issued?: string | null;
 publication_date?: string | null;
 document_number?: string | null;
 country?: string | null;
 language?: string | null;
 court_name?: string | null;
 department_name?: string | null;
 presiding_judge?: string | null;
 judges?: string[] | null;
 parties?: string | null;
 outcome?: string | null;
 issuing_body?: { name?: string } | null;
}

type Props = {
 htmlString?: string | null;
 metadata?: { title?: string | null };
};

function AuthRequiredAIActionsNotice({
 message,
}: {
 message: string;
}): React.JSX.Element {
 return (
 <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
 <p>
 {message}{' '}
 <Link href="/auth/login" className="font-medium underline underline-offset-4">
 Sign in
 </Link>{' '}
 to use AI analysis on this document.
 </p>
 </div>
 );
}

function SanitizedHtmlView({
 htmlString,
 metadata,
}: Props): React.JSX.Element {
 const { purified, extractedStyles } = useMemo(() => {
 if (!htmlString) return { purified: '', extractedStyles: '' };

 // Check if it's a full HTML document
 const isFullDocument = /<!doctype\s+html|<\s*html[\s>]/i.test(htmlString);

 let bodyContent = htmlString;
 let styles = '';

 if (isFullDocument) {
 // Extract all styles from <head> (handle multiple style tags)
 const styleMatches = htmlString.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi);
 const styleArray: string[] = [];
 for (const match of styleMatches) {
 if (match[1]) {
 styleArray.push(match[1]);
 }
 }
 styles = styleArray.join('\n');

 // Extract body content
 const bodyMatch = htmlString.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
 if (bodyMatch) {
 bodyContent = bodyMatch[1];
 // If body contains doc-container, extract just that content
 // Use DOMParser to safely extract doc-container content
 const parser = new DOMParser();
 const doc = parser.parseFromString(bodyContent, 'text/html');
 const container = doc.querySelector('.doc-container');
 if (container) {
 bodyContent = container.innerHTML;
 }
 } else {
 // If no body tag, try to extract content from doc-container directly
 const containerMatch = htmlString.match(/<div[^>]*class\s*=\s*["']doc-container["'][^>]*>([\s\S]*?)<\/div>/i);
 if (containerMatch) {
 bodyContent = containerMatch[1];
 }
 }
 }

 // Sanitize HTML with DOMPurify
 let purified = DOMPurify.sanitize(bodyContent, {
 USE_PROFILES: { html: true },
 ALLOW_ARIA_ATTR: true,
 ALLOW_DATA_ATTR: false,
 FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'],
 FORBID_ATTR: ['on*'],
 ADD_ATTR: ['target', 'rel'],
 RETURN_TRUSTED_TYPE: false,
 })
 // Ensure safe external links
 .replaceAll(/<a\s+([^>]*?)>/gi, (_m: string, attrs: string) => {
 const hasTarget = /\btarget\s*=/i.test(attrs);
 const hasRel = /\brel\s*=/i.test(attrs);
 let out = `<a ${attrs}`;
 if (!hasTarget) out = out.replace(/<a\s+/i, '<a target="_blank"');
 if (!hasRel) out = out.replace(/<a\s+/i, '<a rel="noopener noreferrer nofollow"');
 return out + '>';
 });

 // Remove <unk> tokens (unknown tokens from text processing/AI models)
 // Replace with empty string to clean up the content
 purified = purified.replace(/<unk>/gi, '');

 return { purified, extractedStyles: styles };
 }, [htmlString]);

 if (!htmlString) {
 return (
 <div className="p-12 text-center text-muted-foreground">
 <p>Document content not available</p>
 </div>
 );
 }

 return (
 <div className="rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-md">
 <style>{`
 /* Extracted document styles */
 ${extractedStyles}

 /* Theme-aware overrides */
 .document-content {
 background-color: white !important;
 color: rgb(15 23 42) !important;
 }
 /* Override white backgrounds in the HTML content */
 .document-content [style*="background"][style*="white"i],
 .document-content [style*="background"][style*="#fff"i],
 .document-content [style*="background"][style*="#ffffff"i],
 .document-content [style*="background"][style*="rgb(255,255,255)"i] {
 background-color: transparent !important;
 }
 .document-content table,
 .document-content th,
 .document-content td {
 background-color: transparent !important;
 }
 /* Ensure document styles are scoped to document-content */
 .document-content .doc-container {
 max-width: 100% !important;
 padding: 0 !important;
 margin: 0 !important;
 }
 /* Override prose styles for last element to reduce bottom spacing */
 .document-content > *:last-child {
 margin-bottom: 0 !important;
 }
 .document-content p:last-child {
 margin-bottom: 0 !important;
 }
 /* Ensure document content has proper bottom padding */
 .document-content {
 padding-bottom: 1rem !important;
 }

 /* Ensure bullet lists are visible */
 .document-content ul,
 .document-content ol {
 list-style-type: disc !important;
 padding-left: 1.5rem !important;
 margin: 1rem 0 !important;
 }
 .document-content ol {
 list-style-type: decimal !important;
 }
 .document-content ul ul {
 list-style-type: circle !important;
 }
 .document-content ul ul ul {
 list-style-type: square !important;
 }
 .document-content li {
 display: list-item !important;
 list-style-position: outside !important;
 margin: 0.25rem 0 !important;
 }

 /* Print-specific styles - CRITICAL for preventing text cutoff */
 @media print {
 /* Remove ALL height and overflow restrictions on document-content and its parents */
 .document-content,
 div.document-content,
 [role="document"] {
 height: auto !important;
 min-height: 0 !important;
 max-height: none !important;
 overflow: visible !important;
 display: block !important;
 visibility: visible !important;
 }

 /* Remove ALL restrictions from everything inside */
 .document-content *,
 .document-content * * {
 overflow: visible !important;
 max-height: none !important;
 min-height: 0 !important;
 height: auto !important;
 }
 }
 `}</style>
 <div
 className="document-content w-full px-6 pt-6 pb-4 prose prose-slate max-w-none text-slate-900"
 role="document"
 aria-label={metadata?.title || 'Document'}
 dangerouslySetInnerHTML={{ __html: purified }}
 />
 </div>
 );
}

export default function DocumentPage(): React.JSX.Element {
 const params = useParams();
 const router = useRouter();
 const searchParams = useSearchParams();
 const pathname = usePathname();
 const { user, loading: authLoading } = useAuth();
 const documentId = params.id as string;

 const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
 const [similarDocs, setSimilarDocs] = useState<SimilarDocument[]>([]);
 const [enrichedSimilarDocs, setEnrichedSimilarDocs] = useState<SimilarDocument[]>([]);
 const [loadingSimilarMetadata, setLoadingSimilarMetadata] = useState(false);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [htmlUrl, setHtmlUrl] = useState<string>('');
 const [htmlString, setHtmlString] = useState<string | null>(null);
 const [isDocumentExpanded, setIsDocumentExpanded] = useState(true);
 const [isThesisExpanded, setIsThesisExpanded] = useState(false);
 const [areReferencesExpanded, setAreReferencesExpanded] = useState(false);

 // Summarization state
 const [summaryResult, setSummaryResult] = useState<SummarizeDocumentsResponse | null>(null);
 const [isSummarizing, setIsSummarizing] = useState(false);
 const [summaryError, setSummaryError] = useState<string | null>(null);
 const [summaryType, setSummaryType] = useState<"executive"|"key_findings"|"synthesis">("executive");
 const [summaryLength, setSummaryLength] = useState<"short"|"medium"|"long">("medium");
 const [isSummaryPanelOpen, setIsSummaryPanelOpen] = useState(false);

 // Key points extraction state
 const [keyPointsResult, setKeyPointsResult] = useState<ExtractKeyPointsResponse | null>(null);
 const [isExtractingKeyPoints, setIsExtractingKeyPoints] = useState(false);
 const [keyPointsError, setKeyPointsError] = useState<string | null>(null);
 const [isKeyPointsPanelOpen, setIsKeyPointsPanelOpen] = useState(false);
 const canUseDocumentAI = Boolean(user);

 const fetchDocumentData = useCallback(async (): Promise<void> => {
 try {
 setLoading(true);
 setError(null);

 const metadataRes = await fetch(`/api/documents/${documentId}/metadata`, { cache: 'no-store' });
 if (!metadataRes.ok) throw new Error('Failed to fetch document metadata');
 const metadataData = await metadataRes.json();
 setMetadata(metadataData);

 const similarRes = await fetch(`/api/documents/${documentId}/similar?top_k=3`, { cache: 'no-store' });
 if (similarRes.ok) {
 const similarData = await similarRes.json();
 const similarDocuments = similarData.similar_documents || [];

 // Filter out the current document (normalize IDs for comparison)
 const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();
 const filtered = similarDocuments.filter((doc: SimilarDocument) => {
 const normalizedDocId = cleanDocumentIdForUrl(doc.document_id).toLowerCase().trim();
 return normalizedDocId !== normalizedCurrentId;
 });

 setSimilarDocs(filtered);
 } else {
 // Reset similar docs to empty array when fetch fails
 setSimilarDocs([]);
 }

 setHtmlUrl(`/api/documents/${documentId}/html`);
 const fetchHtmlRes = await fetch((`/api/documents/${documentId}/html`), { cache: 'no-store' });
 const fetchHtmlData = await fetchHtmlRes.text();

 setHtmlString(fetchHtmlData);

 } catch (err) {
 console.error('Error fetching document:', err);
 setError(err instanceof Error ? err.message : 'Failed to load document');
 } finally {
 setLoading(false);
 }
 }, [documentId]);

 useEffect(() => {
 if (documentId) fetchDocumentData();
 }, [documentId, fetchDocumentData]);

 // Fetch metadata for similar documents
 useEffect(() => {
 async function fetchSimilarDocsMetadata(): Promise<void> {
 if (similarDocs.length === 0) {
 setEnrichedSimilarDocs([]);
 return;
 }

 try {
 setLoadingSimilarMetadata(true);
 const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();

 const enriched = await Promise.all(
 similarDocs.map(async (doc) => {
 try {
 const cleanId = cleanDocumentIdForUrl(doc.document_id);
 const normalizedDocId = cleanId.toLowerCase().trim();

 // Double-check: skip if this is the current document
 if (normalizedDocId === normalizedCurrentId) {
 return null;
 }

 const metadataRes = await fetch(`/api/documents/${cleanId}/metadata`, { cache: 'no-store' });
 if (metadataRes.ok) {
 const metadataData = await metadataRes.json();
 return {
 ...doc,
 ...metadataData,
 } as SimilarDocument;
 }
 } catch (err) {
 console.error(`Error fetching metadata for ${doc.document_id}:`, err);
 }
 return doc;
 })
 );

 // Filter out any null values (excluded documents)
 const filtered = enriched.filter((doc): doc is SimilarDocument => doc !== null);
 setEnrichedSimilarDocs(filtered);
 } catch (err) {
 console.error('Error fetching similar documents metadata:', err);
 // Also filter the fallback
 const normalizedCurrentId = cleanDocumentIdForUrl(documentId).toLowerCase().trim();
 const filtered = similarDocs.filter((doc: SimilarDocument) => {
 const normalizedDocId = cleanDocumentIdForUrl(doc.document_id).toLowerCase().trim();
 return normalizedDocId !== normalizedCurrentId;
 });
 setEnrichedSimilarDocs(filtered);
 } finally {
 setLoadingSimilarMetadata(false);
 }
 }

 fetchSimilarDocsMetadata();
 }, [similarDocs, documentId]);

 // Print handler - same logic as navbar button
 const handlePrint = useCallback(async (): Promise<void> => {
 if (!htmlUrl) return;

 try {
 const res = await fetch(htmlUrl, { cache: 'no-store' });
 const htmlString = await res.text();

 const printWindow = window.open('', '_blank');
 if (printWindow && htmlString) {
 printWindow.document.write(htmlString);
 printWindow.document.close();
 printWindow.onload = () => {
 printWindow.focus();
 printWindow.print();
 };
 setTimeout(() => {
 printWindow.focus();
 printWindow.print();
 }, 500);
 }
 } catch (error) {
 console.error('Failed to print document:', error);
 }
 }, [htmlUrl]);

 const handleGenerateSummary = useCallback(async (): Promise<void> => {
 if (!documentId) return;

 try {
 setIsSummarizing(true);
 setSummaryError(null);
 setSummaryResult(null);

 const result = await summarizeDocuments({
 document_ids: [documentId],
 summary_type: summaryType,
 length: summaryLength,
 });

 setSummaryResult(result);
 } catch (err) {
 console.error('Error generating summary:', err);
 setSummaryError(err instanceof Error ? err.message : 'Failed to generate summary');
 } finally {
 setIsSummarizing(false);
 }
 }, [documentId, summaryType, summaryLength]);

 const handleExtractKeyPoints = useCallback(async (): Promise<void> => {
 if (!documentId) return;

 try {
 setIsExtractingKeyPoints(true);
 setKeyPointsError(null);
 setKeyPointsResult(null);

 const result = await extractKeyPoints({
 document_id: documentId,
 });

 setKeyPointsResult(result);
 } catch (err) {
 console.error('Error extracting key points:', err);
 setKeyPointsError(err instanceof Error ? err.message : 'Failed to extract key points');
 } finally {
 setIsExtractingKeyPoints(false);
 }
 }, [documentId]);

 // Intercept Ctrl+P / Cmd+P keyboard shortcut
 useEffect(() => {
 const handleKeyDown = (e: KeyboardEvent): void => {
 // Check for Ctrl+P (Windows/Linux) or Cmd+P (Mac)
 if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
 e.preventDefault(); // Prevent default browser print dialog
 handlePrint();
 }
 };

 window.addEventListener('keydown', handleKeyDown);
 return () => {
 window.removeEventListener('keydown', handleKeyDown);
 };
 }, [handlePrint]);

 const formatDocumentType = (type: string): string =>
 type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

 // Helper function to format dates
 const formatDate = (dateStr: string | null | undefined): string | null => {
 if (!dateStr) return null;
 const cleanDateStr = typeof dateStr === 'string' ? dateStr.replace(/<[^>]*>/g, '') : dateStr;
 try {
 return new Date(cleanDateStr).toLocaleDateString('pl-PL', {
 year: 'numeric',
 month: 'long',
 day: 'numeric'
 });
 } catch {
 return cleanDateStr;
 }
 };

 // Helper function to convert arrays to comma-separated strings
 // Returns null if array is empty or all items are empty
 const arrayToString = (arr: unknown): string | null => {
 if (!Array.isArray(arr)) return null;
 const validItems = arr
 .filter((item: unknown) => {
 if (item === null || item === undefined) return false;
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '').trim() : String(item).replace(/<[^>]*>/g, '').trim() as string;
 return cleanItem !== '';
 })
 .map((item: unknown) => {
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '').trim() : String(item).replace(/<[^>]*>/g, '').trim() as string;
 return cleanItem;
 });

 if (validItems.length === 0) return null;
 return validItems.join(', ');
 };

 // Helper function to parse keywords into an array of strings
 const parseKeywords = (keywords: unknown): string[] => {
 if (!keywords) return [];

 // If it's already an array, clean and return
 if (Array.isArray(keywords)) {
 return keywords
 .filter((item: unknown) => item !== null && item !== undefined)
 .map((item: unknown) => {
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '').trim() : String(item).replace(/<[^>]*>/g, '').trim() as string;
 return cleanItem;
 })
 .filter((item: string) => item !== '');
 }

 // If it's a JSON string, parse it
 const keywordsStr = String(keywords);
 if (typeof keywords === 'string' && (keywordsStr.startsWith('[') || keywordsStr.startsWith('{'))) {
 try {
 const parsed = JSON.parse(keywordsStr);
 if (Array.isArray(parsed)) {
 return parsed
 .filter((item: unknown) => item !== null && item !== undefined)
 .map((item: unknown) => {
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '').trim() : String(item).replace(/<[^>]*>/g, '').trim() as string;
 return cleanItem;
 })
 .filter((item: string) => item !== '');
 }
 } catch {
 // If parsing fails, treat as comma-separated string
 }
 }

 // If it's a string, split by comma only (keywords may contain dashes)
 if (typeof keywords === 'string') {
 const cleanStr = keywords.replace(/<[^>]*>/g, '').trim();
 // Split by comma, then clean each part (preserve dashes within keywords)
 const parts = cleanStr.split(',').map(part => part.trim()).filter(part => part !== '');
 return parts;
 }

 return [];
 };

 // Helper function to handle any field that might be an array, object, or string
 // Converts arrays to comma-separated strings, handles JSON strings, filters empty values
 // Helper to check if a value is meaningful (not empty, not"-", not null/undefined)
 const hasMeaningfulValue = (value: unknown): boolean => {
 if (!value) return false;
 if (typeof value === 'string') {
 const trimmed = value.replace(/<[^>]*>/g, '').trim();
 return trimmed !== '' && trimmed !== '-' && trimmed !== '[]' && trimmed !== '{}' && trimmed !== '[object Object]';
 }
 if (Array.isArray(value)) {
 return value.length > 0 && value.some(item => hasMeaningfulValue(item));
 }
 if (typeof value === 'object' && value !== null) {
 return Object.keys(value).length > 0;
 }
 return true;
 };

 const handleFieldValue = (value: unknown): string | null => {
 if (!value) return null;

 // Parse JSON strings first
 let parsed: unknown = value;
 const valueStr = String(value);
 if (typeof value === 'string' && (valueStr.startsWith('[') || valueStr.startsWith('{'))) {
 try {
 parsed = JSON.parse(valueStr);
 } catch {
 parsed = value;
 }
 }

 // If it's an array, convert to comma-separated string
 if (Array.isArray(parsed)) {
 return arrayToString(parsed);
 }

 // Handle object format
 if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
 const values = Object.values(parsed)
 .filter(v => v !== null && v !== undefined)
 .map(v => String(v).replace(/<[^>]*>/g, '').trim())
 .filter(v => v !== '');
 if (values.length === 0) return null;
 return values.join(', ');
 }

 // Handle string format - remove array brackets if present
 let cleanValue = String(parsed).replace(/<[^>]*>/g, '').trim();
 // Remove JSON array brackets if they're in the string (like"[]")
 if (cleanValue === '[]' || cleanValue === '{}') return null;
 if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
 try {
 const parsedArray = JSON.parse(cleanValue);
 if (Array.isArray(parsedArray)) {
 return arrayToString(parsedArray);
 }
 } catch {
 // If parsing fails, just remove brackets manually
 cleanValue = cleanValue.replace(/^\[|\]$/g, '').replace(/"/g, '').trim();
 }
 }

 if (cleanValue === '' || cleanValue === '[object Object]') return null;
 return cleanValue;
 };

 if (loading) {
 return (
 <PageContainer width="xl"fillViewport className="py-8">
 <div className="flex items-center justify-center h-[600px]">
 <LoadingIndicator
 message="Loading document..."
 variant="centered"
 size="lg"
 />
 </div>
 </PageContainer>
 );
 }

 if (error || !metadata) {
 return (
 <PageContainer width="xl"fillViewport className="py-8">
 <div className="w-full min-h-[calc(100vh-8rem)] flex items-center justify-center">
 <div className="w-full max-w-2xl px-6">
 <ErrorCard
 title="Error Loading Document"
 message={error || 'Document not found'}
 onRetry={fetchDocumentData}
 retryLabel="Retry"
 secondaryAction={{
 label: 'Go Back',
 onClick: () => router.back(),
 icon: ArrowLeft,
 }}
 />
 </div>
 </div>
 </PageContainer>
 );
 }

 return (
 <>
 <div className="screen-only">
 <PageContainer width="xl"fillViewport className="py-4">
 {/* Two-column layout: Main content + Sidebar */}
 <div className="flex flex-col lg:flex-row gap-6">
 {/* Main Content Area */}
 <div className="flex-1 min-w-0">
 {/* Document Title */}
 <div className="mb-4">
 <div className="w-full">
 <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              {metadata.title && (
 <p className="text-xl text-muted-foreground flex-1">
 {metadata.title}
 </p>
 )}
            </div>
          </div>
        </div>

 {/* Similar Documents Section */}
 {similarDocs.length > 0 && (
 <div className="mb-6 bg-transparent">
 <h3 className="font-bold text-lg text-foreground mb-4">Similar Documents</h3>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
 {(enrichedSimilarDocs.length > 0 ? enrichedSimilarDocs : similarDocs).map((doc) => {
 // Format document type for display
 const formatDocumentType = (): string | null => {
 if (!doc.document_type) return null;
 return doc.document_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
 };

 // Format date for display - use date_issued, fallback to publication_date
 const formatDate = (): string | null => {
 const dateValue = doc.date_issued || doc.publication_date;
 if (!dateValue) return null;
 try {
 const date = new Date(dateValue);
 return date.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' });
 } catch {
 return dateValue;
 }
 };

 const documentType = formatDocumentType();
 const dateStr = formatDate();
 const displayId = doc.document_id?.replace(/^\/doc\//, '') || doc.document_id;

 // Use title if available, then document_number, then document_id
 const displayText = doc.title && doc.title.trim() !== ''
 ? doc.title
 : (doc.document_number && doc.document_number.trim() !== ''
 ? doc.document_number
 : displayId);

 // Format judges array
 const judgesText = doc.judges && doc.judges.length > 0
 ? doc.judges.join(', ')
 : null;

 // Collect all meaningful metadata fields
 // Extract issuing body name if available (more readable than court ID)
 const issuingBodyName = doc.issuing_body && typeof doc.issuing_body === 'object' && doc.issuing_body !== null
 ? (doc.issuing_body as { name?: string }).name
 : null;

 // Determine court display name: prefer issuing_body.name, then court_name
 // Show court_name even if it looks like an ID - it's still useful information
 const courtDisplayName = issuingBodyName && issuingBodyName.trim() !== ''
 ? issuingBodyName
 : (doc.court_name && doc.court_name.trim() !== '' ? doc.court_name : null);

 const hasCourtInfo = courtDisplayName !== null;
 const hasDepartmentInfo = doc.department_name && doc.department_name.trim() !== '';
 const hasPresidingJudge = doc.presiding_judge && doc.presiding_judge.trim() !== '';
 const hasJudges = judgesText && judgesText.trim() !== '';
 // Handle parties: filter out empty arrays represented as"[]"string
 const partiesValue = Array.isArray(doc.parties)
 ? (doc.parties.length > 0 ? doc.parties.join(', ') : null)
 : (doc.parties && doc.parties.trim() !== '' && doc.parties.trim() !== '[]' ? doc.parties : null);
 const hasParties = partiesValue !== null;
 const hasOutcome = doc.outcome && doc.outcome.trim() !== '';
 const hasDocumentNumber = doc.document_number && doc.document_number.trim() !== '' && doc.document_number !== displayText;
 const hasCountry = doc.country && doc.country.trim() !== '';
 const hasLanguage = doc.language && doc.language.trim() !== '';

 const hasAnyMetadata = hasCourtInfo || hasDepartmentInfo || hasPresidingJudge || hasJudges || hasParties || hasOutcome || hasDocumentNumber || hasCountry || hasLanguage;

 return (
 <BaseCard
 key={doc.document_id}
 className="rounded-xl border border-border/50 hover:border-primary/50 transition-all duration-200 hover:shadow-md"
 clickable={true}
 variant="light"
 onClick={() => router.push(`/documents/${cleanDocumentIdForUrl(doc.document_id)}`)}
 >
 <div className="flex flex-col gap-4 p-1">
 {/* Header */}
 <div className="flex items-start gap-2">
 <div className="flex-1 min-w-0">
 <h4 className="text-base font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 group-hover:text-primary transition-colors">
 {displayText}
 </h4>
 {hasDocumentNumber && (
 <p className="text-xs text-muted-foreground font-mono">
 {doc.document_number}
 </p>
 )}
 </div>
 </div>

 {/* Primary metadata badges */}
 <div className="flex items-center gap-2 flex-wrap">
 {documentType && (
 <Badge variant="secondary"className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
 {documentType}
 </Badge>
 )}
 {dateStr && (
 <Badge variant="secondary"className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
 {dateStr}
 </Badge>
 )}
 {hasCountry && (
 <Badge variant="secondary"className="text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
 {doc.country}
 </Badge>
 )}
 </div>

 {/* Additional metadata - only show if there's meaningful content */}
 {hasAnyMetadata && (
 <div className="space-y-2 pt-3 border-t border-border/50">
 {(hasCourtInfo || hasDepartmentInfo) && (
 <div className="text-xs">
 <span className="font-semibold text-foreground">Court:</span>
 <span className="text-muted-foreground ml-1.5">
 {courtDisplayName || ''}
 {hasCourtInfo && hasDepartmentInfo && ` - `}
 {hasDepartmentInfo && doc.department_name}
 </span>
 </div>
 )}
 {hasPresidingJudge && (
 <div className="text-xs">
 <span className="font-semibold text-foreground">Presiding Judge:</span>
 <span className="text-muted-foreground ml-1.5">{doc.presiding_judge}</span>
 </div>
 )}
 {hasJudges && !hasPresidingJudge && (
 <div className="text-xs">
 <span className="font-semibold text-foreground">Judges:</span>
 <span className="text-muted-foreground ml-1.5">{judgesText}</span>
 </div>
 )}
 {hasParties && (
 <div className="text-xs">
 <span className="font-semibold text-foreground">Parties:</span>
 <span className="text-muted-foreground ml-1.5 line-clamp-2">{partiesValue}</span>
 </div>
 )}
 {hasOutcome && (
 <div className="text-xs">
 <span className="font-semibold text-foreground">Outcome:</span>
 <span className="text-muted-foreground ml-1.5 line-clamp-2">{doc.outcome}</span>
 </div>
 )}
 </div>
 )}

 {/* Footer with link indicator */}
 <div className="flex items-center justify-end pt-2 border-t border-border/30">
 <div className="flex items-center gap-1.5 text-xs text-muted-foreground group-hover:text-primary transition-colors">
 <span className="font-medium">View document</span>
 <ExternalLink className="w-3.5 h-3.5"/>
 </div>
 </div>
 </div>
 </BaseCard>
 );
 })}
 </div>
 </div>
 )}

 {/* Summary and Thesis Section */}
 {
 (metadata.summary || metadata.thesis) && (
 <div className="mb-6 space-y-4">
 {metadata.summary && (
 <BaseCard
 className="rounded-2xl"
 clickable={false}
 variant="light"
 title={
 <div className="flex items-center gap-2">
 <Info className="h-4 w-4 text-primary"/>
 <h3 className="font-bold text-lg text-foreground">Document Summary</h3>
 <Badge variant="secondary"className="text-xs flex items-center gap-1 bg-purple-100 text-purple-700 border-purple-200 whitespace-normal break-words">
 <Sparkles className="h-3 w-3"/>
 AI Generated
 </Badge>
 </div>
 }
 >
 <div>
 <p className="text-sm text-slate-700 leading-relaxed text-justify">
 {metadata.summary}
 </p>
 <div className="mt-3 pt-3 border-t border-border">
 <AIDisclaimerBadge showBorder={false} linkText="See disclaimer"/>
 </div>
 </div>
 </BaseCard>
 )}

 {metadata.thesis && (
 <BaseCard
 className="rounded-2xl"
 clickable={false}
 variant="light"
 title={
 <div className="flex items-center justify-between">
 <h3 className="font-bold text-lg text-foreground">Thesis</h3>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setIsThesisExpanded(!isThesisExpanded)}
 className="gap-2"
 >
 {isThesisExpanded ? (
 <>
 <ChevronUp className="w-4 h-4"/>
 Collapse
 </>
 ) : (
 <>
 <ChevronDown className="w-4 h-4"/>
 Expand
 </>
 )}
 </Button>
 </div>
 }
 >
 <div
 className={`transition-all duration-300 ease-in-out ${isThesisExpanded
 ? 'opacity-100'
 : 'opacity-0 max-h-0 overflow-hidden'
 }`}
 >
 <div className="text-foreground text-base leading-7 break-words whitespace-normal">
 {metadata.thesis}
 </div>
 </div>
 </BaseCard>
 )}
 </div>
 )
 }

 {/* AI Summarization Section */}
 <div className="mb-6">
 <BaseCard
 className="rounded-2xl"
 clickable={false}
 variant="light"
 title={
 <div className="flex items-center justify-between w-full">
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-primary"/>
 <h3 className="font-bold text-lg text-foreground">AI Summary</h3>
 <Badge variant="secondary"className="text-xs flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
 <Sparkles className="h-3 w-3"/>
 GPT-4
 </Badge>
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setIsSummaryPanelOpen(!isSummaryPanelOpen)}
 className="gap-2"
 >
 {isSummaryPanelOpen ? (
 <>
 <ChevronUp className="w-4 h-4"/>
 Collapse
 </>
 ) : (
 <>
 <ChevronDown className="w-4 h-4"/>
 Expand
 </>
 )}
 </Button>
 </div>
 }
 >
 <div
 className={`transition-all duration-300 ease-in-out ${isSummaryPanelOpen
 ? 'opacity-100'
 : 'opacity-0 max-h-0 overflow-hidden'
 }`}
 >
 {authLoading ? (
 <p className="text-sm text-muted-foreground">Checking whether AI analysis is available for your account...</p>
 ) : !canUseDocumentAI ? (
 <AuthRequiredAIActionsNotice message="AI-generated summaries are available for signed-in users."/>
 ) : (
 <>
 {/* Summary Controls */}
 <div className="flex flex-col sm:flex-row gap-4 mb-4">
 <div className="flex-1">
 <label className="block text-xs font-medium text-muted-foreground mb-1.5">
 Summary Type
 </label>
 <select
 value={summaryType}
 onChange={(e) => setSummaryType(e.target.value as"executive"|"key_findings"|"synthesis")}
 className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
 disabled={isSummarizing}
 >
 <option value="executive">Executive Summary</option>
 <option value="key_findings">Key Findings</option>
 <option value="synthesis">Document Synthesis</option>
 </select>
 </div>

 <div className="flex-1">
 <label className="block text-xs font-medium text-muted-foreground mb-1.5">
 Length
 </label>
 <select
 value={summaryLength}
 onChange={(e) => setSummaryLength(e.target.value as"short"|"medium"|"long")}
 className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
 disabled={isSummarizing}
 >
 <option value="short">Short (~150 words)</option>
 <option value="medium">Medium (~300 words)</option>
 <option value="long">Long (~600 words)</option>
 </select>
 </div>

 <div className="flex items-end">
 <Button
 onClick={handleGenerateSummary}
 disabled={isSummarizing}
 className="gap-2 whitespace-nowrap"
 >
 {isSummarizing ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin"/>
 Generating...
 </>
 ) : (
 <>
 <Sparkles className="h-4 w-4"/>
 Generate Summary
 </>
 )}
 </Button>
 </div>
 </div>

 {/* Summary Error */}
 {summaryError && (
 <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
 {summaryError}
 </div>
 )}

 {/* Summary Result */}
 {summaryResult && (
 <div className="space-y-4">
 <div className="prose prose-sm max-w-none text-foreground">
 <ReactMarkdown>{summaryResult.summary}</ReactMarkdown>
 </div>

 {summaryResult.key_points && summaryResult.key_points.length > 0 && (
 <div className="mt-4 pt-4 border-t border-border">
 <h4 className="text-sm font-semibold text-foreground mb-2">Key Points</h4>
 <ul className="space-y-1.5">
 {summaryResult.key_points.map((point, idx) => (
 <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
 <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"/>
 {point}
 </li>
 ))}
 </ul>
 </div>
 )}

 <div className="pt-3 border-t border-border">
 <AIDisclaimerBadge showBorder={false} linkText="See disclaimer"/>
 </div>
 </div>
 )}

 {/* Empty state */}
 {!summaryResult && !summaryError && !isSummarizing && (
 <p className="text-sm text-muted-foreground">
 Select summary type and length, then click &quot;Generate Summary&quot; to create an AI-powered analysis of this document.
 </p>
 )}
 </>
 )}
 </div>
 </BaseCard>
 </div>

 {/* Key Points Extraction Section */}
 <div className="mb-6">
 <BaseCard
 className="rounded-2xl"
 clickable={false}
 variant="light"
 title={
 <div className="flex items-center justify-between w-full">
 <div className="flex items-center gap-2">
 <Scale className="h-4 w-4 text-primary"/>
 <h3 className="font-bold text-lg text-foreground">Key Points</h3>
 <Badge variant="secondary"className="text-xs flex items-center gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
 <Sparkles className="h-3 w-3"/>
 AI Analysis
 </Badge>
 </div>
 <Button
 variant="ghost"
 size="sm"
 onClick={() => setIsKeyPointsPanelOpen(!isKeyPointsPanelOpen)}
 className="gap-2"
 >
 {isKeyPointsPanelOpen ? (
 <>
 <ChevronUp className="w-4 h-4"/>
 Collapse
 </>
 ) : (
 <>
 <ChevronDown className="w-4 h-4"/>
 Expand
 </>
 )}
 </Button>
 </div>
 }
 >
 <div
 className={`transition-all duration-300 ease-in-out ${isKeyPointsPanelOpen
 ? 'opacity-100'
 : 'opacity-0 max-h-0 overflow-hidden'
 }`}
 >
 {authLoading ? (
 <p className="text-sm text-muted-foreground">Checking whether AI analysis is available for your account...</p>
 ) : !canUseDocumentAI ? (
 <AuthRequiredAIActionsNotice message="AI key-point extraction is available for signed-in users."/>
 ) : (
 <>
 {/* Extract Button */}
 <div className="mb-4">
 <Button
 onClick={handleExtractKeyPoints}
 disabled={isExtractingKeyPoints}
 className="gap-2"
 >
 {isExtractingKeyPoints ? (
 <>
 <Loader2 className="h-4 w-4 animate-spin"/>
 Extracting...
 </>
 ) : (
 <>
 <Sparkles className="h-4 w-4"/>
 Extract Key Points
 </>
 )}
 </Button>
 </div>

 {/* Error */}
 {keyPointsError && (
 <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
 {keyPointsError}
 </div>
 )}

 {/* Key Points Result */}
 {keyPointsResult && (
 <div className="space-y-6">
 {/* Arguments Section */}
 {keyPointsResult.arguments.length > 0 && (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <MessageSquare className="h-4 w-4 text-blue-600"/>
 <h4 className="text-sm font-semibold text-foreground">Arguments</h4>
 <Badge variant="secondary"className="text-xs">{keyPointsResult.arguments.length}</Badge>
 </div>
 <ul className="space-y-3">
 {keyPointsResult.arguments.map((arg, idx) => (
 <li key={idx} className="flex items-start gap-3 text-sm">
 <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="font-medium text-blue-700">{arg.party}:</span>
 <span className="text-foreground ml-1">{arg.text}</span>
 <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
 {arg.source_ref}
 </span>
 </div>
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Holdings Section */}
 {keyPointsResult.holdings.length > 0 && (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <Scale className="h-4 w-4 text-amber-600"/>
 <h4 className="text-sm font-semibold text-foreground">Holdings</h4>
 <Badge variant="secondary"className="text-xs">{keyPointsResult.holdings.length}</Badge>
 </div>
 <ul className="space-y-3">
 {keyPointsResult.holdings.map((holding, idx) => (
 <li key={idx} className="flex items-start gap-3 text-sm">
 <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="text-foreground">{holding.text}</span>
 <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
 {holding.source_ref}
 </span>
 </div>
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Legal Principles Section */}
 {keyPointsResult.legal_principles.length > 0 && (
 <div>
 <div className="flex items-center gap-2 mb-3">
 <BookOpen className="h-4 w-4 text-purple-600"/>
 <h4 className="text-sm font-semibold text-foreground">Legal Principles</h4>
 <Badge variant="secondary"className="text-xs">{keyPointsResult.legal_principles.length}</Badge>
 </div>
 <ul className="space-y-3">
 {keyPointsResult.legal_principles.map((principle, idx) => (
 <li key={idx} className="flex items-start gap-3 text-sm">
 <span className="inline-block mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-500 flex-shrink-0"/>
 <div className="flex-1 min-w-0">
 <span className="text-foreground">{principle.text}</span>
 {principle.legal_basis && (
 <span className="ml-2 text-xs font-medium text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
 {principle.legal_basis}
 </span>
 )}
 <span className="ml-2 text-xs text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded">
 {principle.source_ref}
 </span>
 </div>
 </li>
 ))}
 </ul>
 </div>
 )}

 <div className="pt-3 border-t border-border">
 <AIDisclaimerBadge showBorder={false} linkText="See disclaimer"/>
 </div>
 </div>
 )}

 {/* Empty state */}
 {!keyPointsResult && !keyPointsError && !isExtractingKeyPoints && (
 <p className="text-sm text-muted-foreground">
 Click &quot;Extract Key Points&quot; to identify key arguments, holdings, and legal principles from this document with source paragraph references.
 </p>
 )}
 </>
 )}
 </div>
 </BaseCard>
 </div>

 {/* Version History */}
 <VersionHistory
 documentId={documentId}
 onRevert={fetchDocumentData}
 />

 {/* Main Content */}
 <div>
 {/* Document Content */}
 <div
 className={`printable transition-all duration-300 ease-in-out ${isDocumentExpanded
 ? 'opacity-100'
 : 'opacity-0 max-h-0 overflow-hidden'
 } printable-document-content`}
 >
 <SanitizedHtmlView
 htmlString={htmlString}
 metadata={metadata}
 />
 </div>
 </div>
 </div>

 {/* Sidebar - Metadata */}
 {metadata && (
 <aside className="w-full lg:w-80 flex-shrink-0">
 <div className="sticky top-4">
 <h3 className="font-bold text-lg text-foreground mb-3">Metadata</h3>
 <KeyInformation metadata={metadata} />
 </div>
 </aside>
 )}
 </div>
 </PageContainer>
 </div>
 </>
 );
}
