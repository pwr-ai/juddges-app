/**
 * Key Information Component
 * Displays key document metadata fields in a structured, readable format
 * Uses Legal Glassmorphism 2.0 styling for consistency
 */

import React, { memo } from 'react';
import {
 Calendar,
 FileText,
 Scale,
 MapPin,
 Globe,
 Hash,
 User,
 Users,
 Gavel,
 Building2,
 Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

export interface KeyInformationProps {
 /**
 * Document metadata object containing all document fields
 */
 metadata: {
 document_id?: string | null;
 title?: string | null;
 document_type?: string | null;
 date_issued?: string | null;
 document_number?: string | null;
 language?: string | null;
 country?: string | null;
 court_name?: string | null;
 department_name?: string | null;
 presiding_judge?: string | null;
 judges?: string[] | null;
 parties?: string | null;
 outcome?: string | null;
 legal_bases?: string[] | null;
 publication_date?: string | null;
 [key: string]: unknown;
 };
 /**
 * Optional className for the container
 */
 className?: string;
}

/**
 * Helper function to format dates
 */
const formatDate = (dateStr: string | null | undefined): string | null => {
 if (!dateStr) return null;
 const cleanDateStr = typeof dateStr === 'string' ? dateStr.replace(/<[^>]*>/g, '') : String(dateStr);
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

/**
 * Helper function to format document type
 */
const formatDocumentType = (type: string | null | undefined): string | null => {
 if (!type) return null;
 return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Helper function to convert arrays to comma-separated strings
 */
const arrayToString = (arr: unknown): string | null => {
 if (!Array.isArray(arr)) return null;
 const validItems = arr
 .filter((item: unknown) => {
 if (item === null || item === undefined) return false;
 const cleanItem = typeof item === 'string'
 ? item.replace(/<[^>]*>/g, '').trim()
 : String(item).replace(/<[^>]*>/g, '').trim();
 return cleanItem !== '';
 })
 .map((item: unknown) => {
 const cleanItem = typeof item === 'string'
 ? item.replace(/<[^>]*>/g, '').trim()
 : String(item).replace(/<[^>]*>/g, '').trim();
 return cleanItem;
 });

 if (validItems.length === 0) return null;
 return validItems.join(', ');
};

/**
 * Helper to check if a value is meaningful
 */
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

/**
 * Key Information Component
 *
 * Displays key document metadata in a structured grid layout with icons.
 * Only shows fields that have meaningful values.
 *
 * @example
 * ```tsx
 * <KeyInformation metadata={documentMetadata} />
 * ```
 */
export const KeyInformation = memo(function KeyInformation({
 metadata,
 className,
}: KeyInformationProps) {
 // Extract and format values
 const documentType = formatDocumentType(metadata.document_type);
 const dateIssued = formatDate(metadata.date_issued);
 const publicationDate = formatDate(metadata.publication_date);
 const documentNumber = metadata.document_number
 ? String(metadata.document_number).replace(/<[^>]*>/g, '').trim()
 : null;
 const language = metadata.language
 ? String(metadata.language).replace(/<[^>]*>/g, '').trim()
 : null;
 const country = metadata.country
 ? String(metadata.country).replace(/<[^>]*>/g, '').trim()
 : null;
 const courtName = metadata.court_name
 ? String(metadata.court_name).replace(/<[^>]*>/g, '').trim()
 : null;
 const departmentName = metadata.department_name
 ? String(metadata.department_name).replace(/<[^>]*>/g, '').trim()
 : null;
 const presidingJudge = metadata.presiding_judge
 ? String(metadata.presiding_judge).replace(/<[^>]*>/g, '').trim()
 : null;
 const judges = arrayToString(metadata.judges);
 // Handle parties: filter out empty arrays represented as"[]"string or actual empty arrays
 const parties = (() => {
 if (!metadata.parties) return null;
 if (Array.isArray(metadata.parties)) {
 return metadata.parties.length > 0 ? metadata.parties.join(', ') : null;
 }
 const partiesStr = String(metadata.parties).replace(/<[^>]*>/g, '').trim();
 return partiesStr !== '' && partiesStr !== '[]' ? partiesStr : null;
 })();
 const outcome = metadata.outcome
 ? String(metadata.outcome).replace(/<[^>]*>/g, '').trim()
 : null;
 const legalBases = arrayToString(metadata.legal_bases);

 // Build list of fields to display
 const fields: Array<{
 icon: React.ComponentType<{ className?: string }>;
 label: string;
 value: string | null;
 fullWidth?: boolean;
 }> = [];

 if (documentType && hasMeaningfulValue(documentType)) {
 fields.push({ icon: FileText, label: 'Document Type', value: documentType });
 }
 if (dateIssued && hasMeaningfulValue(dateIssued)) {
 fields.push({ icon: Calendar, label: 'Date Issued', value: dateIssued });
 }
 if (publicationDate && hasMeaningfulValue(publicationDate)) {
 fields.push({ icon: Calendar, label: 'Publication Date', value: publicationDate });
 }
 if (documentNumber && hasMeaningfulValue(documentNumber)) {
 fields.push({ icon: Hash, label: 'Document Number', value: documentNumber });
 }
 if (language && hasMeaningfulValue(language)) {
 fields.push({ icon: Globe, label: 'Language', value: language });
 }
 if (country && hasMeaningfulValue(country)) {
 fields.push({ icon: MapPin, label: 'Country', value: country });
 }
 if (courtName && hasMeaningfulValue(courtName)) {
 const courtValue = departmentName
 ? `${courtName}${departmentName ? ` - ${departmentName}` : ''}`
 : courtName;
 fields.push({ icon: Scale, label: 'Court', value: courtValue });
 }
 if (presidingJudge && hasMeaningfulValue(presidingJudge)) {
 fields.push({ icon: Gavel, label: 'Presiding Judge', value: presidingJudge });
 }
 if (judges && hasMeaningfulValue(judges)) {
 fields.push({ icon: Users, label: 'Judges', value: judges });
 }
 if (parties && hasMeaningfulValue(parties)) {
 fields.push({ icon: User, label: 'Parties', value: parties, fullWidth: true });
 }
 if (outcome && hasMeaningfulValue(outcome)) {
 fields.push({ icon: Tag, label: 'Outcome', value: outcome, fullWidth: true });
 }
 if (legalBases && hasMeaningfulValue(legalBases)) {
 fields.push({ icon: Building2, label: 'Legal Bases', value: legalBases, fullWidth: true });
 }

 if (fields.length === 0) {
 return null;
 }

 return (
 <div
 className={cn(
 // Legal Glassmorphism 2.0 - Light Glass Card
"rounded-2xl border border-slate-200/50",
"bg-white/60 backdrop-blur-md",
"p-6",
 className
 )}
 >
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {fields.map((field, index) => {
 const Icon = field.icon;
 return (
 <div
 key={index}
 className={cn(
"flex items-start gap-3",
 field.fullWidth &&"md:col-span-2"
 )}
 >
 <div className="flex-shrink-0 mt-0.5">
 <div className="rounded-lg p-2 bg-slate-100/80 border border-slate-200/50">
 <Icon className="h-4 w-4 text-slate-600"/>
 </div>
 </div>
 <div className="flex-1 min-w-0">
 <div className="text-xs font-semibold text-slate-600 mb-1">
 {field.label}
 </div>
 <div className="text-sm text-slate-900 break-words">
 {field.value}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 </div>
 );
});
