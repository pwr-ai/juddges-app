'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Search, Loader2, AlertTriangle, CheckCircle2, FileText, BarChart3, SearchX } from 'lucide-react';
import {
 PageContainer,
 BaseCard,
 Badge,
 LoadingIndicator,
 EmptyState,
 ErrorCard,
 Button,
} from '@/lib/styles/components';
import { cleanDocumentIdForUrl } from '@/lib/document-utils';

// ===== Types =====

interface DuplicatePair {
 document_id_a: string;
 document_id_b: string;
 title_a: string | null;
 title_b: string | null;
 document_type_a: string | null;
 document_type_b: string | null;
 date_issued_a: string | null;
 date_issued_b: string | null;
 similarity_score: number;
 duplicate_type: string;
 content_hash_a: string | null;
 content_hash_b: string | null;
}

interface ScanResponse {
 exact_duplicates: DuplicatePair[];
 near_duplicates: DuplicatePair[];
 total_documents_scanned: number;
 total_exact_duplicates: number;
 total_near_duplicates: number;
 scan_time_ms: number;
}

interface DeduplicationStats {
 total_documents: number;
 documents_with_hash: number;
 documents_without_hash: number;
 flagged_duplicates: number;
 duplicate_groups: number;
 scan_coverage_pct: number;
}

// ===== Components =====

function StatsCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
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

function DuplicatePairCard({
 pair,
 onViewDocument,
}: {
 pair: DuplicatePair;
 onViewDocument: (documentId: string) => void;
}) {
 const scorePercent = Math.round(pair.similarity_score * 100);
 const isExact = pair.duplicate_type === 'exact';

 const scoreColor =
 scorePercent >= 99
 ? 'text-red-600'
 : scorePercent >= 95
 ? 'text-orange-600'
 : 'text-yellow-600';

 return (
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-3">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Badge variant={isExact ? 'destructive' : 'secondary'} className="text-xs">
 {isExact ? 'Exact Match' : 'Near Duplicate'}
 </Badge>
 {pair.document_type_a && (
 <Badge variant="outline"className="text-xs">
 {pair.document_type_a.replace(/_/g, ' ')}
 </Badge>
 )}
 </div>
 <div className={`text-lg font-bold ${scoreColor}`}>
 {scorePercent}%
 </div>
 </div>

 {/* Document A */}
 <div
 className="p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
 onClick={() => onViewDocument(pair.document_id_a)}
 >
 <div className="flex items-start gap-2">
 <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0"/>
 <div className="min-w-0">
 <div className="font-medium text-sm text-foreground truncate">
 {pair.title_a || pair.document_id_a}
 </div>
 <div className="text-xs text-muted-foreground mt-0.5">
 {pair.document_id_a}
 {pair.date_issued_a && ` · ${pair.date_issued_a}`}
 </div>
 </div>
 </div>
 </div>

 {/* VS separator */}
 <div className="flex items-center gap-2 px-4">
 <div className="flex-1 border-t border-dashed border-border"/>
 <span className="text-xs text-muted-foreground font-medium">vs</span>
 <div className="flex-1 border-t border-dashed border-border"/>
 </div>

 {/* Document B */}
 <div
 className="p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
 onClick={() => onViewDocument(pair.document_id_b)}
 >
 <div className="flex items-start gap-2">
 <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0"/>
 <div className="min-w-0">
 <div className="font-medium text-sm text-foreground truncate">
 {pair.title_b || pair.document_id_b}
 </div>
 <div className="text-xs text-muted-foreground mt-0.5">
 {pair.document_id_b}
 {pair.date_issued_b && ` · ${pair.date_issued_b}`}
 </div>
 </div>
 </div>
 </div>
 </div>
 </BaseCard>
 );
}

// ===== Main Page =====

export default function DeduplicationPage() {
 const router = useRouter();
 const [stats, setStats] = useState<DeduplicationStats | null>(null);
 const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
 const [isLoadingStats, setIsLoadingStats] = useState(true);
 const [isScanning, setIsScanning] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [threshold, setThreshold] = useState(0.95);
 const [maxDocuments, setMaxDocuments] = useState(100);

 // Fetch stats on mount
 useEffect(() => {
 async function fetchStats() {
 try {
 const response = await fetch('/api/deduplication/stats');
 if (response.ok) {
 const data = await response.json();
 setStats(data);
 }
 } catch (e) {
 // Stats endpoint may not be available yet
 } finally {
 setIsLoadingStats(false);
 }
 }
 fetchStats();
 }, []);

 const handleScan = useCallback(async () => {
 setIsScanning(true);
 setError(null);
 setScanResult(null);

 try {
 const response = await fetch('/api/deduplication/scan', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 similarity_threshold: threshold,
 max_documents: maxDocuments,
 include_exact: true,
 include_near_duplicates: true,
 }),
 });

 if (!response.ok) {
 const data = await response.json().catch(() => ({}));
 throw new Error(data.error || `Scan failed with status ${response.status}`);
 }

 const data = await response.json();
 setScanResult(data);
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Failed to scan for duplicates');
 } finally {
 setIsScanning(false);
 }
 }, [threshold, maxDocuments]);

 const handleViewDocument = useCallback(
 (documentId: string) => {
 router.push(`/documents/${cleanDocumentIdForUrl(documentId)}`);
 },
 [router]
 );

 return (
 <PageContainer width="wide">
 <div className="space-y-6">
 {/* Header */}
 <div className="space-y-2">
 <div className="flex items-center gap-3">
 <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
 <Copy className="h-5 w-5 text-primary"/>
 </div>
 <div>
 <h1 className="text-2xl font-bold text-foreground">
 Document Deduplication
 </h1>
 <p className="text-sm text-muted-foreground">
 Detect and flag duplicate or near-duplicate documents using content hashing and semantic similarity
 </p>
 </div>
 </div>
 </div>

 {/* Stats Cards */}
 {!isLoadingStats && stats && (
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <StatsCard label="Total Documents"value={stats.total_documents} icon={FileText} />
 <StatsCard label="With Hash"value={stats.documents_with_hash} icon={CheckCircle2} />
 <StatsCard label="Flagged Duplicates"value={stats.flagged_duplicates} icon={AlertTriangle} />
 <StatsCard label="Scan Coverage"value={`${stats.scan_coverage_pct}%`} icon={BarChart3} />
 </div>
 )}

 {/* Scan Configuration */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="space-y-4">
 <h2 className="text-lg font-semibold text-foreground">Scan Configuration</h2>

 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Similarity Threshold
 </label>
 <div className="flex items-center gap-3">
 <input
 type="range"
 min="0.5"
 max="1.0"
 step="0.01"
 value={threshold}
 onChange={(e) => setThreshold(parseFloat(e.target.value))}
 className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
 />
 <span className="text-sm font-mono font-medium text-foreground w-14 text-right">
 {Math.round(threshold * 100)}%
 </span>
 </div>
 <p className="text-xs text-muted-foreground mt-1">
 Higher values find only very similar documents. Lower values find more potential duplicates.
 </p>
 </div>

 <div>
 <label className="block text-sm font-medium text-foreground mb-1">
 Max Documents to Scan
 </label>
 <select
 value={maxDocuments}
 onChange={(e) => setMaxDocuments(parseInt(e.target.value))}
 className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
 >
 <option value="50">50 documents</option>
 <option value="100">100 documents</option>
 <option value="200">200 documents</option>
 <option value="500">500 documents</option>
 </select>
 <p className="text-xs text-muted-foreground mt-1">
 More documents increase scan time but improve coverage.
 </p>
 </div>
 </div>

 <Button
 onClick={handleScan}
 disabled={isScanning}
 className="w-full md:w-auto"
 >
 {isScanning ? (
 <>
 <Loader2 className="h-4 w-4 mr-2 animate-spin"/>
 Scanning...
 </>
 ) : (
 <>
 <Search className="h-4 w-4 mr-2"/>
 Scan for Duplicates
 </>
 )}
 </Button>
 </div>
 </BaseCard>

 {/* Error */}
 {error && <ErrorCard title="Scan Error"message={error} />}

 {/* Scanning indicator */}
 {isScanning && (
 <div className="flex justify-center py-8">
 <LoadingIndicator size="lg"message="Scanning documents for duplicates..."variant="centered"/>
 </div>
 )}

 {/* Results */}
 {scanResult && !isScanning && (
 <div className="space-y-6">
 {/* Results Summary */}
 <BaseCard clickable={false} variant="light"className="rounded-[16px]">
 <div className="flex items-center justify-between flex-wrap gap-4">
 <div>
 <h2 className="text-lg font-semibold text-foreground">Scan Results</h2>
 <p className="text-sm text-muted-foreground">
 Scanned {scanResult.total_documents_scanned} documents in {scanResult.scan_time_ms.toFixed(0)}ms
 </p>
 </div>
 <div className="flex items-center gap-4">
 <div className="text-center">
 <div className="text-2xl font-bold text-red-600">
 {scanResult.total_exact_duplicates}
 </div>
 <div className="text-xs text-muted-foreground">Exact</div>
 </div>
 <div className="text-center">
 <div className="text-2xl font-bold text-orange-600">
 {scanResult.total_near_duplicates}
 </div>
 <div className="text-xs text-muted-foreground">Near</div>
 </div>
 </div>
 </div>
 </BaseCard>

 {/* Exact Duplicates */}
 {scanResult.exact_duplicates.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
 <AlertTriangle className="h-4 w-4 text-red-500"/>
 Exact Duplicates ({scanResult.exact_duplicates.length})
 </h3>
 <div className="space-y-3">
 {scanResult.exact_duplicates.map((pair, i) => (
 <DuplicatePairCard
 key={`exact-${i}`}
 pair={pair}
 onViewDocument={handleViewDocument}
 />
 ))}
 </div>
 </div>
 )}

 {/* Near Duplicates */}
 {scanResult.near_duplicates.length > 0 && (
 <div className="space-y-3">
 <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
 <Copy className="h-4 w-4 text-orange-500"/>
 Near Duplicates ({scanResult.near_duplicates.length})
 </h3>
 <div className="space-y-3">
 {scanResult.near_duplicates.map((pair, i) => (
 <DuplicatePairCard
 key={`near-${i}`}
 pair={pair}
 onViewDocument={handleViewDocument}
 />
 ))}
 </div>
 </div>
 )}

 {/* No duplicates found */}
 {scanResult.exact_duplicates.length === 0 && scanResult.near_duplicates.length === 0 && (
 <EmptyState
 icon={CheckCircle2}
 title="No Duplicates Found"
 description={`Scanned ${scanResult.total_documents_scanned} documents and found no duplicates at ${Math.round(threshold * 100)}% similarity threshold.`}
 />
 )}
 </div>
 )}

 {/* Initial empty state */}
 {!scanResult && !isScanning && !error && (
 <EmptyState
 icon={Search}
 title="Ready to Scan"
 description="Configure the scan parameters above and click 'Scan for Duplicates' to detect duplicate or near-duplicate documents in your database."
 />
 )}
 </div>
 </PageContainer>
 );
}
