"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { ExtractionSchema } from "@/types/extraction_schemas";
import YAML from "yaml";

interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

interface Document {
  id: string;
  document_id: string;
  document_date: string;
  volume_number: number;
}

export default function PlaygroundPage() {
  const { user } = useAuth();
  const [schemas, setSchemas] = useState<ExtractionSchema[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [selectedDocument, setSelectedDocument] = useState<string>("");
  const [editedSchema, setEditedSchema] = useState<string>("");
  const [extractionContext, setExtractionContext] = useState<string>(
    "Extract structured information from this legal document."
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [isFetchingDocuments, setIsFetchingDocuments] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsFetching(true);

        // Fetch schemas
        const schemasResponse = await fetch("/api/schemas");
        if (schemasResponse.ok) {
          const schemasData = await schemasResponse.json();
          setSchemas(schemasData);
        }

        // Fetch collections
        const collectionsResponse = await fetch("/api/collections");
        if (collectionsResponse.ok) {
          const collectionsData = await collectionsResponse.json();
          setCollections(collectionsData);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("Failed to load schemas and collections");
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedSchema) {
      const schema = schemas.find((s) => s.id === selectedSchema);
      if (schema) {
        setEditedSchema(YAML.stringify(schema.text));
      }
    }
  }, [selectedSchema, schemas]);

  // Fetch documents when collection is selected
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!selectedCollection) {
        setDocuments([]);
        setSelectedDocument("");
        return;
      }

      try {
        setIsFetchingDocuments(true);
        const response = await fetch(`/api/collections/${selectedCollection}/documents`);
        if (response.ok) {
          const documentsData = await response.json();
          setDocuments(documentsData || []);
        } else {
          toast.error("Failed to load documents from collection");
          setDocuments([]);
        }
      } catch (error) {
        console.error("Error fetching documents:", error);
        toast.error("Failed to load documents");
        setDocuments([]);
      } finally {
        setIsFetchingDocuments(false);
      }
    };

    fetchDocuments();
  }, [selectedCollection]);

  const handleExtract = async () => {
    if (!selectedSchema || !selectedDocument || !selectedCollection) {
      toast.error("Please select a schema, collection, and document");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      // Parse the edited schema
      try {
        YAML.parse(editedSchema);
      } catch {
        toast.error("Invalid YAML schema. Please check your syntax.");
        setIsLoading(false);
        return;
      }

      const response = await fetch("/api/extractions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collection_id: selectedCollection,
          schema_id: selectedSchema,
          document_ids: [selectedDocument],
          extraction_context: extractionContext,
          language: "pl",
        }),
      });

      if (!response.ok) {
        throw new Error(`Extraction failed: ${response.status}`);
      }

      const { job_id } = await response.json();

      // Poll for results
      toast.info("Extraction started. Polling for results...");

      await pollForResults(job_id);
    } catch (error) {
      console.error("Extraction failed:", error);
      toast.error("Failed to extract information");
    } finally {
      setIsLoading(false);
    }
  };

  const pollForResults = async (jobId: string) => {
    const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/extractions?job_id=${jobId}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status === "SUCCESS") {
          if (data.results && data.results.length > 0) {
            setResult(data.results[0]);
            toast.success("Extraction completed successfully!");
          }
          return;
        } else if (data.status === "FAILURE") {
          toast.error("Extraction failed. Check the error message.");
          setResult({ error: "Extraction failed", status: data.status });
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        } else {
          toast.warning("Polling timeout. Job may still be processing.");
        }
      } catch (error) {
        console.error("Polling error:", error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000);
        }
      }
    };

    poll();
  };

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1600px]">
      <h1 className="text-3xl font-bold mb-8">Extraction Playground</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Schema</Label>
                <Select
                  value={selectedSchema}
                  onValueChange={setSelectedSchema}
                  disabled={isFetching}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        isFetching ? "Loading schemas..." : "Select a schema"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {schemas.map((schema) => (
                      <SelectItem key={schema.id} value={schema.id}>
                        <div>
                          <div className="font-medium">{schema.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-xs">
                            {schema.description}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Collection</Label>
                <Select
                  value={selectedCollection}
                  onValueChange={setSelectedCollection}
                  disabled={isFetching}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        isFetching ? "Loading collections..." : "Select a collection"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((collection) => (
                      <SelectItem key={collection.id} value={collection.id}>
                        <div>
                          <div className="font-medium">{collection.name}</div>
                          {collection.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {collection.description}
                            </div>
                          )}
                          {collection.document_count !== undefined && (
                            <div className="text-xs text-muted-foreground">
                              {collection.document_count} document{collection.document_count !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Document</Label>
                <Select
                  value={selectedDocument}
                  onValueChange={setSelectedDocument}
                  disabled={!selectedCollection || isFetchingDocuments}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        !selectedCollection
                          ? "Select a collection first"
                          : isFetchingDocuments
                          ? "Loading documents..."
                          : documents.length === 0
                          ? "No documents in this collection"
                          : "Select a document"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {documents.map((doc) => (
                      <SelectItem key={doc.id} value={doc.id}>
                        Case {doc.volume_number} - {doc.document_date}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Extraction Context</Label>
                <Textarea
                  value={extractionContext}
                  onChange={(e) => setExtractionContext(e.target.value)}
                  placeholder="Describe what information to extract..."
                  rows={3}
                />
              </div>

              <Button
                onClick={handleExtract}
                disabled={
                  !selectedSchema || !selectedCollection || !selectedDocument || isLoading || isFetching || isFetchingDocuments
                }
                className="w-full"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Extraction
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Edit3 className="h-5 w-5" />
                Edit Schema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={editedSchema}
                onChange={(e) => setEditedSchema(e.target.value)}
                placeholder="Select a schema to edit..."
                className="font-mono text-xs"
                rows={15}
              />
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Extraction Results</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <div className="text-center py-12 text-muted-foreground">
                  Run an extraction to see results here
                </div>
              ) : (
                <div className="space-y-4">
                  {result.error ? (
                    <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                      <p className="font-medium">Error</p>
                      <p className="text-sm">{result.error}</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Status:</span>
                          <span>{result.status}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Document:</span>
                          <span>{result.document_id}</span>
                        </div>
                        {result.completed_at && (
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Completed:</span>
                            <span>
                              {new Date(result.completed_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>

                      {result.extracted_data && (
                        <div>
                          <h4 className="font-medium mb-2">Extracted Data:</h4>
                          <pre className="bg-muted/50 p-4 rounded-lg text-xs overflow-auto max-h-96">
                            {JSON.stringify(result.extracted_data, null, 2)}
                          </pre>
                        </div>
                      )}

                      {result.error_message && (
                        <div className="p-4 bg-destructive/10 text-destructive rounded-lg">
                          <p className="font-medium">Error Message:</p>
                          <p className="text-sm">{result.error_message}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
