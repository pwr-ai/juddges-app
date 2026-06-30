"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Wand2 } from "lucide-react";
import { SchemaGenerator } from "@/components/SchemaGenerator";
import { BulkExtractionDialog } from "@/components/BulkExtractionDialog";
import {
  LoadingIndicator,
  PageContainer,
} from "@/lib/styles/components";
import { RecentExtractions } from "./_components/RecentExtractions";
import { ExtractionConfigPanel } from "./_components/ExtractionConfigPanel";
import { ResultViewerDialog } from "./_components/ResultViewerDialog";
import { useExtract } from "./_components/useExtract";

function ExtractPageContent() {
  const { user } = useAuth();
  const router = useRouter();

  const {
    selectedCollection,
    setSelectedCollection,
    selectedSchema,
    setSelectedSchema,
    selectedLanguage,
    setSelectedLanguage,
    isLoading,
    collections,
    schemas,
    isFetching,
    showSchemaGenerator,
    setShowSchemaGenerator,
    showBulkExtraction,
    setShowBulkExtraction,
    showResultViewer,
    setShowResultViewer,
    selectedResult,
    collectionDocuments,
    isLoadingDocuments,
    documentsError,
    isDocumentsExpanded,
    setIsDocumentsExpanded,
    selectedDocuments,
    recentJobs,
    selectedSchemaObject,
    hasUrlPreselection,
    handleToggleDocument,
    handleSelectAll,
    handleRetry,
    handleExtract,
    handleSchemaGenerated,
  } = useExtract();

  if (!user) {
    return null;
  }

  // Show loading indicator while fetching initial data
  if (isFetching) {
    return (
      <PageContainer fillViewport className="flex items-center justify-center">
        <LoadingIndicator
          message="Loading extraction page..."
          subtitle="Fetching collections and schemas"
          subtitleIcon={Wand2}
          variant="centered"
          size="lg"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer fillViewport className="flex flex-col">
      {/* Recent Extractions Section - Above main form */}
      <RecentExtractions
        jobs={recentJobs}
        onOpen={(jobId) => router.push(`/extractions/${jobId}`)}
        onRetry={handleRetry}
      />

      {/* Subtle visual separator */}
      <div className="my-8 border-t border-slate-200/30" />

      {/* Extraction Configuration Section */}
      <ExtractionConfigPanel
        hasUrlPreselection={hasUrlPreselection}
        isFetching={isFetching}
        isLoading={isLoading}
        collections={collections}
        schemas={schemas}
        selectedCollection={selectedCollection}
        onSelectCollection={setSelectedCollection}
        selectedSchema={selectedSchema}
        onSelectSchema={setSelectedSchema}
        selectedLanguage={selectedLanguage}
        onSelectLanguage={setSelectedLanguage}
        selectedSchemaObject={selectedSchemaObject}
        collectionDocuments={collectionDocuments}
        isLoadingDocuments={isLoadingDocuments}
        documentsError={documentsError}
        isDocumentsExpanded={isDocumentsExpanded}
        onToggleExpanded={() => setIsDocumentsExpanded(!isDocumentsExpanded)}
        selectedDocuments={selectedDocuments}
        onToggleDocument={handleToggleDocument}
        onSelectAll={handleSelectAll}
        onNavigateToCollection={() => router.push(`/collections/${selectedCollection}`)}
        onGenerateSchema={() => setShowSchemaGenerator(true)}
        onExtract={handleExtract}
        onOpenBulkExtraction={() => setShowBulkExtraction(true)}
      />



      {/* Bulk Extraction Dialog */}
      <BulkExtractionDialog
        isOpen={showBulkExtraction}
        onClose={() => setShowBulkExtraction(false)}
        schemas={schemas}
        collectionId={selectedCollection}
        collectionName={collections.find(c => c.id === selectedCollection)?.name || ""}
        documentIds={Array.from(selectedDocuments)}
        documentCount={selectedDocuments.size}
        language={selectedLanguage}
      />

      {/* Schema Generator Dialog */}
      <SchemaGenerator
        isOpen={showSchemaGenerator}
        onClose={() => setShowSchemaGenerator(false)}
        onSchemaGenerated={handleSchemaGenerated}
        collectionId={selectedCollection}
      />

      {/* Result Viewer Dialog */}
      <ResultViewerDialog
        open={showResultViewer}
        onOpenChange={setShowResultViewer}
        selectedResult={selectedResult}
      />
    </PageContainer>
  );
}

function ExtractPageLoading() {
  return (
    <PageContainer fillViewport className="flex items-center justify-center">
      <LoadingIndicator
        message="Loading extraction page..."
        subtitle="Preparing document extraction tools"
        subtitleIcon={Wand2}
        variant="centered"
        size="lg"
      />
    </PageContainer>
  );
}

export default function ExtractPage() {
  return (
    <Suspense fallback={<ExtractPageLoading />}>
      <ExtractPageContent />
    </Suspense>
  );
}
