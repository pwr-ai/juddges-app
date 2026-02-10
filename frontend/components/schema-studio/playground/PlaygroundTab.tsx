"use client";

import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Play, FileText, CheckCircle2, XCircle, ThumbsUp, ThumbsDown, Save, FolderOpen, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePlaygroundStore, useEvaluationStore } from "@/hooks/schema-editor/usePlaygroundStore";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";
import type { PlaygroundExtractionResponse, FieldEvaluation } from "@/types/schema-playground";

interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

interface PlaygroundTabProps {
  sessionId: string;
  schemaId: string | null;
  collectionId?: string;
}

// Maximum documents to load for testing
const MAX_DOCUMENTS_FOR_TESTING = 10;

/**
 * PlaygroundTab - Test schema extraction on documents
 *
 * Allows users to:
 * 1. Select a document from a collection
 * 2. Run extraction using the current schema
 * 3. View results and rate accuracy
 */
export function PlaygroundTab({ sessionId, schemaId, collectionId: defaultCollectionId }: PlaygroundTabProps) {
  // Local state for collections
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(false);
  const [totalDocumentsInCollection, setTotalDocumentsInCollection] = useState<number>(0);
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(true);

  // Playground store state
  const {
    selectedDocumentId,
    selectedCollectionId,
    availableDocuments,
    isLoadingDocuments,
    extractionResult,
    isExtracting,
    extractionError,
    setSelectedDocument,
    setSelectedCollection,
    setAvailableDocuments,
    setLoadingDocuments,
    setExtractionResult,
    setExtracting,
    setExtractionError,
  } = usePlaygroundStore();

  // Evaluation store state
  const {
    overallRating,
    fieldRatings,
    isDirty,
    isSaving,
    setOverallRating,
    setFieldRating,
    setSaving,
    getAccuracySummary,
  } = useEvaluationStore();

  // Schema fields from the editor
  const { fields } = useSchemaEditorStore();

  // Load collections on mount
  useEffect(() => {
    const loadCollections = async () => {
      setIsLoadingCollections(true);
      try {
        const response = await fetch("/api/collections");
        if (!response.ok) throw new Error("Failed to load collections");

        const data = await response.json();
        const collectionList = (data.collections || data || []).map((col: any) => ({
          id: col.id,
          name: col.name,
          description: col.description,
          document_count: col.document_count,
        }));

        setCollections(collectionList);

        // If we have a default collection, select it
        if (defaultCollectionId && collectionList.some((c: Collection) => c.id === defaultCollectionId)) {
          setSelectedCollection(defaultCollectionId);
        }
      } catch (error) {
        toast.error("Failed to load collections");
      } finally {
        setIsLoadingCollections(false);
      }
    };

    loadCollections();
  }, [defaultCollectionId, setSelectedCollection]);

  // Load documents when collection changes (limit to first 10 for testing)
  useEffect(() => {
    if (!selectedCollectionId) {
      setAvailableDocuments([]);
      setTotalDocumentsInCollection(0);
      return;
    }

    const loadDocuments = async () => {
      setLoadingDocuments(true);
      try {
        const response = await fetch(`/api/collections/${selectedCollectionId}/documents`);
        if (!response.ok) throw new Error("Failed to load documents");

        const data = await response.json();
        // API returns array directly, not wrapped in { documents: [...] }
        const documentsArray = Array.isArray(data) ? data : (data.documents || []);
        const allDocuments = documentsArray.map((doc: any) => ({
          id: doc.document_id || doc.id,
          title: doc.title || doc.document_title || doc.name || doc.document_id || `Document ${doc.id}`,
          document_type: doc.document_type,
        }));

        // Store total count and limit to first 10 for testing
        setTotalDocumentsInCollection(allDocuments.length);
        setAvailableDocuments(allDocuments.slice(0, MAX_DOCUMENTS_FOR_TESTING));
      } catch (error) {
        toast.error("Failed to load documents");
      } finally {
        setLoadingDocuments(false);
      }
    };

    loadDocuments();
  }, [selectedCollectionId, setAvailableDocuments, setLoadingDocuments]);

  // Run extraction
  const handleRunExtraction = useCallback(async () => {
    if (!schemaId || !selectedDocumentId) {
      toast.error("Please select a document first");
      return;
    }

    setExtracting(true);
    setExtractionError(null);

    try {
      const response = await fetch("/api/playground/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_id: schemaId,
          document_id: selectedDocumentId,
          language: "pl",
        }),
      });

      const data: PlaygroundExtractionResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error_message || "Extraction failed");
      }

      setExtractionResult(data);

      if (data.status === "success") {
        toast.success("Extraction completed", {
          description: `Extracted ${data.field_count} fields in ${Math.round(data.timing.total_ms)}ms`,
        });
      } else {
        toast.error("Extraction failed", {
          description: data.error_message,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setExtractionError(message);
      toast.error("Extraction failed", { description: message });
    }
  }, [schemaId, selectedDocumentId, setExtracting, setExtractionError, setExtractionResult]);

  // Save evaluation
  const handleSaveEvaluation = useCallback(async () => {
    if (!extractionResult || overallRating === "unrated") {
      toast.error("Please rate the extraction before saving");
      return;
    }

    setSaving(true);

    try {
      const fieldEvaluations: FieldEvaluation[] = [];
      fieldRatings.forEach((isCorrect, fieldPath) => {
        const fieldName = fieldPath.split(".").pop() || fieldPath;
        const extractedValue = extractionResult.extracted_data?.[fieldPath];
        fieldEvaluations.push({
          field_path: fieldPath,
          field_name: fieldName,
          is_correct: isCorrect,
          extracted_value: extractedValue,
        });
      });

      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version_id: extractionResult.schema_version_id,
          document_id: extractionResult.document_id,
          overall_rating: overallRating,
          field_evaluations: fieldEvaluations,
          extracted_data: extractionResult.extracted_data || {},
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.message || "Failed to save evaluation");
      }

      toast.success("Evaluation saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to save evaluation", { description: message });
    } finally {
      setSaving(false);
    }
  }, [extractionResult, overallRating, fieldRatings, setSaving]);

  // Get accuracy summary
  const accuracy = getAccuracySummary();

  // If no schema, show placeholder
  if (!schemaId) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">Schema Not Saved</h3>
          <p className="text-sm">Save your schema first to test it in the playground.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header: Collection selector and run button */}
      <div className="flex-shrink-0 p-4 border-b border-border/40 bg-background/50 space-y-3">
        {/* Testing notice */}
        <Alert variant="default" className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            <span className="font-medium">Testing Mode:</span> Only first {MAX_DOCUMENTS_FOR_TESTING} documents are loaded per collection for testing purposes.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-3">
          {/* Collection selector */}
          <Select
            value={selectedCollectionId || ""}
            onValueChange={setSelectedCollection}
            disabled={isLoadingCollections || collections.length === 0}
          >
            <SelectTrigger className="w-[250px]">
              <SelectValue
                placeholder={
                  isLoadingCollections
                    ? "Loading..."
                    : collections.length === 0
                    ? "No collections"
                    : "Select collection"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {collections.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate max-w-[180px]">{col.name}</span>
                    {col.document_count !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        {col.document_count}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleRunExtraction}
            disabled={!selectedDocumentId || isExtracting}
            className="ml-auto"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Extraction
              </>
            )}
          </Button>
        </div>

        {/* Document selection list */}
        {selectedCollectionId && (
          <div className={cn(
            "rounded-lg border",
            "bg-muted/30",
            "border-border/40",
            "overflow-hidden"
          )}>
            {/* Expandable header */}
            <button
              type="button"
              onClick={() => setIsDocumentsExpanded(!isDocumentsExpanded)}
              className={cn(
                "w-full flex items-center justify-between gap-2 p-3",
                "hover:bg-muted/50",
                "transition-colors"
              )}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Select Document for Testing</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedDocumentId && (
                  <Badge variant="default" className="text-xs">
                    1 selected
                  </Badge>
                )}
                {isLoadingDocuments ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : isDocumentsExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {/* Document list */}
            {isDocumentsExpanded && (
              <div className="border-t border-border/40 p-3">
                {isLoadingDocuments ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading documents...</span>
                  </div>
                ) : availableDocuments.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No documents in this collection
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-md transition-colors cursor-pointer",
                          "hover:bg-muted/50",
                          selectedDocumentId === doc.id && "bg-primary/10 border border-primary/30"
                        )}
                        onClick={() => setSelectedDocument(selectedDocumentId === doc.id ? null : doc.id)}
                      >
                        <Checkbox
                          checked={selectedDocumentId === doc.id}
                          onCheckedChange={() => setSelectedDocument(selectedDocumentId === doc.id ? null : doc.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">{doc.title}</span>
                          {doc.document_type && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {doc.document_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Show document count info */}
                {totalDocumentsInCollection > MAX_DOCUMENTS_FOR_TESTING && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">
                    Showing {availableDocuments.length} of {totalDocumentsInCollection} documents
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results area */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {extractionResult ? (
            <div className="space-y-6">
              {/* Status and timing */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {extractionResult.status === "success" ? (
                    <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Success
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {Math.round(extractionResult.timing.total_ms)}ms
                  </span>
                </div>

                {/* Overall rating */}
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground mr-2">Overall:</span>
                  <Button
                    size="sm"
                    variant={overallRating === "correct" ? "default" : "outline"}
                    onClick={() => setOverallRating(overallRating === "correct" ? "unrated" : "correct")}
                    className={cn(
                      "h-8",
                      overallRating === "correct" && "bg-green-500 hover:bg-green-600"
                    )}
                  >
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={overallRating === "incorrect" ? "default" : "outline"}
                    onClick={() => setOverallRating(overallRating === "incorrect" ? "unrated" : "incorrect")}
                    className={cn(
                      "h-8",
                      overallRating === "incorrect" && "bg-red-500 hover:bg-red-600"
                    )}
                  >
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Accuracy summary */}
              {accuracy.rated > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">
                    {accuracy.correct}/{accuracy.rated} correct ({accuracy.percentage}%)
                  </Badge>
                </div>
              )}

              {/* Extracted fields */}
              {extractionResult.extracted_data && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Extracted Fields</h4>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {Object.entries(extractionResult.extracted_data).map(([key, value]) => (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/50 border border-border/40"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-mono text-sm font-medium">{key}</div>
                          <div className="text-sm text-muted-foreground mt-1 break-words">
                            {typeof value === "object"
                              ? JSON.stringify(value, null, 2)
                              : String(value)}
                          </div>
                        </div>

                        {/* Field rating buttons */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "h-7 w-7",
                              fieldRatings.get(key) === true &&
                                "bg-green-100 text-green-600 hover:bg-green-200"
                            )}
                            onClick={() =>
                              setFieldRating(key, fieldRatings.get(key) === true ? false : true)
                            }
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className={cn(
                              "h-7 w-7",
                              fieldRatings.get(key) === false &&
                                "bg-red-100 text-red-600 hover:bg-red-200"
                            )}
                            onClick={() =>
                              setFieldRating(key, fieldRatings.get(key) === false ? true : false)
                            }
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Save button */}
              {isDirty && overallRating !== "unrated" && (
                <div className="pt-4 border-t border-border/40">
                  <Button onClick={handleSaveEvaluation} disabled={isSaving}>
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Evaluation
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          ) : extractionError ? (
            <div className="text-center py-8">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive opacity-50" />
              <h3 className="text-lg font-medium mb-2">Extraction Failed</h3>
              <p className="text-sm text-muted-foreground">{extractionError}</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Play className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">Test Your Schema</h3>
              <p className="text-sm">
                Select a document and click "Run Extraction" to see how your schema performs.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
