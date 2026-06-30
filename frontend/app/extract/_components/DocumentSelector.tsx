import { FileText, FolderOpen, ChevronUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  VariantButton,
  LoadingIndicator,
  EmptyState,
  AIBadge,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { CollectionDocument, getDocumentTypeBadge } from "./types";

interface DocumentSelectorProps {
  collectionDocuments: CollectionDocument[];
  isLoadingDocuments: boolean;
  documentsError: string | null;
  isDocumentsExpanded: boolean;
  onToggleExpanded: () => void;
  selectedDocuments: Set<string>;
  onToggleDocument: (documentId: string) => void;
  onSelectAll: () => void;
  onNavigateToCollection: () => void;
}

export function DocumentSelector({
  collectionDocuments,
  isLoadingDocuments,
  documentsError,
  isDocumentsExpanded,
  onToggleExpanded,
  selectedDocuments,
  onToggleDocument,
  onSelectAll,
  onNavigateToCollection,
}: DocumentSelectorProps) {
  return (
    <div className={cn(
      "rounded-lg border",
      "bg-slate-50/50",
      "border-slate-200/50",
      "overflow-hidden"
    )}>
      {collectionDocuments.length > 0 && (
        <button
          type="button"
          onClick={onToggleExpanded}
          className={cn(
            "w-full flex items-center justify-between gap-2 p-3",
            "hover:bg-slate-100/50",
            "transition-colors",
            "border-b border-slate-200/50"
          )}
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Select Documents</span>
          </div>
          <div className="flex items-center gap-2">
            {!isLoadingDocuments && !documentsError && selectedDocuments.size > 0 && (
              <AIBadge
                text={String(selectedDocuments.size)}
                icon={FileText}
                size="sm"
                className="font-mono"
              />
            )}
            {isLoadingDocuments ? (
              <div className="h-3.5 w-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            ) : isDocumentsExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
      )}

      {(isDocumentsExpanded || collectionDocuments.length === 0) && (
        <div className="p-3">
          {isLoadingDocuments ? (
            <LoadingIndicator
              message="Loading documents..."
              variant="inline"
              size="sm"
              className="py-8"
            />
          ) : documentsError ? (
            <div className="py-4 text-sm text-destructive text-center">
              {documentsError}
            </div>
          ) : collectionDocuments.length === 0 ? (
            <EmptyState
              title="No documents in this collection"
              description="Add documents to this collection to start extraction"
              icon={FileText}
              variant="default"
              primaryAction={{
                label: "Go to Collection",
                onClick: onNavigateToCollection,
                icon: FolderOpen,
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-muted-foreground">
                  {selectedDocuments.size > 0
                    ? `${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'document' : 'documents'} selected`
                    : 'No documents selected'
                  }
                </div>
                <VariantButton
                  intent="text"
                  onClick={onSelectAll}
                  className="text-xs"
                >
                  {selectedDocuments.size === collectionDocuments.length ? 'Deselect All' : 'Select All'}
                </VariantButton>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {collectionDocuments.map((doc) => {
                  // Display docket_number if available, otherwise document_number, fallback to document_id
                  const displayNumber = doc.docket_number || doc.document_number || doc.document_id;

                  const { label: typeLabel, className: typeClassName } = getDocumentTypeBadge(doc.document_type);

                  return (
                    <div
                      key={doc.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-md transition-colors cursor-pointer",
                        "bg-slate-50/50",
                        "hover:bg-slate-100/50",
                        "border border-slate-200/50"
                      )}
                      onClick={() => onToggleDocument(doc.document_id)}
                    >
                      <Checkbox
                        checked={selectedDocuments.has(doc.document_id)}
                        onCheckedChange={() => onToggleDocument(doc.document_id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-sm font-medium truncate",
                            (!doc.docket_number && !doc.document_number) && "text-muted-foreground"
                          )}>
                            {displayNumber}
                          </span>
                          {doc.document_type && (
                            <Badge
                              className={cn(
                                "text-xs font-medium shrink-0 px-2.5 py-1 rounded-md backdrop-blur-sm",
                                typeClassName
                              )}
                            >
                              {typeLabel}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
