"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
 Lightbulb,
 ExternalLink,
 RefreshCw,
 Loader2,
 Search,
} from "lucide-react";
import {
 PageContainer,
 BaseCard,
 Badge,
 LoadingIndicator,
 EmptyState,
 ErrorCard,
 Button,
} from "@/lib/styles/components";
import { getRecommendations, trackDocumentInteraction } from "@/lib/api";
import { cleanDocumentIdForUrl } from "@/lib/document-utils";
import type {
 RecommendationItem,
 RecommendationsResponse,
} from "@/types/recommendations";

function RecommendationCard({
 item,
 onViewDocument,
}: {
 item: RecommendationItem;
 onViewDocument: (documentId: string) => void;
}) {
 const scorePercent = Math.round(item.score * 100);

 const scoreColor =
 scorePercent >= 80
 ? "text-green-600"
 : scorePercent >= 60
 ? "text-yellow-600"
 : "text-muted-foreground";

 return (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 {/* Header row */}
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0 flex-1">
 <h3 className="font-semibold text-base leading-tight text-foreground truncate">
 {item.title || item.document_id}
 </h3>
 <div className="flex flex-wrap items-center gap-2 mt-1">
 {item.document_type && (
 <Badge variant="secondary"className="text-xs">
 {item.document_type.replace(/_/g,"")}
 </Badge>
 )}
 {item.date_issued && (
 <span className="text-xs text-muted-foreground">
 {new Date(item.date_issued).toLocaleDateString()}
 </span>
 )}
 {item.court_name && (
 <span className="text-xs text-muted-foreground">
 {item.court_name}
 </span>
 )}
 {item.document_number && (
 <span className="text-xs text-muted-foreground font-mono">
 {item.document_number}
 </span>
 )}
 </div>
 </div>
 <div className="flex-shrink-0 text-right">
 <div className={`text-lg font-bold ${scoreColor}`}>
 {scorePercent}%
 </div>
 <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
 match
 </div>
 </div>
 </div>

 {/* Reason */}
 <div className="flex items-center gap-2">
 <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0"/>
 <span className="text-sm text-muted-foreground italic">
 {item.reason}
 </span>
 </div>

 {/* Summary */}
 {item.summary && (
 <p className="text-sm text-muted-foreground line-clamp-2">
 {item.summary}
 </p>
 )}

 {/* Action */}
 <div className="flex justify-end">
 <button
 onClick={() => onViewDocument(item.document_id)}
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

interface SmartRecommendationsProps {
 query?: string;
 documentId?: string;
 strategy?: "auto"|"content_based"|"history_based"|"hybrid";
 limit?: number;
 showSearch?: boolean;
}

export default function SmartRecommendations({
 query: initialQuery,
 documentId,
 strategy ="auto",
 limit = 10,
 showSearch = true,
}: SmartRecommendationsProps) {
 const router = useRouter();
 const [searchQuery, setSearchQuery] = useState(initialQuery || "");
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [data, setData] = useState<RecommendationsResponse | null>(null);

 const fetchRecommendations = useCallback(
 async (q?: string) => {
 setIsLoading(true);
 setError(null);

 try {
 const result = await getRecommendations({
 query: q || searchQuery || undefined,
 document_id: documentId,
 limit,
 strategy,
 });
 setData(result);
 } catch (err) {
 setError(
 err instanceof Error
 ? err.message
 : "Failed to load recommendations."
 );
 } finally {
 setIsLoading(false);
 }
 },
 [searchQuery, documentId, limit, strategy]
 );

 // Auto-fetch on mount if we have context
 useEffect(() => {
 if (documentId || initialQuery) {
 fetchRecommendations(initialQuery);
 }
 }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

 const handleViewDocument = useCallback(
 (docId: string) => {
 // Track the interaction
 trackDocumentInteraction({
 document_id: docId,
 interaction_type: "search_click",
 context: { source: "recommendations"},
 });

 const cleanId = cleanDocumentIdForUrl(docId);
 router.push(`/documents/${cleanId}?from=recommendations`);
 },
 [router]
 );

 const handleSearch = useCallback(() => {
 if (searchQuery.trim()) {
 fetchRecommendations(searchQuery.trim());
 }
 }, [searchQuery, fetchRecommendations]);

 const handleKeyDown = useCallback(
 (e: React.KeyboardEvent) => {
 if (e.key === "Enter") {
 e.preventDefault();
 handleSearch();
 }
 },
 [handleSearch]
 );

 return (
 <div className="space-y-6">
 {/* Search input */}
 {showSearch && (
 <div className="flex gap-2">
 <div className="relative flex-1">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
 <input
 type="text"
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 onKeyDown={handleKeyDown}
 placeholder="Describe what you're researching to get personalized recommendations..."
 className="w-full h-10 pl-10 pr-4 rounded-[12px] bg-[rgba(255,255,255,0.9)] border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
 />
 </div>
 <Button
 onClick={handleSearch}
 disabled={isLoading || !searchQuery.trim()}
 className="rounded-[12px]"
 >
 {isLoading ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
"Get Recommendations"
 )}
 </Button>
 </div>
 )}

 {/* Loading */}
 {isLoading && (
 <LoadingIndicator
 variant="centered"
 message="Finding recommendations..."
 />
 )}

 {/* Error */}
 {error && !isLoading && (
 <ErrorCard
 title="Recommendation Error"
 message={error}
 onRetry={() => fetchRecommendations()}
 />
 )}

 {/* Results */}
 {data && !isLoading && (
 <div className="space-y-4">
 {/* Strategy info */}
 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 {data.total_found} recommendation
 {data.total_found !== 1 ? "s": ""} found
 {data.strategy !=="content_based"&& (
 <span className="ml-1">
 (using{""}
 {data.strategy === "hybrid"
 ? "hybrid"
 : data.strategy === "history_based"
 ? "history-based"
 : "content-based"}{""}
 approach)
 </span>
 )}
 </p>
 <button
 onClick={() => fetchRecommendations()}
 className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
 >
 <RefreshCw className="h-3 w-3"/>
 Refresh
 </button>
 </div>

 {/* Recommendation cards */}
 {data.recommendations.length > 0 ? (
 <div className="space-y-3">
 {data.recommendations.map((item) => (
 <RecommendationCard
 key={item.document_id}
 item={item}
 onViewDocument={handleViewDocument}
 />
 ))}
 </div>
 ) : (
 <EmptyState
 icon={Lightbulb}
 title="No recommendations yet"
 description="Try searching for a legal topic or viewing some documents to get personalized recommendations."
 />
 )}
 </div>
 )}

 {/* Initial state */}
 {!data && !isLoading && !error && (
 <EmptyState
 icon={Lightbulb}
 title="Smart Recommendations"
 description="Search for a legal topic or browse documents to receive AI-powered recommendations based on your research context and history."
 />
 )}
 </div>
 );
}
