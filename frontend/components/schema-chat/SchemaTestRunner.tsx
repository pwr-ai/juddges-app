"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TestTube,
  Play,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Document {
  id: string;
  document_id: string;
  document_date?: string;
  volume_number?: string;
  title?: string;
}

interface TestResult {
  document_id: string;
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extracted_data?: any;
  error?: string;
  execution_time?: number;
}

interface SchemaTestRunnerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
  collectionId: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTest: (documentIds: string[]) => Promise<any>;
}

export function SchemaTestRunner({
  schema,
  collectionId,
  onTest,
}: SchemaTestRunnerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);

  useEffect(() => {
    if (collectionId) {
      fetchDocuments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId]);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/collections/${collectionId}/documents`);
      if (!response.ok) throw new Error("Failed to fetch documents");
      const data = await response.json();

      // Take first 10 documents for testing
      const sampleDocs = data.slice(0, 10);
      setDocuments(sampleDocs);

      // Auto-select first 3 documents
      setSelectedDocs(new Set(sampleDocs.slice(0, 3).map((d: Document) => d.id)));
    } catch (error) {
      console.error("Error fetching documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDocumentToggle = (docId: string) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  const handleRunTest = async () => {
    if (!schema || selectedDocs.size === 0) {
      toast.error("Please select documents to test");
      return;
    }

    setIsTesting(true);
    setTestResults([]);

    try {
      const results = await onTest(Array.from(selectedDocs));
      setTestResults(results.results || []);

      const successCount = results.results.filter((r: TestResult) => r.success).length;
      const totalCount = results.results.length;

      toast.success(
        `Test completed: ${successCount}/${totalCount} successful`,
        {
          description: `Average time: ${results.average_time?.toFixed(2)}ms`,
        }
      );
    } catch (error) {
      console.error("Error running test:", error);
      toast.error("Failed to run schema test");
    } finally {
      setIsTesting(false);
    }
  };

  const viewResult = (result: TestResult) => {
    setSelectedResult(result);
    setShowResultDialog(true);
  };

  if (!schema) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TestTube className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Schema to Test</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Generate a schema first, then you can test it against sample documents
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!collectionId) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TestTube className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Select Collection to Test</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Choose a collection from the configuration section to test your schema against real documents
          </p>
        </CardContent>
      </Card>
    );
  }

  const successRate = testResults.length > 0
    ? (testResults.filter(r => r.success).length / testResults.length) * 100
    : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Sample Documents</span>
            <Badge variant="secondary">
              {selectedDocs.size} selected
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        checked={selectedDocs.has(doc.id)}
                        onCheckedChange={() => handleDocumentToggle(doc.id)}
                      />
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {doc.title || `Document ${doc.document_id}`}
                        </p>
                        {doc.document_date && (
                          <p className="text-xs text-muted-foreground">
                            {doc.document_date}
                            {doc.volume_number && ` • Vol. ${doc.volume_number}`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="mt-4 pt-4 border-t">
                <Button
                  onClick={handleRunTest}
                  disabled={selectedDocs.size === 0 || isTesting}
                  className="w-full"
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Test...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Test Schema on {selectedDocs.size} Document{selectedDocs.size !== 1 && "s"}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Test Results</span>
            {testResults.length > 0 && (
              <Badge
                variant={successRate >= 80 ? "default" : successRate >= 50 ? "secondary" : "destructive"}
              >
                {successRate.toFixed(0)}% success
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {testResults.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">No test results yet</p>
              <p className="text-xs mt-1">Run a test to see results here</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {testResults.map((result, index) => {
                  const doc = documents.find(d => d.id === result.document_id);
                  return (
                    <div
                      key={index}
                      className="p-3 rounded-lg border space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {result.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                          <span className="text-sm font-medium">
                            {doc?.title || `Document ${result.document_id.slice(0, 8)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {result.execution_time && (
                            <Badge variant="outline" className="text-xs">
                              {result.execution_time.toFixed(0)}ms
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewResult(result)}
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {result.error && (
                        <p className="text-xs text-red-500">{result.error}</p>
                      )}
                      {result.success && result.extracted_data && (
                        <div className="text-xs text-muted-foreground">
                          Extracted {Object.keys(result.extracted_data).length} fields
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Extraction Result</DialogTitle>
          </DialogHeader>
          {selectedResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {selectedResult.success ? (
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Success
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <XCircle className="h-3 w-3" />
                    Failed
                  </Badge>
                )}
                {selectedResult.execution_time && (
                  <Badge variant="outline">
                    {selectedResult.execution_time.toFixed(0)}ms
                  </Badge>
                )}
              </div>

              {selectedResult.error ? (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {selectedResult.error}
                  </p>
                </div>
              ) : (
                <div>
                  <h4 className="text-sm font-medium mb-2">Extracted Data:</h4>
                  <ScrollArea className="h-[400px] rounded-lg border">
                    <pre className="p-4 text-xs">
                      {JSON.stringify(selectedResult.extracted_data, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}