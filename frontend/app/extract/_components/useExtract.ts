import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { logger } from "@/lib/logger";
import {
  Collection,
  CollectionDocument,
  ExtractionJob,
  ExtractionResult,
} from "./types";
import {
  fetchCollections,
  fetchSchemas,
  fetchRecentJobs,
  fetchCollectionDocuments,
  enrichDocumentsWithMetadata,
  submitExtraction,
  saveGeneratedSchema,
} from "./data";

export function useExtract() {
  const searchParams = useSearchParams();

  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [selectedSchema, setSelectedSchema] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("pl");
  const [isLoading, setIsLoading] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [schemas, setSchemas] = useState<ExtractionSchema[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showSchemaGenerator, setShowSchemaGenerator] = useState(false);
  const [showBulkExtraction, setShowBulkExtraction] = useState(false);
  const [showResultViewer, setShowResultViewer] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ExtractionResult | null>(null);
  const [preselectedFromUrl, setPreselectedFromUrl] = useState<{
    collection?: string;
    schema?: string;
  }>({});
  const [collectionDocuments, setCollectionDocuments] = useState<CollectionDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [isDocumentsExpanded, setIsDocumentsExpanded] = useState(true);
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [recentJobs, setRecentJobs] = useState<ExtractionJob[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsFetching(true);
        // Fetch collections
        const collectionsData = await fetchCollections();
        setCollections(collectionsData);

        // Fetch schemas
        const schemasData = await fetchSchemas();
        setSchemas(schemasData);

        // Fetch recent extractions
        try {
          const mappedJobs = await fetchRecentJobs(3, true);
          if (mappedJobs !== null) {
            setRecentJobs(mappedJobs);
          } else {
            logger.warn('Failed to fetch extractions');
            setRecentJobs([]);
          }
        } catch (error) {
          logger.error('Error fetching extractions:', error);
          setRecentJobs([]);
        }

        // Handle URL parameters for pre-selection
        const urlCollection = searchParams.get('collection');
        const urlSchema = searchParams.get('schema');
        const preselected: { collection?: string; schema?: string } = {};

        if (urlCollection) {
          const collectionExists = collectionsData.some(
            (c: Collection) => c.id === urlCollection
          );
          if (collectionExists) {
            setSelectedCollection(urlCollection);
            preselected.collection = urlCollection;
          } else {
            toast.error("The collection ID from the URL was not found.");
          }
        }

        if (urlSchema) {
          const schemaExists = schemasData.some(
            (s: ExtractionSchema) => s.id === urlSchema
          );
          if (schemaExists) {
            setSelectedSchema(urlSchema);
            preselected.schema = urlSchema;
          } else {
            toast.error("The schema ID from the URL was not found.");
          }
        }

        if (Object.keys(preselected).length > 0) {
          setPreselectedFromUrl(preselected);
        }
      } catch (error) {
        logger.error('Error fetching data:', error);
        const errorMessage = error instanceof Error ? error.message : "Failed to load collections and schemas";
        toast.error(errorMessage);
      } finally {
        setIsFetching(false);
      }
    };

    fetchData();
  }, [searchParams]);

  // Poll for extraction updates when there are in-progress extractions
  useEffect(() => {
    const hasInProgressJobs = recentJobs.some(job => job.status === 'in_progress');
    if (!hasInProgressJobs) return;

    const pollInterval = setInterval(async () => {
      try {
        const mappedJobs = await fetchRecentJobs(6, false);
        if (mappedJobs !== null) {
          setRecentJobs(mappedJobs);
        }
      } catch (error) {
        logger.error('Error polling extractions:', error);
      }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [recentJobs]);

  // Fetch documents when collection is selected
  useEffect(() => {
    const fetchDocuments = async () => {
      if (!selectedCollection) {
        setCollectionDocuments([]);
        setDocumentsError(null);
        setSelectedDocuments(new Set());
        return;
      }

      setIsLoadingDocuments(true);
      setDocumentsError(null);
      setSelectedDocuments(new Set()); // Reset selection when collection changes

      try {
        const documents = await fetchCollectionDocuments(selectedCollection);
        setCollectionDocuments(documents);

        // Select all documents by default
        if (documents && documents.length > 0) {
          setSelectedDocuments(new Set(documents.map((doc: CollectionDocument) => doc.document_id)));

          // Fetch document metadata (document_type and docket_number) via batch endpoint AFTER collection is selected
          const documentsWithMetadata = await enrichDocumentsWithMetadata(documents);
          setCollectionDocuments(documentsWithMetadata);
        }
      } catch (error) {
        logger.error('Error fetching documents:', error);
        setDocumentsError(error instanceof Error ? error.message : 'Failed to load documents');
        setCollectionDocuments([]);
      } finally {
        setIsLoadingDocuments(false);
      }
    };

    fetchDocuments();
  }, [selectedCollection]);

  const selectedSchemaObject = schemas.find(s => s.id === selectedSchema);

  const hasUrlPreselection = Object.keys(preselectedFromUrl).length > 0;

  const handleToggleDocument = (documentId: string) => {
    setSelectedDocuments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(documentId)) {
        newSet.delete(documentId);
      } else {
        newSet.add(documentId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedDocuments.size === collectionDocuments.length) {
      // Deselect all
      setSelectedDocuments(new Set());
    } else {
      // Select all
      setSelectedDocuments(new Set(collectionDocuments.map(doc => doc.document_id)));
    }
  };

  const handleRetry = async (job: ExtractionJob) => {
    try {
      // Find collection by ID or name
      let collectionId = job.collection_id;
      if (!collectionId) {
        const collection = collections.find(c => c.name === job.collection_name);
        if (collection) {
          collectionId = collection.id;
        } else {
          toast.error("Collection not found. Please select it manually.");
          return;
        }
      }

      // Find schema by ID or name
      let schemaId = job.schema_id;
      if (!schemaId) {
        const schema = schemas.find(s => s.name === job.schema_name);
        if (schema) {
          schemaId = schema.id;
        } else {
          toast.error("Schema not found. Please select it manually.");
          return;
        }
      }

      // Set form fields
      setSelectedCollection(collectionId);
      setSelectedSchema(schemaId);
      setSelectedDocuments(new Set()); // Clear document selection for retry

      // Scroll to form section
      setTimeout(() => {
        const formSection = document.getElementById('extraction-form-section');
        if (formSection) {
          formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

      // Wait a bit for state to update, then trigger extraction
      setTimeout(() => {
        handleExtract();
      }, 200);
    } catch (error) {
      logger.error('Error retrying extraction:', error);
      toast.error("Failed to retry extraction. Please configure manually.");
    }
  };

  const handleExtract = async () => {
    if (!selectedCollection || !selectedSchema) return;

    setIsLoading(true);
    try {
      const result = await submitExtraction({
        collectionId: selectedCollection,
        schemaId: selectedSchema,
        language: selectedLanguage,
        documentIds: Array.from(selectedDocuments),
      });

      if (!result.ok) {
        toast.error(result.message, {
          duration: 7000, // Show error longer so user can read it
        });
        return;
      }

      setCurrentJobId(result.jobId);

      // Refresh extractions list to show the new extraction
      try {
        const mappedJobs = await fetchRecentJobs(3, false);
        if (mappedJobs !== null) {
          setRecentJobs(mappedJobs);
        }
      } catch (error) {
        logger.error('Error refreshing extractions list:', error);
      }

      toast.success("The extraction process has been initiated. Monitor progress in the recent extractions section.");
    } catch (error) {
      logger.error("Extraction request failed: ", error);

      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Network or unexpected errors
      toast.error(`Failed to connect to the server: ${errorMessage}. Please check your internet connection and try again.`, {
        duration: 7000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSchemaGenerated = async (newSchema: any) => {
    // Save the generated schema to the database
    try {
      const savedSchema = await saveGeneratedSchema(newSchema);

      // Add the saved schema to the schemas list and select it
      setSchemas(prev => [savedSchema, ...prev]);
      setSelectedSchema(savedSchema.id);

      toast.success("Schema generated and saved successfully");
    } catch (error) {
      logger.error('Failed to save generated schema:', error);
      toast.error("Schema generated but failed to save. Please try creating it manually.");
    }
  };

  const handleViewResult = (result: ExtractionResult) => {
    setSelectedResult(result);
    setShowResultViewer(true);
  };

  const handleExtractionComplete = (results: ExtractionResult[]) => {
    toast.success(`Successfully processed ${results.length} documents`);
  };

  return {
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
    currentJobId,
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
    handleViewResult,
    handleExtractionComplete,
  };
}
