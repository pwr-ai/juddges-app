'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
 Clock,
 Loader2,
 ChevronDown,
 ChevronUp,
 ExternalLink,
 Filter,
 Calendar,
 ArrowRight,
} from 'lucide-react';
import {
 PageContainer,
 BaseCard,
 Badge,
 AIDisclaimerBadge,
 LoadingIndicator,
 EmptyState,
 ErrorCard,
} from '@/lib/styles/components';
import {
 extractTimeline,
 type TimelineExtractionResponse,
 type TimelineEvent,
} from '@/lib/api';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';

const CATEGORY_COLORS: Record<string, string> = {
 filing: 'bg-blue-100 text-blue-700',
 decision: 'bg-green-100 text-green-700',
 deadline: 'bg-red-100 text-red-700',
 hearing: 'bg-purple-100 text-purple-700',
 appeal: 'bg-orange-100 text-orange-700',
 enforcement: 'bg-yellow-100 text-yellow-700',
 procedural: 'bg-gray-100 text-gray-700',
 legislative: 'bg-indigo-100 text-indigo-700',
 other: 'bg-slate-100 text-slate-700',
};

const IMPORTANCE_STYLES: Record<string, string> = {
 high: 'border-l-4 border-l-primary',
 medium: 'border-l-4 border-l-muted-foreground/40',
 low: 'border-l-4 border-l-muted/30',
};

const DOT_STYLES: Record<string, string> = {
 high: 'bg-primary ring-4 ring-primary/20',
 medium: 'bg-muted-foreground/60',
 low: 'bg-muted-foreground/30',
};

function formatDate(date: string, precision: string): string {
 if (precision === 'year') return date.substring(0, 4);
 if (precision === 'month') {
 const [year, month] = date.split('-');
 const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
 }
 return new Date(date).toLocaleDateString('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 });
}

function TimelineEventCard({
 event,
 isLast,
}: {
 event: TimelineEvent;
 isLast: boolean;
}) {
 const [isExpanded, setIsExpanded] = useState(false);

 return (
 <div className="relative flex gap-4">
 {/* Timeline line and dot */}
 <div className="flex flex-col items-center flex-shrink-0 w-8">
 <div
 className={`w-3 h-3 rounded-full mt-1.5 z-10 ${DOT_STYLES[event.importance]}`}
 />
 {!isLast && (
 <div className="w-px flex-1 bg-border"/>
 )}
 </div>

 {/* Event content */}
 <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
 <BaseCard
 clickable={false}
 variant="light"
 className={`rounded-[16px] ${IMPORTANCE_STYLES[event.importance]}`}
 >
 <div className="space-y-2">
 {/* Date and category */}
 <div className="flex items-center justify-between gap-2 flex-wrap">
 <div className="flex items-center gap-2">
 <Calendar className="h-3.5 w-3.5 text-muted-foreground"/>
 <span className="text-sm font-medium text-foreground">
 {formatDate(event.date, event.date_precision)}
 </span>
 </div>
 <div className="flex items-center gap-2">
 <span
 className={`px-2 py-0.5 rounded-full text-xs font-medium ${
 CATEGORY_COLORS[event.category] || CATEGORY_COLORS.other
 }`}
 >
 {event.category.replace(/_/g, ' ')}
 </span>
 {event.importance === 'high' && (
 <Badge variant="default"className="text-xs">
 Key Event
 </Badge>
 )}
 </div>
 </div>

 {/* Title */}
 <h3 className="font-semibold text-base text-foreground">
 {event.title}
 </h3>

 {/* Description */}
 <p className="text-sm text-muted-foreground leading-relaxed">
 {event.description}
 </p>

 {/* Parties */}
 {event.parties.length > 0 && (
 <div className="flex flex-wrap gap-1.5">
 {event.parties.map((party, idx) => (
 <Badge key={idx} variant="outline"className="text-xs">
 {party}
 </Badge>
 ))}
 </div>
 )}

 {/* Expandable legal references */}
 {event.legal_references.length > 0 && (
 <div>
 <button
 onClick={() => setIsExpanded(!isExpanded)}
 className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
 >
 {isExpanded ? (
 <ChevronUp className="h-3 w-3"/>
 ) : (
 <ChevronDown className="h-3 w-3"/>
 )}
 {event.legal_references.length} legal reference
 {event.legal_references.length !== 1 ? 's' : ''}
 </button>

 {isExpanded && (
 <div className="mt-2 pl-4 border-l-2 border-border/50">
 {event.legal_references.map((ref, idx) => (
 <p key={idx} className="text-xs text-muted-foreground py-0.5">
 {ref}
 </p>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 </BaseCard>
 </div>
 </div>
 );
}

export default function TimelinePage() {
 const router = useRouter();
 const [documentIds, setDocumentIds] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [results, setResults] = useState<TimelineExtractionResponse | null>(null);
 const [showFilters, setShowFilters] = useState(false);

 // Filter state
 const [extractionDepth, setExtractionDepth] = useState<'basic' | 'detailed' | 'comprehensive'>('detailed');
 const [focusAreas, setFocusAreas] = useState<string[]>([]);
 const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

 const handleExtract = useCallback(async () => {
 const ids = documentIds
 .split(/[,\n]+/)
 .map((id) => id.trim())
 .filter((id) => id.length > 0);

 if (ids.length === 0) {
 setError('Please enter at least one document ID.');
 return;
 }

 if (ids.length > 10) {
 setError('Maximum 10 documents allowed per extraction request.');
 return;
 }

 setIsLoading(true);
 setError(null);

 try {
 const response = await extractTimeline({
 document_ids: ids,
 extraction_depth: extractionDepth,
 focus_areas: focusAreas.length > 0 ? focusAreas : undefined,
 });

 setResults(response);
 } catch (err) {
 setError(
 err instanceof Error ? err.message : 'An unexpected error occurred.'
 );
 } finally {
 setIsLoading(false);
 }
 }, [documentIds, extractionDepth, focusAreas]);

 const handleKeyDown = useCallback(
 (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleExtract();
 }
 },
 [handleExtract]
 );

 const handleViewDocument = useCallback(
 (documentId: string) => {
 const cleanId = cleanDocumentIdForUrl(documentId);
 router.push(`/documents/${cleanId}?from=timeline`);
 },
 [router]
 );

 const toggleFocusArea = (area: string) => {
 setFocusAreas((prev) =>
 prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
 );
 };

 const filteredEvents = results?.events.filter(
 (event) => !categoryFilter || event.category === categoryFilter
 );

 const categoryCounts = results?.events.reduce<Record<string, number>>(
 (acc, event) => {
 acc[event.category] = (acc[event.category] || 0) + 1;
 return acc;
 },
 {}
 );

 return (
 <PageContainer width="medium"fillViewport>
 {/* Header */}
 <div className="space-y-2">
 <div className="flex items-center gap-3">
 <div className="p-2 rounded-xl bg-primary/10">
 <Clock className="h-6 w-6 text-primary"/>
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">
 Timeline Extraction
 </h1>
 <p className="text-sm text-muted-foreground">
 Extract chronological events and dates from legal documents to
 create interactive timelines
 </p>
 </div>
 </div>
 <AIDisclaimerBadge />
 </div>

 {/* Document ID Input */}
 <div className="space-y-3">
 <div className="relative">
 <textarea
 value={documentIds}
 onChange={(e) => setDocumentIds(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder="Enter document IDs (one per line or comma-separated)&#10;&#10;Example: II FSK 1234/21, I SA/Wa 567/22"
 className="w-full min-h-[100px] p-4 pr-12 rounded-[16px] bg-[rgba(255,255,255,0.9)] border border-border/50 text-foreground placeholder:text-muted-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
 />
 <button
 onClick={handleExtract}
 disabled={isLoading || !documentIds.trim()}
 className="absolute right-3 bottom-3 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
 aria-label="Extract timeline"
 >
 {isLoading ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
 <ArrowRight className="h-4 w-4"/>
 )}
 </button>
 </div>

 {/* Filter toggle */}
 <div className="flex items-center gap-3">
 <button
 onClick={() => setShowFilters(!showFilters)}
 className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
 >
 <Filter className="h-3.5 w-3.5"/>
 {showFilters ? 'Hide options' : 'Show options'}
 </button>
 {(focusAreas.length > 0 || extractionDepth !== 'detailed') && (
 <span className="text-xs text-primary">
 {focusAreas.length + (extractionDepth !== 'detailed' ? 1 : 0)}{' '}
 option(s) active
 </span>
 )}
 </div>

 {/* Options panel */}
 {showFilters && (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-4">
 {/* Extraction depth */}
 <div>
 <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Extraction Depth
 </label>
 <div className="flex flex-wrap gap-2 mt-2">
 {(
 [
 { value: 'basic', label: 'Basic', desc: 'Key dates only' },
 { value: 'detailed', label: 'Detailed', desc: 'All events with context' },
 { value: 'comprehensive', label: 'Comprehensive', desc: 'Full temporal analysis' },
 ] as const
 ).map((option) => (
 <button
 key={option.value}
 onClick={() => setExtractionDepth(option.value)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 extractionDepth === option.value
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 title={option.desc}
 >
 {option.label}
 </button>
 ))}
 </div>
 </div>

 {/* Focus areas */}
 <div>
 <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Focus Areas
 </label>
 <div className="flex flex-wrap gap-2 mt-2">
 {[
 'deadlines',
 'court hearings',
 'filings',
 'decisions',
 'appeals',
 'enforcement',
 ].map((area) => (
 <button
 key={area}
 onClick={() => toggleFocusArea(area)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 focusAreas.includes(area)
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 {area}
 </button>
 ))}
 </div>
 </div>
 </div>
 </BaseCard>
 )}
 </div>

 {/* Loading state */}
 {isLoading && (
 <LoadingIndicator
 variant="centered"
 size="lg"
 message="Extracting timeline..."
 subtitle="Analyzing temporal information in legal documents"
 />
 )}

 {/* Error state */}
 {error && !isLoading && (
 <ErrorCard title="Extraction Error"message={error} />
 )}

 {/* Results */}
 {results && !isLoading && (
 <div className="space-y-6">
 {/* Summary card */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 <div className="flex items-center justify-between flex-wrap gap-2">
 <h2 className="text-lg font-semibold text-foreground">
 {results.total_events} Event
 {results.total_events !== 1 ? 's' : ''} Extracted
 </h2>
 <Badge variant="outline"className="text-xs">
 {results.extraction_depth} depth
 </Badge>
 </div>

 {results.timeline_summary && (
 <p className="text-sm text-muted-foreground leading-relaxed">
 {results.timeline_summary}
 </p>
 )}

 {results.date_range.earliest && results.date_range.latest && (
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5"/>
 <span>{results.date_range.earliest}</span>
 <ArrowRight className="h-3 w-3"/>
 <span>{results.date_range.latest}</span>
 </div>
 )}

 {/* Document links */}
 <div className="flex flex-wrap gap-2 pt-1">
 {results.document_ids.map((docId) => (
 <button
 key={docId}
 onClick={() => handleViewDocument(docId)}
 className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
 >
 <ExternalLink className="h-3 w-3"/>
 {docId}
 </button>
 ))}
 </div>
 </div>
 </BaseCard>

 {/* Category filter */}
 {categoryCounts && Object.keys(categoryCounts).length > 1 && (
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => setCategoryFilter(null)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 categoryFilter === null
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 All ({results.total_events})
 </button>
 {Object.entries(categoryCounts).map(([category, count]) => (
 <button
 key={category}
 onClick={() =>
 setCategoryFilter(
 categoryFilter === category ? null : category
 )
 }
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 categoryFilter === category
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 {category.replace(/_/g, ' ')} ({count})
 </button>
 ))}
 </div>
 )}

 {/* Timeline visualization */}
 {filteredEvents && filteredEvents.length > 0 ? (
 <div className="relative">
 {filteredEvents.map((event, idx) => (
 <TimelineEventCard
 key={`${event.date}-${idx}`}
 event={event}
 isLast={idx === filteredEvents.length - 1}
 />
 ))}
 </div>
 ) : (
 <EmptyState
 title="No events match the filter"
 description="Try selecting a different category or remove the filter."
 icon={Clock}
 />
 )}
 </div>
 )}

 {/* Empty state before extraction */}
 {!results && !isLoading && !error && (
 <div className="space-y-6">
 <EmptyState
 title="Extract document timelines"
 description="Enter document IDs to extract chronological events, dates, and temporal relationships from legal documents."
 icon={Clock}
 />

 {/* How it works */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 <h3 className="text-sm font-semibold text-foreground">
 How it works
 </h3>
 <div className="grid gap-3 sm:grid-cols-3">
 <div className="space-y-1">
 <div className="text-xs font-medium text-primary">1. Input</div>
 <p className="text-xs text-muted-foreground">
 Provide one or more document IDs to analyze
 </p>
 </div>
 <div className="space-y-1">
 <div className="text-xs font-medium text-primary">2. Extract</div>
 <p className="text-xs text-muted-foreground">
 AI identifies dates, events, and temporal relationships
 </p>
 </div>
 <div className="space-y-1">
 <div className="text-xs font-medium text-primary">3. Visualize</div>
 <p className="text-xs text-muted-foreground">
 View an interactive timeline of all extracted events
 </p>
 </div>
 </div>
 </div>
 </BaseCard>
 </div>
 )}
 </PageContainer>
 );
}
