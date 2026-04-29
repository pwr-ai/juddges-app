"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Wand2, CheckCircle, AlertCircle, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SearchDocument } from "@/types/search";
import {
 BaseCard,
 PrimaryButton,
 SecondaryButton,
 LoadingIndicator,
 AIBadge,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

interface SchemaGeneratorProps {
 isOpen: boolean;
 onClose: () => void;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 onSchemaGenerated: (schema: any) => void;
 collectionId?: string;
}

interface GenerationStep {
 id: string;
 name: string;
 status: "pending"|"in_progress"|"completed"|"failed";
 description: string;
}

interface DocumentSample {
 document_id: string;
 title: string | null;
 document_type: string;
 full_text?: string | null;
 summary?: string | null;
 thesis?: string | null;
}

function formatSampleDocumentType(type: string | null | undefined): string {
 if (!type) return "Legal document";
 if (type === "judgment" || type === "judgement") return "Judgment";
 if (type === "tax_interpretation") return "Legal document";
 return type.replace(/_/g, " ");
}

export function SchemaGenerator({
 isOpen,
 onClose,
 onSchemaGenerated,
 collectionId = undefined
}: SchemaGeneratorProps) {
 const [userInput, setUserInput] = useState("");
 const [isGenerating, setIsGenerating] = useState(false);
 const [generationSteps, setGenerationSteps] = useState<GenerationStep[]>([]);
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const [generatedSchema, setGeneratedSchema] = useState<any>(null);

 // New state for document context
 const [sampleDocuments, setSampleDocuments] = useState<DocumentSample[]>([]);
 const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
 const [documentsFetchError, setDocumentsFetchError] = useState<string | null>(null);

 // Fetch sample documents when collectionId is provided
 useEffect(() => {
 const fetchSampleDocuments = async () => {
 if (!collectionId || !isOpen) {
 setSampleDocuments([]);
 setDocumentsFetchError(null);
 return;
 }

 setIsLoadingDocuments(true);
 setDocumentsFetchError(null);

 try {
 // Fetch collection with documents
 const collectionResponse = await fetch(`/api/collections/${collectionId}`);

 if (!collectionResponse.ok) {
 throw new Error("Failed to fetch collection");
 }

 const collection = await collectionResponse.json();

 // Check if collection has documents
 if (!collection.documents || collection.documents.length === 0) {
 setDocumentsFetchError("This collection has no documents. Add documents first to improve schema generation.");
 setSampleDocuments([]);
 setIsLoadingDocuments(false);
 return;
 }

 // Fetch up to 3 sample documents from the collection
 const documentIds = collection.documents.slice(0, 3);
 const documentsResponse = await fetch(
 `/api/documents/batch?ids=${documentIds.join(',')}`
 );

 if (!documentsResponse.ok) {
 throw new Error("Failed to fetch sample documents");
 }

 const documentsData = await documentsResponse.json();

 // Extract relevant fields for context
 const samples: DocumentSample[] = documentsData.documents.map((doc: SearchDocument) => ({
 document_id: doc.document_id,
 title: doc.title,
 document_type: doc.document_type,
 full_text: doc.full_text,
 summary: doc.summary,
 thesis: doc.thesis
 }));

 setSampleDocuments(samples);

 if (samples.length > 0) {
 toast.success(`Using ${samples.length} sample document${samples.length > 1 ? 's' : ''} to improve schema generation`);
 }
 } catch (error) {
 logger.error("Error fetching sample documents: ", error);
 setDocumentsFetchError("Failed to load sample documents. Schema generation will proceed without document context.");
 setSampleDocuments([]);
 } finally {
 setIsLoadingDocuments(false);
 }
 };

 fetchSampleDocuments();
 }, [collectionId, isOpen]);

 const initializeSteps = (): GenerationStep[] => [
 {
 id: "problem_analysis",
 name: "Problem Analysis",
 status: "pending",
 description: "Analyzing your requirements and identifying key extraction needs"
 },
 {
 id: "data_assessment",
 name: "Data Assessment",
 status: "pending",
 description: collectionId && sampleDocuments.length > 0
 ? `Examining ${sampleDocuments.length} sample document${sampleDocuments.length > 1 ? 's' : ''} from your collection`
 : collectionId
 ? "Analyzing document patterns and structures"
 : "Analyzing general document patterns and structures"
 },
 {
 id: "schema_generation",
 name: "Schema Generation",
 status: "pending",
 description: "Creating initial extraction schema structure"
 },
 {
 id: "schema_refinement",
 name: "Schema Refinement",
 status: "pending",
 description: "Optimizing schema based on data analysis"
 },
 {
 id: "validation",
 name: "Validation",
 status: "pending",
 description: collectionId && sampleDocuments.length > 0
 ? "Validating schema against sample documents"
 : "Performing structural validation and best practice checks"
 }
 ];

 const updateStepStatus = (stepId: string, status: GenerationStep["status"]) => {
 setGenerationSteps(prev =>
 prev.map(step =>
 step.id === stepId ? { ...step, status } : step
 )
 );
 };

 const handleGenerate = async () => {
 if (!userInput.trim()) {
 toast.error("Please provide a description of what you want to extract");
 return;
 }

 setIsGenerating(true);
 setGenerationSteps(initializeSteps());
 setGeneratedSchema(null);

 try {
 // Simulate progressive steps for better UX
 // Start with problem analysis
 updateStepStatus("problem_analysis","in_progress");
 await new Promise(resolve => setTimeout(resolve, 1000));
 updateStepStatus("problem_analysis","completed");

 // Data assessment
 updateStepStatus("data_assessment","in_progress");
 await new Promise(resolve => setTimeout(resolve, 1500));
 updateStepStatus("data_assessment","completed");

 // Schema generation (actual API call using new chat endpoint)
 updateStepStatus("schema_generation","in_progress");

 // Prepare document samples for context (only include relevant fields to keep context size reasonable)
 const documentSamples = sampleDocuments.map(doc => ({
 document_id: doc.document_id,
 title: doc.title,
 document_type: doc.document_type,
 // Include summary or thesis if available, otherwise a preview of full_text
 content_preview: doc.summary || doc.thesis || (doc.full_text ? doc.full_text.substring(0, 1000) : null)
 }));

 const response = await fetch('/api/schema-generator/chat', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
	 body: JSON.stringify({
	 message: userInput,
	 collection_id: collectionId,
	 conversation_history: [],
	 current_schema: null,
	 document_type: "judgment",
	 // Include document samples if available
	 document_samples: documentSamples.length > 0 ? documentSamples : undefined
	 })
 });

 if (!response.ok) {
 throw new Error(`Schema generation failed: ${response.status}`);
 }

 const result = await response.json();

 updateStepStatus("schema_generation","completed");

 // Schema refinement
 updateStepStatus("schema_refinement","in_progress");
 await new Promise(resolve => setTimeout(resolve, 800));
 updateStepStatus("schema_refinement","completed");

 // Validation
 updateStepStatus("validation","in_progress");
 await new Promise(resolve => setTimeout(resolve, 500));
 updateStepStatus("validation","completed");

 // Set the generated schema from the chat response
 setGeneratedSchema({
 schema: result.schema,
 confidence: result.confidence,
 validation_results: result.validation_results,
 session_id: result.session_id || result.agent_id,
 agent_id: result.agent_id // Keep for backward compatibility
 });

 toast.success(
 result.session_id || result.agent_id
 ? `Schema generated successfully! (Session: ${(result.session_id || result.agent_id).substring(0, 8)}...)`
 : "Schema generated successfully!"
 );

 } catch (error) {
 logger.error('Schema generation error:', error);
 toast.error("Failed to generate schema. Please try again.");
 setGenerationSteps(prev =>
 prev.map(step => ({ ...step, status: "failed"}))
 );
 } finally {
 setIsGenerating(false);
 }
 };

 // Removed polling function - no longer needed with synchronous API

 const handleAcceptSchema = () => {
 if (generatedSchema) {
 onSchemaGenerated(generatedSchema);
 onClose();
 // Reset state
 setUserInput("");
 setGeneratedSchema(null);
 setGenerationSteps([]);
 }
 };

 const handleClose = () => {
 if (!isGenerating) {
 onClose();
 // Reset state
 setUserInput("");
 setGeneratedSchema(null);
 setGenerationSteps([]);
 }
 };

 const getStepIcon = (status: GenerationStep["status"]) => {
 switch (status) {
 case"completed":
 return <CheckCircle className="h-5 w-5 text-green-500"/>;
 case"in_progress":
 return <Loader2 className="h-5 w-5 animate-spin text-blue-500"/>;
 case"failed":
 return <AlertCircle className="h-5 w-5 text-red-500"/>;
 default:
 return <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30"/>;
 }
 };

 return (
 <Dialog open={isOpen} onOpenChange={handleClose}>
 <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Wand2 className="h-5 w-5"/>
 Generate Extraction Schema
 </DialogTitle>
 </DialogHeader>

 <div className="space-y-6">
 {/* Document Context Section - Show loading or error states */}
 {isLoadingDocuments && (
 <BaseCard
 clickable={false}
 className={cn(
"bg-blue-50/50",
"border-blue-200/50"
 )}
 >
 <LoadingIndicator
 message="Loading sample documents..."
 subtitle="Fetching documents from collection to improve schema generation"
 variant="inline"
 size="sm"
 subtitleIcon={FileText}
 />
 </BaseCard>
 )}

 {/* Document Context Warning - Empty Collection */}
 {!isLoadingDocuments && documentsFetchError && (
 <BaseCard
 clickable={false}
 className={cn(
"p-3",
"bg-amber-50/50",
"border-amber-200/50"
 )}
 >
 <div className="flex items-start gap-2.5 w-full">
 <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"/>
 <div className="flex-1">
 <p className="text-sm font-medium text-muted-foreground mb-1">No Document Context Available</p>
 <p className="text-sm text-muted-foreground leading-relaxed">{documentsFetchError}</p>
 </div>
 </div>
 </BaseCard>
 )}

 {/* Document Context Success - Show Sample Documents */}
 {!isLoadingDocuments && sampleDocuments.length > 0 && !isGenerating && !generatedSchema && (
 <BaseCard
 clickable={false}
 className={cn(
"p-3",
"bg-green-50/50",
"border-green-200/50"
 )}
 >
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <FileText className="h-4 w-4 text-muted-foreground"/>
 <span className="text-sm font-medium text-muted-foreground">
 Using {sampleDocuments.length} Sample Document{sampleDocuments.length > 1 ? 's' : ''} as Context
 </span>
 </div>
 <p className="text-sm text-muted-foreground">
 The AI will analyze these documents to create a more accurate extraction schema:
 </p>
 <div className="space-y-2">
 {sampleDocuments.map((doc, index) => (
 <div key={doc.document_id} className="flex items-start gap-2 text-sm">
 <AIBadge
 text={String(index + 1)}
 icon={FileText}
 size="sm"
 className="font-mono shrink-0"
 />
 <div className="flex-1 min-w-0">
 <p className="font-medium text-muted-foreground truncate">
 {doc.title || `Document ${doc.document_id.substring(0, 8)}...`}
 </p>
	 <p className="text-xs text-muted-foreground">{formatSampleDocumentType(doc.document_type)}</p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </BaseCard>
 )}

 {/* Input Section */}
 {!isGenerating && !generatedSchema && (
 <div className="space-y-4">
 <div>
 <label className="text-sm font-medium mb-2 block">
 Describe what information you want to extract from your documents:
 </label>
 <Textarea
 value={userInput}
 onChange={(e) => setUserInput(e.target.value)}
	 placeholder="Example: I want to extract key legal concepts, dates, parties involved, holdings, and cited provisions from appellate judgments..."
 className="min-h-32"
 disabled={isLoadingDocuments}
 />
 </div>
 <PrimaryButton
 onClick={handleGenerate}
 className="w-full"
 disabled={isLoadingDocuments}
 icon={Wand2}
 >
 Generate Schema
 {sampleDocuments.length > 0 &&"with Document Context"}
 </PrimaryButton>
 </div>
 )}

 {/* Progress Section */}
 {isGenerating && (
 <BaseCard clickable={false}>
 <div className="space-y-4">
 <h3 className="text-base font-semibold mb-4">Generating Schema...</h3>
 <div className="space-y-4">
 {generationSteps.map((step) => (
 <div key={step.id} className="flex items-start gap-3">
 {getStepIcon(step.status)}
 <div className="flex-1">
 <div className="flex items-center gap-2 mb-1">
 <span className="text-sm font-medium">{step.name}</span>
 <AIBadge
 text={step.status.replace(/_/g, ' ')}
 icon={step.status === "completed"? CheckCircle : step.status === "failed"? AlertCircle : FileText}
 size="sm"
 />
 </div>
 <p className="text-sm text-muted-foreground">
 {step.description}
 </p>
 </div>
 </div>
 ))}
 </div>
 </div>
 </BaseCard>
 )}

 {/* Results Section */}
 {generatedSchema && (
 <BaseCard clickable={false}>
 <div className="space-y-4">
 <h3 className="text-base font-semibold text-green-600 mb-4">
 Schema Generated Successfully!
 </h3>
 <div className="space-y-4">
 <div>
 <h4 className="text-sm font-medium mb-2">Generated Schema:</h4>
 <pre className={cn(
"bg-slate-50/50",
"border border-slate-200/50",
"p-3 rounded-lg text-sm overflow-auto max-h-64"
 )}>
 {JSON.stringify(generatedSchema?.schema || generatedSchema, null, 2)}
 </pre>
 {(generatedSchema?.confidence || generatedSchema?.schema_id) && (
 <div className="mt-2 flex gap-2">
 {generatedSchema?.confidence && (
 <AIBadge
 text={`Confidence: ${Math.round(generatedSchema.confidence * 100)}%`}
 icon={CheckCircle}
 size="sm"
 />
 )}
 {(generatedSchema?.session_id || generatedSchema?.agent_id) && (
 <AIBadge
 text={`Session: ${((generatedSchema.session_id || generatedSchema.agent_id) as string).substring(0, 8)}...`}
 icon={FileText}
 size="sm"
 />
 )}
 </div>
 )}
 </div>

 <div className="flex gap-2">
 <PrimaryButton onClick={handleAcceptSchema} className="flex-1">
 Accept & Use Schema
 </PrimaryButton>
 <SecondaryButton
 onClick={() => {
 setGeneratedSchema(null);
 setGenerationSteps([]);
 }}
 >
 Generate Again
 </SecondaryButton>
 </div>
 </div>
 </div>
 </BaseCard>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
