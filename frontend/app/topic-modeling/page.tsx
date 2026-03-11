'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
 TrendingUp,
 TrendingDown,
 Minus,
 Loader2,
 FileText,
 BarChart3,
 Layers,
 Clock,
 ChevronDown,
 ChevronUp,
 ArrowUpRight,
 Calendar,
} from 'lucide-react';
import {
 PageContainer,
 BaseCard,
 Badge,
 LoadingIndicator,
 EmptyState,
 ErrorCard,
 Button,
 Breadcrumb,
} from '@/lib/styles/components';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';
import type {
 TopicModelingResponse,
 Topic,
 TimePeriod,
} from '@/types/topic-modeling';

// Topic color palette
const TOPIC_COLORS = [
 '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
 '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6',
 '#e11d48', '#84cc16', '#a855f7', '#0ea5e9', '#d946ef',
 '#22c55e', '#eab308', '#64748b', '#fb923c', '#2dd4bf',
];

// ===== Trend Icon Helper =====

function TrendIcon({ trend, className }: { trend: string; className?: string }) {
 switch (trend) {
 case 'emerging':
 return <TrendingUp className={className || 'h-4 w-4 text-emerald-500'} />;
 case 'declining':
 return <TrendingDown className={className || 'h-4 w-4 text-red-500'} />;
 default:
 return <Minus className={className || 'h-4 w-4 text-muted-foreground'} />;
 }
}

function TrendBadge({ trend }: { trend: string }) {
 const variants: Record<string, { label: string; className: string }> = {
 emerging: { label: 'Emerging', className: 'bg-emerald-100 text-emerald-700' },
 declining: { label: 'Declining', className: 'bg-red-100 text-red-700' },
 stable: { label: 'Stable', className: 'bg-gray-100 text-gray-700' },
 };
 const v = variants[trend] || variants.stable;
 return (
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${v.className}`}>
 <TrendIcon trend={trend} className="h-3 w-3"/>
 {v.label}
 </span>
 );
}

// ===== Simple Sparkline =====

function Sparkline({
 data,
 color,
 width = 120,
 height = 32,
}: {
 data: number[];
 color: string;
 width?: number;
 height?: number;
}) {
 if (data.length < 2) return null;

 const max = Math.max(...data) || 1;
 const min = Math.min(...data);
 const range = max - min || 1;

 const points = data
 .map((v, i) => {
 const x = (i / (data.length - 1)) * width;
 const y = height - ((v - min) / range) * (height - 4) - 2;
 return `${x},${y}`;
 })
 .join(' ');

 return (
 <svg width={width} height={height} className="inline-block">
 <polyline
 points={points}
 fill="none"
 stroke={color}
 strokeWidth="2"
 strokeLinecap="round"
 strokeLinejoin="round"
 />
 </svg>
 );
}

// ===== Stats Card =====

function StatsCard({
 label,
 value,
 icon: Icon,
}: {
 label: string;
 value: string | number;
 icon: React.ElementType;
}) {
 return (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="flex items-center gap-3">
 <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
 <Icon className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <div className="text-2xl font-bold text-foreground">{value}</div>
 <div className="text-sm text-muted-foreground">{label}</div>
 </div>
 </div>
 </BaseCard>
 );
}

// ===== Time Series Bar Chart =====

function TimeSeriesChart({
 timeSeries,
 color,
}: {
 timeSeries: TimePeriod[];
 color: string;
}) {
 if (timeSeries.length === 0) return null;

 const maxWeight = Math.max(...timeSeries.map((p) => p.topic_weight)) || 1;

 return (
 <div className="flex items-end gap-1 h-16">
 {timeSeries.map((period, idx) => {
 const heightPercent = (period.topic_weight / maxWeight) * 100;
 return (
 <div
 key={idx}
 className="flex-1 flex flex-col items-center gap-1"
 title={`${period.period_label}: ${period.document_count} docs, weight: ${period.topic_weight.toFixed(3)}`}
 >
 <div
 className="w-full rounded-t-sm transition-all duration-300"
 style={{
 height: `${Math.max(heightPercent, 4)}%`,
 backgroundColor: color,
 opacity: 0.7 + (heightPercent / 100) * 0.3,
 }}
 />
 <span className="text-[9px] text-muted-foreground truncate w-full text-center">
 {period.period_label.length > 6
 ? period.period_label.slice(-4)
 : period.period_label}
 </span>
 </div>
 );
 })}
 </div>
 );
}

// ===== Topic Card =====

function TopicCard({
 topic,
 color,
 isExpanded,
 onToggle,
 onViewDocument,
}: {
 topic: Topic;
 color: string;
 isExpanded: boolean;
 onToggle: () => void;
 onViewDocument: (documentId: string) => void;
}) {
 return (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 {/* Header */}
 <div
 className="flex items-center justify-between cursor-pointer"
 onClick={onToggle}
 >
 <div className="flex items-center gap-3">
 <div
 className="w-4 h-4 rounded-full flex-shrink-0"
 style={{ backgroundColor: color }}
 />
 <div>
 <div className="font-semibold text-foreground">
 {topic.label}
 </div>
 <div className="text-xs text-muted-foreground">
 {topic.document_count} documents · {Math.round(topic.coherence_score * 100)}% coherence
 </div>
 </div>
 </div>
 <div className="flex items-center gap-3">
 <Sparkline
 data={topic.time_series.map((p) => p.topic_weight)}
 color={color}
 />
 <TrendBadge trend={topic.trend} />
 {isExpanded ? (
 <ChevronUp className="h-4 w-4 text-muted-foreground"/>
 ) : (
 <ChevronDown className="h-4 w-4 text-muted-foreground"/>
 )}
 </div>
 </div>

 {/* Keywords */}
 <div className="flex flex-wrap gap-1">
 {topic.keywords.slice(0, isExpanded ? undefined : 5).map((kw) => (
 <Badge key={kw.word} variant="secondary"className="text-xs">
 {kw.word}
 <span className="ml-1 text-muted-foreground opacity-60">
 {(kw.weight * 100).toFixed(0)}
 </span>
 </Badge>
 ))}
 </div>

 {/* Expanded: Time series + Documents */}
 {isExpanded && (
 <div className="space-y-4 pt-2 border-t border-border">
 {/* Time Series */}
 {topic.time_series.length > 0 && (
 <div>
 <h4 className="text-sm font-medium text-foreground mb-2">
 Trend Over Time
 </h4>
 <TimeSeriesChart timeSeries={topic.time_series} color={color} />
 </div>
 )}

 {/* Top Documents */}
 {topic.top_documents.length > 0 && (
 <div>
 <h4 className="text-sm font-medium text-foreground mb-2">
 Top Documents
 </h4>
 <div className="space-y-1 max-h-[250px] overflow-y-auto">
 {topic.top_documents.map((doc) => (
 <div
 key={doc.document_id}
 className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
 onClick={() => onViewDocument(doc.document_id)}
 >
 <div className="flex items-start gap-2 min-w-0">
 <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0"/>
 <div className="min-w-0">
 <div className="text-sm font-medium text-foreground truncate">
 {doc.title || doc.document_id}
 </div>
 <div className="text-xs text-muted-foreground">
 {doc.document_type}
 {doc.date_issued && ` · ${doc.date_issued}`}
 </div>
 </div>
 </div>
 <div className="flex items-center gap-2 flex-shrink-0 ml-2">
 <span className="text-xs font-mono text-muted-foreground">
 {Math.round(doc.relevance * 100)}%
 </span>
 <ArrowUpRight className="h-3 w-3 text-muted-foreground"/>
 </div>
 </div>
 ))}
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 </BaseCard>
 );
}

// ===== Main Page =====

export default function TopicModelingPage() {
 const router = useRouter();
 const [result, setResult] = useState<TopicModelingResponse | null>(null);
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [sampleSize, setSampleSize] = useState(200);
 const [numTopics, setNumTopics] = useState(8);
 const [timePeriods, setTimePeriods] = useState(6);
 const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
 const [filterTrend, setFilterTrend] = useState<string | null>(null);

 const handleAnalyze = useCallback(async () => {
 setIsLoading(true);
 setError(null);
 setResult(null);
 setExpandedTopics(new Set());
 setFilterTrend(null);

 try {
 const response = await fetch('/api/topic-modeling', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 sample_size: sampleSize,
 num_topics: numTopics,
 time_periods: timePeriods,
 }),
 });

 if (!response.ok) {
 const data = await response.json().catch(() => ({}));
 throw new Error(
 data.error || `Topic analysis failed with status ${response.status}`
 );
 }

 const data = await response.json();
 setResult(data);
 } catch (e) {
 setError(
 e instanceof Error ? e.message : 'Failed to analyze topics'
 );
 } finally {
 setIsLoading(false);
 }
 }, [sampleSize, numTopics, timePeriods]);

 const handleViewDocument = useCallback(
 (documentId: string) => {
 router.push(`/documents/${cleanDocumentIdForUrl(documentId)}`);
 },
 [router]
 );

 const toggleTopic = useCallback((topicId: number) => {
 setExpandedTopics((prev) => {
 const next = new Set(prev);
 if (next.has(topicId)) {
 next.delete(topicId);
 } else {
 next.add(topicId);
 }
 return next;
 });
 }, []);

 // Filter topics by trend
 const filteredTopics = useMemo(() => {
 if (!result) return [];
 if (!filterTrend) return result.topics;
 return result.topics.filter((t) => t.trend === filterTrend);
 }, [result, filterTrend]);

 // Trend summary counts
 const trendCounts = useMemo(() => {
 if (!result) return { emerging: 0, stable: 0, declining: 0 };
 return {
 emerging: result.topics.filter((t) => t.trend === 'emerging').length,
 stable: result.topics.filter((t) => t.trend === 'stable').length,
 declining: result.topics.filter((t) => t.trend === 'declining').length,
 };
 }, [result]);

 return (
 <PageContainer width="wide">
 <div className="space-y-6">
 <Breadcrumb
 items={[
 { label: 'Analysis', href: '/document-vis' },
 { label: 'Topic Modeling' },
 ]}
 className="mb-2"
 />

 {/* Header */}
 <div className="space-y-2">
 <div className="flex items-center gap-3">
 <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
 <TrendingUp className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">
 Topic Modeling & Trends
 </h1>
 <p className="text-sm text-muted-foreground">
 Identify emerging legal topics and trends across the document
 corpus over time. Discover evolving themes using NMF-based topic
 extraction with temporal analysis.
 </p>
 </div>
 </div>
 </div>

 {/* Configuration */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-4">
 <h2 className="text-lg font-semibold text-foreground">
 Analysis Configuration
 </h2>

 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Number of Topics
 </label>
 <div className="flex items-center gap-3">
 <input
 type="range"
 min="2"
 max="20"
 step="1"
 value={numTopics}
 onChange={(e) => setNumTopics(parseInt(e.target.value))}
 className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
 />
 <span className="text-sm font-mono font-medium text-foreground w-8 text-right">
 {numTopics}
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-1">
 More topics yield finer-grained themes.
 </p>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Documents to Analyze
 </label>
 <select
 value={sampleSize}
 onChange={(e) => setSampleSize(parseInt(e.target.value))}
 className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
 >
 <option value="50">50 documents</option>
 <option value="100">100 documents</option>
 <option value="200">200 documents</option>
 <option value="300">300 documents</option>
 <option value="500">500 documents</option>
 </select>
 <p className="text-xs text-muted-foreground mt-1">
 Larger samples improve accuracy but take longer.
 </p>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Time Periods
 </label>
 <div className="flex items-center gap-3">
 <input
 type="range"
 min="2"
 max="12"
 step="1"
 value={timePeriods}
 onChange={(e) => setTimePeriods(parseInt(e.target.value))}
 className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
 />
 <span className="text-sm font-mono font-medium text-foreground w-8 text-right">
 {timePeriods}
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-1">
 Number of periods to split the date range into.
 </p>
 </div>
 </div>

 <Button
 onClick={handleAnalyze}
 disabled={isLoading}
 className="w-full md:w-auto"
 >
 {isLoading ? (
 <>
 <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
 Analyzing Topics...
 </>
 ) : (
 <>
 <TrendingUp className="h-4 w-4 mr-2"/>
 Discover Topics & Trends
 </>
 )}
 </Button>
 </div>
 </BaseCard>

 {/* Error */}
 {error && <ErrorCard title="Analysis Error"message={error} />}

 {/* Loading */}
 {isLoading && (
 <div className="flex justify-center py-8">
 <LoadingIndicator
 size="lg"
 message="Extracting topics and analyzing temporal trends..."
 variant="centered"
 />
 </div>
 )}

 {/* Results */}
 {result && !isLoading && (
 <div className="space-y-6">
 {/* Statistics */}
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <StatsCard
 label="Documents Analyzed"
 value={result.statistics.total_documents}
 icon={FileText}
 />
 <StatsCard
 label="Topics Discovered"
 value={result.statistics.num_topics}
 icon={Layers}
 />
 <StatsCard
 label="Avg Coherence"
 value={`${Math.round(result.statistics.avg_topic_coherence * 100)}%`}
 icon={BarChart3}
 />
 <StatsCard
 label="Processing Time"
 value={`${Math.round(result.statistics.processing_time_ms)}ms`}
 icon={Clock}
 />
 </div>

 {/* Date Range Info */}
 {result.statistics.date_range_start && (
 <div className="flex items-center gap-2 text-sm text-muted-foreground">
 <Calendar className="h-4 w-4"/>
 <span>
 Date range: {result.statistics.date_range_start} to{' '}
 {result.statistics.date_range_end} ({result.statistics.documents_with_dates} dated documents across{' '}
 {result.statistics.num_time_periods} periods)
 </span>
 </div>
 )}

 {/* Trend Summary */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 <h2 className="text-lg font-semibold text-foreground">
 Trend Overview
 </h2>
 <div className="flex flex-wrap gap-3">
 <button
 onClick={() => setFilterTrend(filterTrend === null ? null : null)}
 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
 filterTrend === null
 ? 'bg-primary text-primary-foreground'
 : 'bg-muted text-muted-foreground hover:bg-muted/80'
 }`}
 >
 All ({result.topics.length})
 </button>
 <button
 onClick={() => setFilterTrend(filterTrend === 'emerging' ? null : 'emerging')}
 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
 filterTrend === 'emerging'
 ? 'bg-emerald-600 text-white'
 : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
 }`}
 >
 <TrendingUp className="h-3.5 w-3.5"/>
 Emerging ({trendCounts.emerging})
 </button>
 <button
 onClick={() => setFilterTrend(filterTrend === 'stable' ? null : 'stable')}
 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
 filterTrend === 'stable'
 ? 'bg-gray-600 text-white'
 : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
 }`}
 >
 <Minus className="h-3.5 w-3.5"/>
 Stable ({trendCounts.stable})
 </button>
 <button
 onClick={() => setFilterTrend(filterTrend === 'declining' ? null : 'declining')}
 className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
 filterTrend === 'declining'
 ? 'bg-red-600 text-white'
 : 'bg-red-100 text-red-700 hover:bg-red-200'
 }`}
 >
 <TrendingDown className="h-3.5 w-3.5"/>
 Declining ({trendCounts.declining})
 </button>
 </div>
 </div>
 </BaseCard>

 {/* Topic List */}
 <div className="space-y-3">
 <h2 className="text-lg font-semibold text-foreground">
 Discovered Topics
 </h2>
 {filteredTopics.length === 0 && (
 <p className="text-sm text-muted-foreground py-4">
 No topics match the selected filter.
 </p>
 )}
 {filteredTopics.map((topic) => (
 <TopicCard
 key={topic.topic_id}
 topic={topic}
 color={TOPIC_COLORS[topic.topic_id % TOPIC_COLORS.length]}
 isExpanded={expandedTopics.has(topic.topic_id)}
 onToggle={() => toggleTopic(topic.topic_id)}
 onViewDocument={handleViewDocument}
 />
 ))}
 </div>
 </div>
 )}

 {/* Initial empty state */}
 {!result && !isLoading && !error && (
 <EmptyState
 icon={TrendingUp}
 title="Ready to Analyze"
 description="Configure the parameters above and click 'Discover Topics & Trends' to identify emerging legal topics across your document corpus. The analysis uses NMF topic modeling with temporal trend detection."
 />
 )}
 </div>
 </PageContainer>
 );
}
