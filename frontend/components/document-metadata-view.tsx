'use client';

import React from 'react';
import {
 Calendar,
 Hash,
 Globe,
 Scale,
 FileText,
 Users,
 Gavel,
 BookOpen,
 Tag,
 Link as LinkIcon,
 Building2,
 User,
 CheckCircle2,
 Clock,
 MapPin
} from 'lucide-react';
import { BaseCard } from '@/lib/styles/components';
import { Badge } from '@/lib/styles/components';
import { Separator } from '@/components/ui/separator';
import { getHeaderGradientStyle } from '@/lib/styles/components/headers';

interface DocumentMetadata {
 [key: string]: any;
}

interface DocumentMetadataViewProps {
 metadata: DocumentMetadata;
}

const formatDate = (dateStr: string | null | undefined) => {
 if (!dateStr) return null;
 // Strip HTML tags from date string
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

const formatFieldName = (key: string): string => {
 return key
 .replace(/_/g, ' ')
 .replace(/\b\w/g, l => l.toUpperCase());
};

const isArray = (value: any): boolean => {
 return Array.isArray(value);
};

const isObject = (value: any): boolean => {
 return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
};

const isUrl = (value: string): boolean => {
 try {
 new URL(value);
 return true;
 } catch {
 return false;
 }
};

const getFieldIcon = (key: string) => {
 const iconMap: Record<string, React.ReactNode> = {
 date_issued: <Calendar className="w-4 h-4"/>,
 publication_date: <Calendar className="w-4 h-4"/>,
 judgment_date: <Calendar className="w-4 h-4"/>,
 submission_date: <Calendar className="w-4 h-4"/>,
 last_updated: <Clock className="w-4 h-4"/>,
 document_number: <Hash className="w-4 h-4"/>,
 language: <Globe className="w-4 h-4"/>,
 country: <MapPin className="w-4 h-4"/>,
 court_name: <Scale className="w-4 h-4"/>,
 department_name: <Building2 className="w-4 h-4"/>,
 presiding_judge: <User className="w-4 h-4"/>,
 judge_rapporteur: <User className="w-4 h-4"/>,
 judges: <Users className="w-4 h-4"/>,
 parties: <Users className="w-4 h-4"/>,
 outcome: <CheckCircle2 className="w-4 h-4"/>,
 decision: <CheckCircle2 className="w-4 h-4"/>,
 legal_bases: <BookOpen className="w-4 h-4"/>,
 extracted_legal_bases: <BookOpen className="w-4 h-4"/>,
 keywords: <Tag className="w-4 h-4"/>,
 source_url: <LinkIcon className="w-4 h-4"/>,
 document_id: <FileText className="w-4 h-4"/>,
 };
 return iconMap[key] || <FileText className="w-4 h-4"/>;
};

const hasContent = (node: React.ReactNode): boolean => {
 if (node === null || node === undefined || node === false) return false;
 if (typeof node === 'string') return node.trim() !== '';
 if (typeof node === 'number') return true;
 if (Array.isArray(node)) {
 if (node.length === 0) return false;
 // Check if array has any non-empty content
 return node.some(item => {
 if (item === null || item === undefined || item === false) return false;
 if (typeof item === 'string') return item.trim() !== '';
 if (Array.isArray(item)) return item.length > 0;
 return hasContent(item);
 });
 }
 if (typeof node === 'object' && node !== null && 'props' in node) {
 // React element - check if it has children
 const props = (node as any).props;
 if (props && props.children) {
 return hasContent(props.children);
 }
 return true; // Element exists even without children
 }
 return true;
};

const shouldDisplayField = (key: string, value: any): boolean => {
 // Skip internal fields and large text fields shown above document content or in header
 // Also skip fields that are shown in the key metadata section above summary
 const skipFields = [
 'x', 'y', 'vectors', 'full_text', 'raw_content', 'score', 'summary', 'thesis', 'title',
 'legal_bases', 'extracted_legal_bases', 'document_type', 'document_id',
 'court_name', 'issuing_body', 'presiding_judge', 'judge_rapporteur', 'judges', 'parties', 'outcome', 'decision', 'finality', // Shown in Key Information
 'country', 'judgment_date', 'legal_concepts', 'legal_references', 'keywords', 'department_name', 'author', // Shown in Key Information
 'document_number', 'docket_number', 'related_docket_numbers', // Shown in header as main title / removed
 'language', // Shown in header as badge
 'regulations', // Same as legal_bases
 'chunks', 'chunk_count', 'chunk_count_total', 'num_chunks', 'chunks_count', 'chunkcount', 'chunkscount', // Useless for lawyers
 'xml_uri', 'uri', // Internal URIs not needed in sidebar
 // Large text content fields that should not be in sidebar
 'justification', 'reasons_for_judgment', 'sentence', 'factual_state', 'legal_state',
 'assessment', 'position', 'additional_information', 'legal_justification', 'taxpayer_position',
 'reasons', 'reasoning', 'explanation', 'description', 'content', 'text', 'body', 'details',
 'comment', 'note', 'remarks', 'observations', 'analysis', 'conclusion', 'discussion',
 'question' // Question field should not be in sidebar
 ];
 if (skipFields.includes(key.toLowerCase())) return false;

 // Explicitly skip document_id (should be in main metadata, not sidebar)
 if (key.toLowerCase() === 'document_id' || key.toLowerCase() === 'id') return false;

 // Explicitly skip document_type (shown in header as badge, not sidebar)
 if (key.toLowerCase() === 'document_type' || key.toLowerCase() === 'category') return false;

 // Skip ingestion_date - not needed for display
 if (key === 'ingestion_date') return false;

 // Skip any field that contains"docker"in the name (case-insensitive)
 if (key.toLowerCase().includes('docker')) return false;

 // Skip any field that contains"chunk"in the name (case-insensitive)
 if (key.toLowerCase().includes('chunk')) return false;

 // Skip null/undefined/empty values
 if (value === null || value === undefined) return false;

 // Skip processing_status when it's"completed"(useless)
 if (key.toLowerCase() === 'processing_status' && String(value).toLowerCase() === 'completed') {
 return false;
 }

 // Skip empty strings
 if (typeof value === 'string') {
 const trimmed = value.trim();
 if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false;

 // Skip large text strings (more than 200 characters) - these are likely content fields
 if (trimmed.length > 200) return false;
 }

 // Skip empty arrays
 if (Array.isArray(value)) {
 if (value.length === 0) return false;
 // Check if array contains only empty/null values
 const hasValidValue = value.some(item => {
 if (item === null || item === undefined) return false;
 if (typeof item === 'string' && item.trim() === '') return false;
 if (Array.isArray(item) && item.length === 0) return false;
 if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
 return true;
 });
 if (!hasValidValue) return false;
 }

 // Skip empty objects
 if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
 const keys = Object.keys(value);
 if (keys.length === 0) return false;
 // Check if object has any non-empty values
 const hasValidValue = keys.some(k => {
 const v = value[k];
 if (v === null || v === undefined) return false;
 if (typeof v === 'string' && v.trim() === '') return false;
 return true;
 });
 if (!hasValidValue) return false;
 }

 return true;
};

// Helper to render badge or styled div/span based on field type
const renderBadgeOrSpan = (content: string, key: string | number, isLegalReferences: boolean) => {
 if (isLegalReferences) {
 return (
 <div
 key={key}
 className="block rounded-md border px-2 py-0.5 text-xs font-medium break-words bg-slate-100/60 border-slate-200/30 text-foreground"
 style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
 >
 {content}
 </div>
 );
 }
 return (
 <Badge key={key} variant="secondary"className="text-xs">
 {content}
 </Badge>
 );
};

const renderFieldValue = (value: any, fieldKey?: string): React.ReactNode => {
 const isLegalReferences = fieldKey === 'legal_references' || fieldKey === 'references' || (fieldKey?.toLowerCase().includes('reference') ?? false);
 if (isArray(value)) {
 // Try to parse JSON strings in arrays
 const parsed = value.map((item: any) => {
 if (typeof item === 'string' && (item.startsWith('[') || item.startsWith('{'))) {
 try {
 return JSON.parse(item);
 } catch {
 return item;
 }
 }
 return item;
 }).filter((item: any) => {
 // Filter out empty/null items and empty arrays/objects
 if (item === null || item === undefined) return false;
 if (typeof item === 'string' && item.trim() === '') return false;
 if (Array.isArray(item) && item.length === 0) return false;
 if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
 return true;
 });

 if (parsed.length === 0) return null;

 // Parse arrays - show objects in a readable format, not raw JSON
 // Filter out any null items that might have been created
 const validItems = parsed.filter((item: any) => item !== null && item !== undefined);
 if (validItems.length === 0) return null;

 return (
 <div className="space-y-2">
 {validItems.map((item: any, idx: number) => {
 if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
 // For legal_references, if object has 'text' property, extract and render as badge/span
 if (isLegalReferences && 'text' in item && typeof item.text === 'string') {
 const cleanText = item.text.replace(/<[^>]*>/g, '').trim();
 if (cleanText) {
 return renderBadgeOrSpan(cleanText, idx, isLegalReferences);
 }
 }

 // For objects, show key-value pairs in a readable format
 const entries = Object.entries(item).filter(([k, v]) => {
 if (v === null || v === undefined) return false;
 if (typeof v === 'string' && v.trim() === '') return false;
 return true;
 });

 if (entries.length === 0) return null;

 return (
 <div key={idx} className="text-xs bg-muted p-2 rounded space-y-1">
 {entries.map(([k, v]) => {
 const cleanValue = typeof v === 'string' ? v.replace(/<[^>]*>/g, '') : String(v);
 return (
 <div key={k} className="flex gap-2">
 <span className="font-semibold">{k}:</span>
 <span>{cleanValue}</span>
 </div>
 );
 })}
 </div>
 );
 }

 // For arrays within arrays, render recursively
 if (Array.isArray(item)) {
 const filteredSubItems = item.filter((subItem: any) => {
 if (subItem === null || subItem === undefined) return false;
 if (typeof subItem === 'string' && subItem.trim() === '') return false;
 if (Array.isArray(subItem) && subItem.length === 0) return false;
 if (typeof subItem === 'object' && !Array.isArray(subItem) && Object.keys(subItem).length === 0) return false;
 return true;
 });

 if (filteredSubItems.length === 0) return null;

 return (
 <div key={idx} className={isLegalReferences ? "block space-y-2": "flex flex-wrap gap-2"}>
 {filteredSubItems.map((subItem: any, subIdx: number) => {
 const cleanSubItem = typeof subItem === 'string' ? subItem.replace(/<[^>]*>/g, '') : String(subItem);
 return renderBadgeOrSpan(cleanSubItem, subIdx, isLegalReferences);
 })}
 </div>
 );
 }

 // Strip HTML tags from string values
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '') : String(item);
 return renderBadgeOrSpan(cleanItem, idx, isLegalReferences);
 })}
 </div>
 );
 }

 if (isObject(value)) {
 // For legal_references, if object has 'text' property, extract and render directly
 if (isLegalReferences && 'text' in value && typeof value.text === 'string') {
 const cleanText = value.text.replace(/<[^>]*>/g, '').trim();
 if (cleanText) {
 return renderBadgeOrSpan(cleanText, 0, isLegalReferences);
 }
 }

 // Try to extract meaningful string values from the object
 const stringValues = Object.values(value)
 .filter(v => v !== null && v !== undefined)
 .map(v => {
 if (typeof v === 'string' && v.trim() !== '') {
 return v.replace(/<[^>]*>/g, '').trim();
 }
 if (typeof v === 'number') {
 return String(v);
 }
 return null;
 })
 .filter(v => v !== null && v !== '');

 // If we found string values, display them as text or badges
 if (stringValues.length > 0) {
 if (stringValues.length === 1) {
 // Single value - display as text or styled span for legal_references
 const firstValue = stringValues[0];
 if (firstValue && isLegalReferences) {
 return renderBadgeOrSpan(firstValue, 0, isLegalReferences);
 }
 if (firstValue) {
 return <span className="text-sm">{firstValue}</span>;
 }
 } else {
 // Multiple values - display as badges or styled spans for legal_references
 return (
 <div className={isLegalReferences ? "block space-y-2": "flex flex-wrap gap-2"}>
 {stringValues.filter((val): val is string => val !== null).map((val, idx) => renderBadgeOrSpan(val, idx, isLegalReferences))}
 </div>
 );
 }
 }

 // If no string values found, show as JSON
 return (
 <div className="text-xs bg-muted p-2 rounded font-mono">
 {JSON.stringify(value, null, 2)}
 </div>
 );
 }

 if (typeof value === 'string' && isUrl(value)) {
 // Strip HTML tags from URL
 const cleanUrl = value.replace(/<[^>]*>/g, '');
 return (
 <a
 href={cleanUrl}
 target="_blank"
 rel="noopener noreferrer"
 className="text-primary hover:underline flex items-center gap-1"
 >
 {cleanUrl}
 <LinkIcon className="w-3 h-3"/>
 </a>
 );
 }

 // Check if it's a JSON string
 if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
 try {
 const parsed = JSON.parse(value);
 if (isArray(parsed)) {
 // Filter out empty items
 const filtered = parsed.filter((item: any) => {
 if (item === null || item === undefined) return false;
 if (typeof item === 'string' && item.trim() === '') return false;
 if (Array.isArray(item) && item.length === 0) return false;
 if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
 return true;
 });

 if (filtered.length === 0) return null;

 return (
 <div className={isLegalReferences ? "block space-y-2": "flex flex-wrap gap-2"}>
 {filtered.map((item: any, idx: number) => {
 // Strip HTML tags from string values
 const cleanItem = typeof item === 'string' ? item.replace(/<[^>]*>/g, '') : String(item);
 return renderBadgeOrSpan(cleanItem, idx, isLegalReferences);
 })}
 </div>
 );
 }
 if (isObject(parsed)) {
 return (
 <div className="text-xs bg-muted p-2 rounded font-mono">
 {JSON.stringify(parsed, null, 2)}
 </div>
 );
 }
 } catch {
 // Not valid JSON, continue with normal string rendering
 }
 }

 // Strip HTML tags from string values
 const cleanValue = typeof value === 'string' ? value.replace(/<[^>]*>/g, '') : String(value);
 return <span className="text-sm">{cleanValue}</span>;
};

export function DocumentMetadataView({ metadata }: DocumentMetadataViewProps) {

 // Group fields into categories
 // Note: Fields moved to Key Information: country, judgment_date, legal_concepts, legal_references, keywords, department_name, issuing_body
 // Note: Fields moved from Key Information to sidebar: status, processing_status

 // Document Status & Validation
 const statusFields = [
 'status',
 'interpretation_status',
 ];

 // Source & References
 const sourceFields = [
 'source_url',
 'references',
 ];

 // Historical Dates
 const dateFields = [
 'submission_date',
 'date_issued',
 'publication_date',
 'last_updated',
 ];

 // Administrative Data (Internal Use)
 const adminFields = [
 'processing_status',
 ];

 // Fields to display at the end
 const endFields = [
 'last_updated',
 ];

 const otherFields = Object.keys(metadata).filter(
 key =>
 key !== 'ingestion_date' && // Explicitly exclude ingestion_date
 !statusFields.includes(key) &&
 !sourceFields.includes(key) &&
 !dateFields.includes(key) &&
 !adminFields.includes(key) &&
 !endFields.includes(key) &&
 shouldDisplayField(key, metadata[key])
 );

 // Helper function to extract string value from any type (object, array, string, etc.)
 const extractStringValue = (val: any): string => {
 if (val === null || val === undefined) return '';
 if (typeof val === 'number') return String(val);

 // Handle JSON strings (arrays or objects)
 if (typeof val === 'string') {
 const trimmed = val.trim();
 // Check if it's a JSON string
 if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
 try {
 const parsed = JSON.parse(trimmed);
 // Recursively extract from parsed value
 return extractStringValue(parsed);
 } catch {
 // If parsing fails, return trimmed string (might be a string that just starts with [)
 return trimmed;
 }
 }
 return trimmed;
 }

 if (Array.isArray(val)) {
 // Extract first meaningful string from array
 for (const item of val) {
 const extracted = extractStringValue(item);
 if (extracted !== '') return extracted;
 }
 return '';
 }

 if (typeof val === 'object' && val !== null) {
 // Extract first meaningful string value from object
 const values = Object.values(val);
 for (const v of values) {
 const extracted = extractStringValue(v);
 if (extracted !== '') return extracted;
 }
 return '';
 }

 return String(val).trim();
 };

 const renderField = (key: string, value: any) => {
 const isLegalReferences = key === 'legal_references' || key === 'references' || key.toLowerCase().includes('reference');
 if (!shouldDisplayField(key, value)) return null;

 // Skip judgment_id if it's the same as document_id
 if (key.toLowerCase() === 'judgment_id' || key.toLowerCase() === 'judgmentid') {
 const judgmentIdValue = extractStringValue(value);
 const documentIdValue = extractStringValue(metadata.document_id);
 // Check if they're the same (handle cases where judgment_id might have /doc/ prefix)
 const normalizedJudgmentId = judgmentIdValue.replace(/^\/doc\//, '').trim();
 const normalizedDocumentId = documentIdValue.replace(/^\/doc\//, '').trim();
 if (normalizedJudgmentId === normalizedDocumentId || judgmentIdValue === documentIdValue) {
 return null;
 }
 }

 // Handle case_type and case_type_description comparison
 // Prefer case_type over case_type_description when they're the same
 if (key.toLowerCase() === 'case_type_description' || key.toLowerCase() === 'case_type_desc') {
 const currentValue = extractStringValue(value);
 const caseTypeValue = metadata.case_type ? extractStringValue(metadata.case_type) : '';

 // If case_type exists and is the same as case_type_description, hide case_type_description
 if (caseTypeValue !== '' && currentValue !== '' && currentValue === caseTypeValue) {
 return null; // Hide case_type_description, show case_type instead
 }
 }
 // case_type is always shown (unless it's empty or filtered by shouldDisplayField)

 // Additional check: verify value is actually renderable
 if (value === null || value === undefined) return null;
 if (typeof value === 'string' && value.trim() === '') return null;
 if (Array.isArray(value) && value.length === 0) return null;
 if (Array.isArray(value)) {
 if (value.length === 0) return null;
 const hasValidItems = value.some(item => {
 if (item === null || item === undefined) return false;
 if (typeof item === 'string' && item.trim() === '') return false;
 if (Array.isArray(item) && item.length === 0) return false;
 if (typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) return false;
 return true;
 });
 if (!hasValidItems) return null;
 }

 const formattedDate = dateFields.includes(key) ? formatDate(value) : null;

 // Special handling for case_type and case_type_description - extract only the string value
 let renderedValue: React.ReactNode = null;
 if (formattedDate) {
 renderedValue = null;
 } else if (key.toLowerCase() === 'case_type' || key.toLowerCase() === 'case_type_description' || key.toLowerCase() === 'case_type_desc') {
 // Extract string value from object/array/string
 const stringValue = extractStringValue(value);
 if (stringValue && stringValue !== '') {
 // Display as plain text
 renderedValue = <span className="text-sm text-foreground">{stringValue}</span>;
 }
 } else {
 renderedValue = renderFieldValue(value, key);
 }

 // If both formattedDate and renderedValue are null/empty, don't render the field
 // Check if renderedValue is actually renderable content
 const hasRenderableContent = formattedDate || (renderedValue !== null && hasContent(renderedValue));

 if (!hasRenderableContent) return null;

 return (
 <div key={key} className="space-y-2 py-2">
 <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
 {getFieldIcon(key)}
 <span>{formatFieldName(key)}</span>
 </div>
 <div className="ml-6 mt-1">
 {formattedDate ? (
 <p className="text-sm text-foreground font-medium">{formattedDate}</p>
 ) : (
 <div className="text-sm text-foreground">
 {renderedValue}
 </div>
 )}
 </div>
 </div>
 );
 };


 return (
 <BaseCard
 className="rounded-2xl"
 clickable={false}
 variant="light"
 title={<h3 className={getHeaderGradientStyle('lg')}>Document Metadata</h3>}
 >
 <div className="space-y-4">
 {/* Document Status & Validation */}
 {statusFields.some(key => shouldDisplayField(key, metadata[key]) || (key === 'status' && shouldDisplayField('interpretation_status', metadata.interpretation_status))) && (
 <div className="space-y-3">
 {(metadata.interpretation_status || (metadata as any).status) && renderField('status', metadata.interpretation_status || (metadata as any).status)}
 </div>
 )}

 {/* Source & References */}
 {sourceFields.some(key => shouldDisplayField(key, metadata[key])) && (
 <>
 <Separator className="my-4"/>
 <div className="space-y-3">
 {metadata.source_url && renderField('source_url', metadata.source_url)}
 {metadata.references && renderField('references', metadata.references)}
 </div>
 </>
 )}

 {/* Historical Dates */}
 {dateFields.some(key => shouldDisplayField(key, metadata[key])) && (
 <>
 <Separator className="my-4"/>
 <div className="space-y-3">
 {(metadata as any).submission_date && renderField('submission_date', (metadata as any).submission_date)}
 {metadata.date_issued && renderField('date_issued', metadata.date_issued)}
 {metadata.publication_date && renderField('publication_date', metadata.publication_date)}
 </div>
 </>
 )}

 {/* Administrative Data (Internal Use) */}
 {adminFields.some(key => shouldDisplayField(key, metadata[key]) && (key !== 'processing_status' || String(metadata.processing_status).toLowerCase() !== 'completed')) && (
 <>
 <Separator className="my-4"/>
 <div className="space-y-3">
 {metadata.processing_status && String(metadata.processing_status).toLowerCase() !== 'completed' && renderField('processing_status', metadata.processing_status)}
 </div>
 </>
 )}

 {otherFields.length > 0 && (
 <>
 <Separator className="my-4"/>
 {/* Other Fields */}
 <div className="space-y-3">
 {otherFields.map(key => renderField(key, metadata[key]))}
 </div>
 </>
 )}

 {/* End Fields - Last Updated */}
 {endFields.some(key => shouldDisplayField(key, metadata[key])) && (
 <>
 <Separator className="my-4"/>
 <div className="space-y-3">
 {metadata.last_updated && renderField('last_updated', metadata.last_updated)}
 </div>
 </>
 )}
 </div>
 </BaseCard>
 );
}
