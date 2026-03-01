'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Eye,
  Edit3,
  Save,
  ChevronDown,
  ChevronUp,
  ScanLine,
} from 'lucide-react';
import {
  LoadingIndicator,
  BaseCard,
  Button,
  Badge,
  PageContainer,
  ErrorCard,
} from '@/lib/styles/components';
import {
  submitOCRFile,
  submitOCRText,
  getOCRJobStatus,
  listOCRJobs,
  submitOCRCorrection,
  type OCRJobStatus,
  type OCRJobResponse,
  type OCRQualityMetrics,
  type OCRPageResult,
} from '@/lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a Tailwind color class tuple [bar, text] based on confidence score. */
function confidenceColor(score: number): { bar: string; text: string } {
  if (score >= 0.85) return { bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400' };
  if (score >= 0.6) return { bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' };
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' };
}

/** Return a human-friendly quality badge variant. */
function qualityBadgeClasses(level: string): string {
  switch (level) {
    case 'high':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
    case 'medium':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'low':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
}

/** Format a date string for display. */
function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/** Status badge styling keyed by OCR status string. */
function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800';
    case 'processing':
    case 'pending':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
}

// ---------------------------------------------------------------------------
// Accepted file extensions for drag-and-drop / file input
// ---------------------------------------------------------------------------
const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,.tiff,.tif';
const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OCRProcessingPage(): React.JSX.Element {
  // ---- Upload state ----
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState('');
  const [sourceType, setSourceType] = useState<'pdf' | 'image'>('pdf');
  const [languageHint, setLanguageHint] = useState<string>('pl');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Submission / polling state ----
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<OCRJobStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // ---- Quality dashboard expandable sections ----
  const [isPagesExpanded, setIsPagesExpanded] = useState(false);

  // ---- Correction state ----
  const [correctedText, setCorrectedText] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // ---- Job history state ----
  const [jobHistory, setJobHistory] = useState<OCRJobStatus[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ---- Selected history job (for viewing details) ----
  const [selectedHistoryJob, setSelectedHistoryJob] = useState<OCRJobStatus | null>(null);

  // =========================================================================
  // File handling
  // =========================================================================

  const handleFileChange = useCallback((selectedFile: File | null) => {
    if (!selectedFile) return;

    // Validate mime type
    if (!ACCEPTED_MIME_TYPES.includes(selectedFile.type)) {
      setSubmitError('Unsupported file type. Please upload a PDF or image file (PNG, JPG, TIFF).');
      return;
    }

    setFile(selectedFile);
    setSubmitError(null);

    // Auto-detect source type from file
    if (selectedFile.type === 'application/pdf') {
      setSourceType('pdf');
    } else {
      setSourceType('image');
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFile = e.dataTransfer.files?.[0] ?? null;
      handleFileChange(droppedFile);
    },
    [handleFileChange],
  );

  // =========================================================================
  // Submit OCR job
  // =========================================================================

  const handleSubmit = useCallback(async () => {
    if (!file || !documentId.trim()) {
      setSubmitError('Please provide both a file and a document ID.');
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setJobStatus(null);
      setCorrectionSaved(false);
      setCorrectedText('');
      setCorrectionNotes('');

      const response: OCRJobResponse = await submitOCRFile(
        file,
        documentId.trim(),
        sourceType,
        languageHint,
      );

      setActiveJobId(response.job_id);
    } catch (err) {
      console.error('OCR submission error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit OCR job.');
    } finally {
      setIsSubmitting(false);
    }
  }, [file, documentId, sourceType, languageHint]);

  // =========================================================================
  // Demo submission (text-only, no file)
  // =========================================================================

  const handleTryDemo = useCallback(async () => {
    const demoDocId = documentId.trim() || `demo-doc-${Date.now()}`;

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      setJobStatus(null);
      setCorrectionSaved(false);
      setCorrectedText('');
      setCorrectionNotes('');

      if (!documentId.trim()) {
        setDocumentId(demoDocId);
      }

      const response: OCRJobResponse = await submitOCRText(
        demoDocId,
        sourceType,
        'demo-sample.pdf',
        languageHint,
      );

      setActiveJobId(response.job_id);
    } catch (err) {
      console.error('OCR demo submission error:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit demo OCR job.');
    } finally {
      setIsSubmitting(false);
    }
  }, [documentId, sourceType, languageHint]);

  // =========================================================================
  // Poll for job status
  // =========================================================================

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;

    const poll = async () => {
      setIsPolling(true);

      try {
        const status = await getOCRJobStatus(activeJobId);
        if (cancelled) return;

        setJobStatus(status);

        // Pre-populate correction textarea with extracted text
        if (status.extracted_text && !correctedText) {
          setCorrectedText(status.corrected_text || status.extracted_text);
        }

        // Continue polling if still in progress
        if (status.status === 'pending' || status.status === 'processing') {
          setTimeout(poll, 2000);
        } else {
          setIsPolling(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error polling OCR status:', err);
        setIsPolling(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
    // We intentionally only re-run when activeJobId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId]);

  // =========================================================================
  // Submit corrections
  // =========================================================================

  const handleSaveCorrection = useCallback(async () => {
    if (!activeJobId) return;

    try {
      setIsSavingCorrection(true);
      setCorrectionError(null);
      setCorrectionSaved(false);

      await submitOCRCorrection(activeJobId, {
        corrected_text: correctedText,
        correction_notes: correctionNotes || undefined,
      });

      setCorrectionSaved(true);
    } catch (err) {
      console.error('Error saving correction:', err);
      setCorrectionError(err instanceof Error ? err.message : 'Failed to save corrections.');
    } finally {
      setIsSavingCorrection(false);
    }
  }, [activeJobId, correctedText, correctionNotes]);

  // =========================================================================
  // Load job history
  // =========================================================================

  const loadJobHistory = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      setHistoryError(null);

      const response = await listOCRJobs({ pageSize: 20 });
      setJobHistory(response.jobs);
    } catch (err) {
      console.error('Error loading OCR history:', err);
      setHistoryError(err instanceof Error ? err.message : 'Failed to load job history.');
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Load history on mount
  useEffect(() => {
    loadJobHistory();
  }, [loadJobHistory]);

  // Refresh history after a job completes
  useEffect(() => {
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      loadJobHistory();
    }
  }, [jobStatus?.status, loadJobHistory]);

  // =========================================================================
  // View a job from history
  // =========================================================================

  const handleViewJob = useCallback(async (job: OCRJobStatus) => {
    setSelectedHistoryJob(job);
    setActiveJobId(job.job_id);
    setJobStatus(job);

    // Pre-populate correction fields
    if (job.extracted_text) {
      setCorrectedText(job.corrected_text || job.extracted_text);
      setCorrectionNotes(job.correction_notes || '');
    }

    setCorrectionSaved(false);
    setCorrectionError(null);

    // Scroll to top so user can see the results
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // =========================================================================
  // Derived state
  // =========================================================================

  const isProcessing =
    isSubmitting ||
    (jobStatus?.status === 'pending') ||
    (jobStatus?.status === 'processing');

  const isCompleted = jobStatus?.status === 'completed';
  const isFailed = jobStatus?.status === 'failed';

  const qualityMetrics: OCRQualityMetrics | null = jobStatus?.quality_metrics ?? null;
  const pages: OCRPageResult[] = jobStatus?.pages ?? [];

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <PageContainer width="medium" fillViewport className="py-4">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ScanLine className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">OCR Processing</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Upload scanned legal documents and extract text with quality assessment, per-page
          breakdown, and manual correction tools.
        </p>
      </div>

      <div className="space-y-6">
        {/* ================================================================ */}
        {/* 1. FILE UPLOAD SECTION                                           */}
        {/* ================================================================ */}
        <BaseCard variant="light" className="rounded-2xl" clickable={false}>
          <div className="space-y-5">
            <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Document
            </h2>

            {/* Drag-and-drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload file by clicking or dropping"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`
                flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
                px-6 py-10 cursor-pointer transition-all duration-200
                ${
                  isDragOver
                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                    : 'border-slate-300 dark:border-slate-700 hover:border-primary/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30'
                }
              `}
            >
              <Upload
                className={`h-8 w-8 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`}
              />
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports PDF, PNG, JPG, and TIFF files
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                className="hidden"
                aria-hidden="true"
              />
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Document ID */}
              <div className="space-y-1.5">
                <label htmlFor="ocr-doc-id" className="block text-xs font-medium text-muted-foreground">
                  Document ID
                </label>
                <input
                  id="ocr-doc-id"
                  type="text"
                  placeholder="e.g. DOC-2024-001"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Source type */}
              <div className="space-y-1.5">
                <label htmlFor="ocr-source-type" className="block text-xs font-medium text-muted-foreground">
                  Source Type
                </label>
                <select
                  id="ocr-source-type"
                  value={sourceType}
                  onChange={(e) => setSourceType(e.target.value as 'pdf' | 'image')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="pdf">PDF</option>
                  <option value="image">Image</option>
                </select>
              </div>

              {/* Language hint */}
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="ocr-language" className="block text-xs font-medium text-muted-foreground">
                  Language Hint
                </label>
                <select
                  id="ocr-language"
                  value={languageHint}
                  onChange={(e) => setLanguageHint(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="pl">Polish</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>

            {/* Error message */}
            {submitError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{submitError}</span>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !file || !documentId.trim()}
                className="gap-2 flex-1"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <ScanLine className="h-4 w-4" />
                    Start OCR Processing
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleTryDemo}
                disabled={isSubmitting}
                className="gap-2"
              >
                <FileText className="h-4 w-4" />
                Try Demo
              </Button>
            </div>
          </div>
        </BaseCard>

        {/* ================================================================ */}
        {/* 2. PROCESSING STATUS                                             */}
        {/* ================================================================ */}
        {isProcessing && (
          <BaseCard variant="light" className="rounded-2xl" clickable={false}>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  {jobStatus?.status === 'pending' ? 'Job Queued' : 'Processing Document'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {jobStatus?.status === 'pending'
                    ? 'Your OCR job is queued and will begin shortly...'
                    : 'Extracting text and analyzing quality. This may take a moment...'}
                </p>
              </div>
            </div>
          </BaseCard>
        )}

        {/* ================================================================ */}
        {/* 2b. FAILED STATE                                                 */}
        {/* ================================================================ */}
        {isFailed && jobStatus && (
          <ErrorCard
            title="OCR Processing Failed"
            message={jobStatus.error_message || 'An unexpected error occurred during OCR processing.'}
            onRetry={handleSubmit}
            retryLabel="Retry"
          />
        )}

        {/* ================================================================ */}
        {/* 3. QUALITY ASSESSMENT DASHBOARD                                  */}
        {/* ================================================================ */}
        {isCompleted && qualityMetrics && (
          <BaseCard variant="light" className="rounded-2xl" clickable={false}>
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  Quality Assessment
                </h2>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={`text-xs font-medium capitalize ${qualityBadgeClasses(qualityMetrics.quality_level)}`}
                  >
                    {qualityMetrics.quality_level} Quality
                  </Badge>
                  {qualityMetrics.needs_review && (
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Needs Review
                    </Badge>
                  )}
                </div>
              </div>

              {/* Overall confidence bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">Overall Confidence</span>
                  <span className={`font-semibold ${confidenceColor(qualityMetrics.avg_confidence).text}`}>
                    {(qualityMetrics.avg_confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${confidenceColor(qualityMetrics.avg_confidence).bar}`}
                    style={{ width: `${qualityMetrics.avg_confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Statistics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Words</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {qualityMetrics.total_words.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Low Confidence</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {qualityMetrics.low_confidence_words.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Pages Processed</p>
                  <p className="text-lg font-bold text-foreground mt-0.5">
                    {jobStatus?.page_count ?? pages.length}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Language Detected</p>
                  <p className="text-lg font-bold text-foreground mt-0.5 uppercase">
                    {jobStatus?.language_detected || '--'}
                  </p>
                </div>
              </div>

              {/* Per-page breakdown (expandable) */}
              {pages.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setIsPagesExpanded(!isPagesExpanded)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full justify-between"
                  >
                    <span>Per-Page Breakdown ({pages.length} pages)</span>
                    {isPagesExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  <div
                    className={`transition-all duration-300 ease-in-out overflow-hidden ${
                      isPagesExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
                    }`}
                  >
                    <div className="space-y-3">
                      {pages.map((page) => {
                        const colors = confidenceColor(page.confidence_score);
                        return (
                          <div
                            key={page.page_number}
                            className="rounded-lg border border-slate-200/50 dark:border-slate-700/50 p-4 bg-white/50 dark:bg-slate-900/30"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-foreground">
                                Page {page.page_number}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>{page.word_count} words</span>
                                <span className={`font-semibold ${colors.text}`}>
                                  {(page.confidence_score * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            {/* Mini confidence bar */}
                            <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-3">
                              <div
                                className={`h-full rounded-full ${colors.bar}`}
                                style={{ width: `${page.confidence_score * 100}%` }}
                              />
                            </div>

                            {/* Text preview */}
                            {page.extracted_text && (
                              <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap leading-relaxed">
                                {page.extracted_text.slice(0, 300)}
                                {page.extracted_text.length > 300 ? '...' : ''}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </BaseCard>
        )}

        {/* ================================================================ */}
        {/* 4. MANUAL CORRECTION INTERFACE                                    */}
        {/* ================================================================ */}
        {isCompleted && jobStatus?.extracted_text && (
          <BaseCard variant="light" className="rounded-2xl" clickable={false}>
            <div className="space-y-5">
              <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-primary" />
                Manual Correction
              </h2>

              {/* Side-by-side text panels */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Original OCR text (read-only) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />
                    Original OCR Text
                  </label>
                  <textarea
                    readOnly
                    value={jobStatus.extracted_text}
                    rows={14}
                    className="w-full rounded-lg border border-border bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5 text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none"
                    aria-label="Original OCR text (read-only)"
                  />
                </div>

                {/* Editable corrected text */}
                <div className="space-y-1.5">
                  <label htmlFor="ocr-corrected-text" className="block text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Edit3 className="h-3.5 w-3.5" />
                    Corrected Text
                  </label>
                  <textarea
                    id="ocr-corrected-text"
                    value={correctedText}
                    onChange={(e) => {
                      setCorrectedText(e.target.value);
                      setCorrectionSaved(false);
                    }}
                    rows={14}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Edit the OCR output to correct any errors..."
                  />
                </div>
              </div>

              {/* Correction notes */}
              <div className="space-y-1.5">
                <label htmlFor="ocr-correction-notes" className="block text-xs font-medium text-muted-foreground">
                  Correction Notes (optional)
                </label>
                <textarea
                  id="ocr-correction-notes"
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Describe what you corrected and why..."
                />
              </div>

              {/* Correction error */}
              {correctionError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{correctionError}</span>
                  </div>
                </div>
              )}

              {/* Correction success */}
              {correctionSaved && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Corrections saved successfully.</span>
                  </div>
                </div>
              )}

              {/* Save button */}
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSaveCorrection}
                  disabled={isSavingCorrection || !correctedText.trim()}
                  className="gap-2"
                >
                  {isSavingCorrection ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Corrections
                    </>
                  )}
                </Button>
              </div>
            </div>
          </BaseCard>
        )}

        {/* ================================================================ */}
        {/* 5. JOB HISTORY SECTION                                           */}
        {/* ================================================================ */}
        <BaseCard variant="light" className="rounded-2xl" clickable={false}>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Job History
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadJobHistory}
                disabled={isLoadingHistory}
                className="gap-1.5"
              >
                {isLoadingHistory ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanLine className="h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {/* History error */}
            {historyError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
                {historyError}
              </div>
            )}

            {/* Loading state */}
            {isLoadingHistory && jobHistory.length === 0 && (
              <div className="py-8">
                <LoadingIndicator
                  message="Loading job history..."
                  variant="centered"
                  size="sm"
                />
              </div>
            )}

            {/* Empty state */}
            {!isLoadingHistory && !historyError && jobHistory.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No OCR jobs found. Upload a document above to get started.
                </p>
              </div>
            )}

            {/* Job list */}
            {jobHistory.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                        Document ID
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">
                        Confidence
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden md:table-cell">
                        Pages
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">
                        Created
                      </th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobHistory.map((job) => (
                      <tr
                        key={job.job_id}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-medium text-foreground truncate max-w-[180px]">
                          {job.document_id}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge
                            variant="secondary"
                            className={`text-xs font-medium capitalize ${statusBadgeClasses(job.status)}`}
                          >
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 hidden sm:table-cell">
                          {job.confidence_score != null ? (
                            <span className={`font-medium ${confidenceColor(job.confidence_score).text}`}>
                              {(job.confidence_score * 100).toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                          {job.page_count ?? '--'}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                          {formatDate(job.created_at)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewJob(job)}
                            className="gap-1.5 text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </BaseCard>
      </div>
    </PageContainer>
  );
}
