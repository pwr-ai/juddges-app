'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, Search, Loader2, ChevronDown, ChevronUp, ExternalLink, Sparkles, Filter } from 'lucide-react';
import {
 PageContainer,
 BaseCard,
 Badge,
 AIDisclaimerBadge,
 LoadingIndicator,
 EmptyState,
 ErrorCard,
 Button,
} from '@/lib/styles/components';
import { findPrecedents, type FindPrecedentsResponse, type PrecedentMatch } from '@/lib/api';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';

function PrecedentResultCard({
 precedent,
 rank,
 onViewDocument,
}: {
 precedent: PrecedentMatch;
 rank: number;
 onViewDocument: (documentId: string) => void;
}) {
 const [isExpanded, setIsExpanded] = useState(false);

 const scorePercent = Math.round(
 ((precedent.relevance_score ?? precedent.similarity_score) * 100)
 );

 const scoreColor =
 scorePercent >= 80
 ? 'text-green-600'
 : scorePercent >= 60
 ? 'text-yellow-600'
 : 'text-muted-foreground';

 return (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 {/* Header row */}
 <div className="flex items-start justify-between gap-3">
 <div className="flex items-start gap-3 min-w-0 flex-1">
 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
 <span className="text-sm font-bold text-primary">#{rank}</span>
 </div>
 <div className="min-w-0 flex-1">
 <h3 className="font-semibold text-base leading-tight text-foreground truncate">
 {precedent.title || precedent.document_id}
 </h3>
 <div className="flex flex-wrap items-center gap-2 mt-1">
 {precedent.document_type && (
 <Badge variant="secondary"className="text-xs">
 {precedent.document_type.replace(/_/g, ' ')}
 </Badge>
 )}
 {precedent.date_issued && (
 <span className="text-xs text-muted-foreground">
 {precedent.date_issued}
 </span>
 )}
 {precedent.court_name && (
 <span className="text-xs text-muted-foreground">
 {precedent.court_name}
 </span>
 )}
 </div>
 </div>
 </div>

 {/* Score badge */}
 <div className="flex-shrink-0 text-right">
 <div className={`text-lg font-bold ${scoreColor}`}>
 {scorePercent}%
 </div>
 <div className="text-xs text-muted-foreground">relevance</div>
 </div>
 </div>

 {/* Matching factors */}
 {precedent.matching_factors.length > 0 && (
 <div className="flex flex-wrap gap-1.5">
 {precedent.matching_factors.map((factor, idx) => (
 <Badge key={idx} variant="outline"className="text-xs">
 {factor}
 </Badge>
 ))}
 </div>
 )}

 {/* Relevance explanation */}
 {precedent.relevance_explanation && (
 <p className="text-sm text-muted-foreground leading-relaxed">
 {precedent.relevance_explanation}
 </p>
 )}

 {/* Expandable details */}
 <div>
 <button
 onClick={() => setIsExpanded(!isExpanded)}
 className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
 >
 {isExpanded ? <ChevronUp className="h-3 w-3"/> : <ChevronDown className="h-3 w-3"/>}
 {isExpanded ? 'Hide details' : 'Show details'}
 </button>

 {isExpanded && (
 <div className="mt-3 space-y-2 pt-3 border-t border-border/50">
 {precedent.outcome && (
 <div>
 <span className="text-xs font-medium text-muted-foreground">Outcome: </span>
 <span className="text-sm text-foreground">{precedent.outcome}</span>
 </div>
 )}
 {precedent.legal_bases && precedent.legal_bases.length > 0 && (
 <div>
 <span className="text-xs font-medium text-muted-foreground">Legal bases: </span>
 <span className="text-sm text-foreground">{precedent.legal_bases.join(', ')}</span>
 </div>
 )}
 {precedent.summary && (
 <div>
 <span className="text-xs font-medium text-muted-foreground">Summary: </span>
 <p className="text-sm text-foreground mt-1">{precedent.summary}</p>
 </div>
 )}
 <div className="flex items-center gap-2 pt-2">
 <span className="text-xs text-muted-foreground">
 Similarity: {Math.round(precedent.similarity_score * 100)}%
 </span>
 {precedent.relevance_score !== null && (
 <span className="text-xs text-muted-foreground">
 AI Relevance: {Math.round(precedent.relevance_score * 100)}%
 </span>
 )}
 </div>
 </div>
 )}
 </div>

 {/* View document button */}
 <div className="flex justify-end">
 <button
 onClick={() => onViewDocument(precedent.document_id)}
 className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors"
 >
 <ExternalLink className="h-3.5 w-3.5"/>
 View document
 </button>
 </div>
 </div>
 </BaseCard>
 );
}

export default function PrecedentsPage() {
 const router = useRouter();
 const [query, setQuery] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [results, setResults] = useState<FindPrecedentsResponse | null>(null);
 const [showFilters, setShowFilters] = useState(false);

 // Filter state
 const [filterDocTypes, setFilterDocTypes] = useState<string[]>([]);
 const [filterLanguage, setFilterLanguage] = useState<string>('');
 const [resultLimit, setResultLimit] = useState(10);

 const handleSearch = useCallback(async () => {
 if (!query.trim() || query.trim().length < 10) {
 setError('Please enter a more detailed description (at least 10 characters).');
 return;
 }

 setIsLoading(true);
 setError(null);

 try {
 const filters: Record<string, unknown> = {};
 if (filterDocTypes.length > 0) {
 filters.document_types = filterDocTypes;
 }
 if (filterLanguage) {
 filters.language = filterLanguage;
 }

 const response = await findPrecedents({
 query: query.trim(),
 limit: resultLimit,
 include_analysis: true,
 filters: Object.keys(filters).length > 0 ? filters as never : undefined,
 });

 setResults(response);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
 } finally {
 setIsLoading(false);
 }
 }, [query, filterDocTypes, filterLanguage, resultLimit]);

 const handleKeyDown = useCallback(
 (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 handleSearch();
 }
 },
 [handleSearch]
 );

 const handleViewDocument = useCallback(
 (documentId: string) => {
 const cleanId = cleanDocumentIdForUrl(documentId);
 router.push(`/documents/${cleanId}?from=precedents`);
 },
 [router]
 );

 const toggleDocType = (type: string) => {
 setFilterDocTypes((prev) =>
 prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
 );
 };

 return (
 <PageContainer width="medium"fillViewport>
 {/* Header */}
 <div className="space-y-2">
 <div className="flex items-center gap-3">
 <div className="p-2 rounded-xl bg-primary/10">
 <Scale className="h-6 w-6 text-primary"/>
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">
 Precedent Finder
 </h1>
 <p className="text-sm text-muted-foreground">
 Find relevant precedent cases using AI-powered semantic search and legal reasoning
 </p>
 </div>
 </div>
 <AIDisclaimerBadge />
 </div>

 {/* Search Input */}
 <div className="space-y-3">
 <div className="relative">
 <textarea
 value={query}
 onChange={(e) => setQuery(e.target.value)}
 onKeyDown={handleKeyDown}
	 placeholder="Describe the fact pattern, legal issue, or question you want to find precedents for...&#10;&#10;Example: contractor failed to complete construction works on time and the investor seeks damages"
 className="w-full min-h-[120px] p-4 pr-12 rounded-[16px] bg-[rgba(255,255,255,0.9)] border border-border/50 text-foreground placeholder:text-muted-foreground text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
 />
 <button
 onClick={handleSearch}
 disabled={isLoading || !query.trim()}
 className="absolute right-3 bottom-3 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
 aria-label="Search for precedents"
 >
 {isLoading ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
 <Search className="h-4 w-4"/>
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
 {showFilters ? 'Hide filters' : 'Show filters'}
 </button>
 {(filterDocTypes.length > 0 || filterLanguage) && (
 <span className="text-xs text-primary">
 {filterDocTypes.length + (filterLanguage ? 1 : 0)} filter(s) active
 </span>
 )}
 </div>

 {/* Filters panel */}
 {showFilters && (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-4">
 {/* Document types */}
 <div>
 <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Document Type
 </label>
 <div className="flex flex-wrap gap-2 mt-2">
	 {['judgment'].map((type) => (
 <button
 key={type}
 onClick={() => toggleDocType(type)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 filterDocTypes.includes(type)
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 {type.replace(/_/g, ' ')}
 </button>
 ))}
 </div>
 </div>

 {/* Language */}
 <div>
 <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Language
 </label>
 <div className="flex flex-wrap gap-2 mt-2">
 {[
 { code: '', label: 'All' },
 { code: 'pl', label: 'Polish' },
 { code: 'en', label: 'English' },
 ].map((lang) => (
 <button
 key={lang.code}
 onClick={() => setFilterLanguage(lang.code)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 filterLanguage === lang.code
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 {lang.label}
 </button>
 ))}
 </div>
 </div>

 {/* Result limit */}
 <div>
 <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
 Results
 </label>
 <div className="flex flex-wrap gap-2 mt-2">
 {[5, 10, 20].map((limit) => (
 <button
 key={limit}
 onClick={() => setResultLimit(limit)}
 className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
 resultLimit === limit
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted/50 text-muted-foreground hover:bg-muted'
 }`}
 >
 {limit} results
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
 message="Searching for precedents..."
 subtitle="Analyzing legal documents with AI reasoning"
 />
 )}

 {/* Error state */}
 {error && !isLoading && (
 <ErrorCard title="Search Error"message={error} />
 )}

 {/* Results */}
 {results && !isLoading && (
 <div className="space-y-4">
 {/* Results header */}
 <div className="flex items-center justify-between">
 <div className="space-y-1">
 <h2 className="text-lg font-semibold text-foreground">
 {results.total_found} Precedent{results.total_found !== 1 ? 's' : ''} Found
 </h2>
 {results.enhanced_query && (
 <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
 <Sparkles className="h-3 w-3 text-primary"/>
 <span>Enhanced query: &ldquo;{results.enhanced_query}&rdquo;</span>
 </div>
 )}
 </div>
 <Badge variant="outline"className="text-xs">
 {results.search_strategy}
 </Badge>
 </div>

 {/* Results list */}
 {results.precedents.length > 0 ? (
 <div className="space-y-3">
 {results.precedents.map((precedent, idx) => (
 <PrecedentResultCard
 key={precedent.document_id}
 precedent={precedent}
 rank={idx + 1}
 onViewDocument={handleViewDocument}
 />
 ))}
 </div>
 ) : (
 <EmptyState
 title="No precedents found"
 description="Try broadening your search query or adjusting the filters."
 icon={Scale}
 />
 )}
 </div>
 )}

 {/* Empty state before search */}
 {!results && !isLoading && !error && (
 <div className="space-y-6">
	 <EmptyState
	 title="Find relevant precedents"
	 description="Describe a fact pattern, legal issue, or question to discover matching case law."
	 icon={Scale}
	 />

 {/* Example queries */}
 <div className="space-y-3">
 <h3 className="text-sm font-medium text-muted-foreground">Example queries</h3>
 <div className="grid gap-3 sm:grid-cols-2">
 {[
 'Odliczenie VAT od wydatków na samochód firmowy używany częściowo do celów prywatnych',
 'Tax treatment of cross-border services between EU member states',
 'Kary umowne jako koszt uzyskania przychodów w CIT',
 'Transfer pricing adjustments for related party transactions',
 ].map((example) => (
 <BaseCard
 key={example}
 description={example}
 onClick={() => {
 setQuery(example);
 }}
 variant="light"
 className="rounded-[16px]"
 />
 ))}
 </div>
 </div>
 </div>
 )}
 </PageContainer>
 );
}
