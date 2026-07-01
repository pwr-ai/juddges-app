'use client';

import React, { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { LoadingIndicator, Breadcrumb, PageContainer, ErrorCard } from '@/lib/styles/components';
import { KeyInformation } from '@/lib/styles/components/key-information';
import { VersionHistory } from '@/components/VersionHistory';

import { DocumentHeader } from './_components/DocumentHeader';
import { RelatedDocuments } from './_components/RelatedDocuments';
import { SummaryThesisSection } from './_components/SummaryThesisSection';
import { AISummaryPanel } from './_components/AISummaryPanel';
import { KeyPointsPanel } from './_components/KeyPointsPanel';
import { DocumentBody } from './_components/DocumentBody';
import { useDocument } from './_components/useDocument';

export default function DocumentPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryFromSearch = searchParams.get("q");
  const documentId = params.id as string;

  const {
    authLoading,
    metadata,
    similarDocs,
    enrichedSimilarDocs,
    loading,
    error,
    htmlString,
    summaryResult,
    isSummarizing,
    summaryError,
    summaryType,
    setSummaryType,
    summaryLength,
    setSummaryLength,
    isSummaryPanelOpen,
    setIsSummaryPanelOpen,
    keyPointsResult,
    isExtractingKeyPoints,
    keyPointsError,
    isKeyPointsPanelOpen,
    setIsKeyPointsPanelOpen,
    canUseDocumentAI,
    fetchDocumentData,
    handleGenerateSummary,
    handleExtractKeyPoints,
  } = useDocument(documentId);

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

  // Determine if HTML content is meaningfully present (not empty or error text)
  const hasHtmlContent = useMemo(() => {
    if (!htmlString) return false;
    const trimmed = htmlString.trim();
    // Check for empty or trivially short content (e.g. error messages from API)
    if (trimmed.length < 20) return false;
    // Check if it looks like actual HTML or document content
    return trimmed.includes('<') || trimmed.length > 100;
  }, [htmlString]);

  if (loading) {
    return (
      <PageContainer width="screen" fillViewport className="py-8">
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
      <PageContainer width="screen" fillViewport className="py-8">
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

  // Derive display values for the header from metadata
  const headerTitle = metadata.title || metadata.document_number || 'Untitled Document';
  const headerDocNumber = metadata.document_number && metadata.document_number !== metadata.title
    ? metadata.document_number
    : null;
  const headerDate = formatDate(metadata.date_issued || metadata.publication_date);
  const headerCourtName = metadata.court_name || null;
  // Map country code to jurisdiction label
  const jurisdictionLabel = metadata.country === 'PL' ? 'PL' : metadata.country === 'GB' ? 'UK' : metadata.country || null;
  const headerDocType = metadata.document_type ? formatDocumentType(metadata.document_type) : null;

  // Truncate title for breadcrumb display
  const breadcrumbTitle = headerTitle.length > 60
    ? headerTitle.substring(0, 57) + '...'
    : headerTitle;

  return (
    <>
      <div className="screen-only">
        <PageContainer width="screen" fillViewport className="py-4">
          {/* Breadcrumb Navigation */}
          <div className="mb-4">
            <Breadcrumb
              items={[
                { label: 'Search', href: '/search' },
                { label: breadcrumbTitle },
              ]}
            />
          </div>

          {/* Sticky Document Header */}
          <DocumentHeader
            metadata={metadata}
            queryFromSearch={queryFromSearch}
            headerTitle={headerTitle}
            headerDocNumber={headerDocNumber}
            headerDate={headerDate}
            headerCourtName={headerCourtName}
            jurisdictionLabel={jurisdictionLabel}
            headerDocType={headerDocType}
          />

          {/* Full-width single-column layout */}
          <div className="flex flex-col gap-6">
            {/* Main Content Area */}
            <div className="flex-1 min-w-0">

              {/* Extracted Schema Fields — full-width grid of all metadata */}
              {metadata && (
                <div className="mb-6">
                  <KeyInformation
                    metadata={metadata}
                    layout="grid"
                    showAll
                    title="Extracted Schema Fields"
                  />
                </div>
              )}

              {/* Similar Documents Section */}
              <RelatedDocuments
                similarDocs={similarDocs}
                enrichedSimilarDocs={enrichedSimilarDocs}
                onNavigate={(href) => router.push(href)}
              />

              {/* Summary and Thesis Section */}
              <SummaryThesisSection
                metadata={metadata}
                queryFromSearch={queryFromSearch}
              />

              {/* AI Summarization Section */}
              <AISummaryPanel
                isSummaryPanelOpen={isSummaryPanelOpen}
                onToggle={() => setIsSummaryPanelOpen(!isSummaryPanelOpen)}
                authLoading={authLoading}
                canUseDocumentAI={canUseDocumentAI}
                summaryType={summaryType}
                onSummaryTypeChange={setSummaryType}
                summaryLength={summaryLength}
                onSummaryLengthChange={setSummaryLength}
                isSummarizing={isSummarizing}
                summaryError={summaryError}
                summaryResult={summaryResult}
                onGenerateSummary={handleGenerateSummary}
              />

              {/* Key Points Extraction Section */}
              <KeyPointsPanel
                isKeyPointsPanelOpen={isKeyPointsPanelOpen}
                onToggle={() => setIsKeyPointsPanelOpen(!isKeyPointsPanelOpen)}
                authLoading={authLoading}
                canUseDocumentAI={canUseDocumentAI}
                isExtractingKeyPoints={isExtractingKeyPoints}
                keyPointsError={keyPointsError}
                keyPointsResult={keyPointsResult}
                onExtractKeyPoints={handleExtractKeyPoints}
              />

              {/* Version History */}
              <VersionHistory
                documentId={documentId}
                onRevert={fetchDocumentData}
              />

              {/* Main Content - Document HTML or Fallback */}
              <DocumentBody
                hasHtmlContent={hasHtmlContent}
                htmlString={htmlString}
                metadata={metadata}
              />
            </div>
          </div>

        </PageContainer>
      </div>
    </>
  );
}
