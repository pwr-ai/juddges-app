import { Wand2, Link as LinkIcon, Sparkles, FolderOpen, FileCode, Globe, AlertCircle, Layers } from "lucide-react";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { SchemaPreview } from "@/lib/styles/components/schema-preview";
import {
  BaseCard,
  SecondaryButton,
  SearchableDropdownButton,
  DropdownButton,
  VariantButton,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { Collection, CollectionDocument, formatName } from "./types";
import { DocumentSelector } from "./DocumentSelector";

interface ExtractionConfigPanelProps {
  hasUrlPreselection: boolean;
  isFetching: boolean;
  isLoading: boolean;
  collections: Collection[];
  schemas: ExtractionSchema[];
  selectedCollection: string;
  onSelectCollection: (value: string) => void;
  selectedSchema: string;
  onSelectSchema: (value: string) => void;
  selectedLanguage: string;
  onSelectLanguage: (value: string) => void;
  selectedSchemaObject: ExtractionSchema | null | undefined;
  collectionDocuments: CollectionDocument[];
  isLoadingDocuments: boolean;
  documentsError: string | null;
  isDocumentsExpanded: boolean;
  onToggleExpanded: () => void;
  selectedDocuments: Set<string>;
  onToggleDocument: (documentId: string) => void;
  onSelectAll: () => void;
  onNavigateToCollection: () => void;
  onGenerateSchema: () => void;
  onExtract: () => void;
  onOpenBulkExtraction: () => void;
}

export function ExtractionConfigPanel({
  hasUrlPreselection,
  isFetching,
  isLoading,
  collections,
  schemas,
  selectedCollection,
  onSelectCollection,
  selectedSchema,
  onSelectSchema,
  selectedLanguage,
  onSelectLanguage,
  selectedSchemaObject,
  collectionDocuments,
  isLoadingDocuments,
  documentsError,
  isDocumentsExpanded,
  onToggleExpanded,
  selectedDocuments,
  onToggleDocument,
  onSelectAll,
  onNavigateToCollection,
  onGenerateSchema,
  onExtract,
  onOpenBulkExtraction,
}: ExtractionConfigPanelProps) {
  return (
    <div id="extraction-form-section" className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div>
          <BaseCard
            variant="light"
            title="New Extraction"
          >
            <div className="space-y-6 -mt-3 -m-3.5 p-8">
              {hasUrlPreselection && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <LinkIcon className="h-3.5 w-3.5" />
                  <span>Pre-selected from URL</span>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Collection</label>
                <SearchableDropdownButton
                  icon={<FolderOpen size={16} />}
                  label={isFetching ? "Loading collections..." : "Select a collection"}
                  value={selectedCollection}
                  options={collections.map((collection) => {
                    const docCount = collection.document_count ?? collection.documents?.length ?? 0;
                    // Show only the document count number
                    const badge = String(docCount);
                    return {
                      value: collection.id,
                      label: collection.name,
                      description: collection.description || undefined,
                      badge: badge,
                    };
                  })}
                  onChange={onSelectCollection}
                  disabled={isFetching}
                  searchPlaceholder="Search collections by name or description..."
                  maxHeight="max-h-[300px]"
                />
              </div>

              {/* Document Preview Section */}
              {selectedCollection && (
                <DocumentSelector
                  collectionDocuments={collectionDocuments}
                  isLoadingDocuments={isLoadingDocuments}
                  documentsError={documentsError}
                  isDocumentsExpanded={isDocumentsExpanded}
                  onToggleExpanded={onToggleExpanded}
                  selectedDocuments={selectedDocuments}
                  onToggleDocument={onToggleDocument}
                  onSelectAll={onSelectAll}
                  onNavigateToCollection={onNavigateToCollection}
                />
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Extraction Schema</label>
                  <SecondaryButton
                    size="sm"
                    onClick={onGenerateSchema}
                    icon={Wand2}
                  >
                    Generate New
                  </SecondaryButton>
                </div>
                <SearchableDropdownButton
                  icon={<FileCode size={16} />}
                  label={isFetching ? "Loading schemas..." : "Select a schema"}
                  value={selectedSchema}
                  options={schemas
                    .filter((schema) => schema.status === 'published' || schema.status === null) // Only show published schemas in dropdowns (treat null as published for backwards compatibility)
                    .sort((a, b) => {
                      // Sort verified schemas first
                      if (a.is_verified && !b.is_verified) return -1;
                      if (!a.is_verified && b.is_verified) return 1;
                      return 0; // Keep original order for schemas with same verification status
                    })
                    .map((schema) => ({
                      value: schema.id,
                      label: formatName(schema.name),
                      description: schema.description,
                      status: schema.status ?? undefined,
                      isVerified: schema.is_verified,
                    }))}
                  onChange={onSelectSchema}
                  disabled={isFetching || !!(selectedCollection && collectionDocuments.length === 0)}
                  searchPlaceholder="Search schemas by name or description..."
                  maxHeight="max-h-[300px]"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Language</label>
                <DropdownButton
                  icon={<Globe size={16} />}
                  label="Select language"
                  value={selectedLanguage}
                  options={[
                    { value: "pl", label: "Polish (Polski)" },
                    { value: "en", label: "English" },
                    // { value: "de", label: "German (Deutsch)" },
                    // { value: "fr", label: "French (Français)" },
                    // { value: "es", label: "Spanish (Español)" },
                  ]}
                  onChange={onSelectLanguage}
                  disabled={!!(selectedCollection && collectionDocuments.length === 0)}
                  className="w-full justify-start"
                />
              </div>

              {selectedCollection && selectedSchema && collectionDocuments.length > 0 && selectedDocuments.size === 0 && (
                <BaseCard
                  clickable={false}
                  className={cn(
                    "p-3",
                    "bg-amber-50/50",
                    "border-amber-200/50"
                  )}
                >
                  <div className="flex items-start gap-2.5 w-full">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground leading-relaxed">
                      Please select at least one document to start extraction
                    </span>
                  </div>
                </BaseCard>
              )}

              <div className="flex gap-2">
                <VariantButton
                  intent="glass"
                  onClick={onExtract}
                  disabled={
                    !selectedCollection ||
                    !selectedSchema ||
                    isLoading ||
                    isFetching ||
                    isLoadingDocuments ||
                    !!(selectedCollection && collectionDocuments.length === 0) ||
                    selectedDocuments.size === 0
                  }
                  className="flex-1"
                  isLoading={isLoading}
                >
                  {isLoading ? (
                    <span>Starting Extraction...</span>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      {isLoadingDocuments
                        ? "Loading Documents..."
                        : selectedDocuments.size > 0
                          ? `Start Extraction (${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'document' : 'documents'})`
                          : "Start Extraction"
                      }
                    </>
                  )}
                </VariantButton>
                <SecondaryButton
                  onClick={onOpenBulkExtraction}
                  disabled={
                    !selectedCollection ||
                    schemas.length < 2 ||
                    isFetching ||
                    isLoadingDocuments ||
                    !!(selectedCollection && collectionDocuments.length === 0) ||
                    selectedDocuments.size === 0
                  }
                >
                  <Layers className="h-4 w-4" />
                  Bulk
                </SecondaryButton>
              </div>
            </div>
          </BaseCard>
        </div>

        {/* Schema Preview Panel */}
        <div>
          <SchemaPreview
            schema={selectedSchemaObject || null}
          />
        </div>
      </div>
    </div>
  );
}
