/**
 * Zustand store for Schema Playground state management.
 *
 * Manages the complete state of the schema testing playground including:
 * - Document selection and loading
 * - Extraction execution and results
 * - Field-level and overall evaluations
 * - Test run history
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import logger from '@/lib/logger';
import type {
  PlaygroundState,
  PlaygroundDocument,
  PlaygroundExtractionResponse,
  PlaygroundTestRun,
  EvaluationState,
  FieldEvaluation,
  RatingStatus,
  AccuracyStats,
} from '@/types/schema-playground';

const storeLogger = logger.child('playgroundStore');

// ============================================
// Playground Store
// ============================================

interface PlaygroundStoreState extends PlaygroundState {
  // Actions
  setSelectedDocument: (documentId: string | null) => void;
  setSelectedCollection: (collectionId: string | null) => void;
  setAvailableDocuments: (documents: PlaygroundDocument[]) => void;
  setLoadingDocuments: (loading: boolean) => void;

  setExtractionResult: (result: PlaygroundExtractionResponse | null) => void;
  setExtracting: (extracting: boolean) => void;
  setExtractionError: (error: string | null) => void;

  setRecentRuns: (runs: PlaygroundTestRun[]) => void;
  addRecentRun: (run: PlaygroundTestRun) => void;

  setSelectedFieldPath: (fieldPath: string | null) => void;

  clearPlayground: () => void;
}

const initialPlaygroundState: PlaygroundState = {
  selectedDocumentId: null,
  selectedCollectionId: null,
  availableDocuments: [],
  isLoadingDocuments: false,
  extractionResult: null,
  isExtracting: false,
  extractionError: null,
  recentRuns: [],
  selectedFieldPath: null,
};

export const usePlaygroundStore = create<PlaygroundStoreState>()(
  devtools(
    (set, get) => ({
      ...initialPlaygroundState,

      setSelectedDocument: (documentId) => {
        storeLogger.debug('Selected document:', documentId);
        set({ selectedDocumentId: documentId });
      },

      setSelectedCollection: (collectionId) => {
        storeLogger.debug('Selected collection:', collectionId);
        set({
          selectedCollectionId: collectionId,
          selectedDocumentId: null,
          availableDocuments: [],
        });
      },

      setAvailableDocuments: (documents) => {
        set({ availableDocuments: documents });
      },

      setLoadingDocuments: (loading) => {
        set({ isLoadingDocuments: loading });
      },

      setExtractionResult: (result) => {
        storeLogger.debug('Extraction result:', result?.status);
        set({
          extractionResult: result,
          isExtracting: false,
          extractionError: result?.status === 'failed' ? result.error_message : null,
        });
      },

      setExtracting: (extracting) => {
        set({
          isExtracting: extracting,
          ...(extracting ? { extractionError: null } : {}),
        });
      },

      setExtractionError: (error) => {
        set({ extractionError: error, isExtracting: false });
      },

      setRecentRuns: (runs) => {
        set({ recentRuns: runs });
      },

      addRecentRun: (run) => {
        const { recentRuns } = get();
        set({ recentRuns: [run, ...recentRuns.slice(0, 19)] });
      },

      setSelectedFieldPath: (fieldPath) => {
        set({ selectedFieldPath: fieldPath });
      },

      clearPlayground: () => {
        storeLogger.debug('Clearing playground state');
        set(initialPlaygroundState);
      },
    }),
    { name: 'playground-store' }
  )
);

// ============================================
// Evaluation Store
// ============================================

interface EvaluationStoreState extends EvaluationState {
  // Actions
  initializeEvaluation: (
    schemaVersionId: string,
    documentId: string,
    extractedData: Record<string, unknown>
  ) => void;

  setOverallRating: (rating: RatingStatus) => void;
  setOverallNotes: (notes: string) => void;

  setFieldRating: (fieldPath: string, isCorrect: boolean) => void;
  clearFieldRating: (fieldPath: string) => void;
  setAllFieldRatings: (ratings: Map<string, boolean>) => void;

  setSaving: (saving: boolean) => void;
  setLoading: (loading: boolean) => void;
  setDirty: (dirty: boolean) => void;

  setEvaluationId: (id: string | null) => void;
  setAccuracyStats: (stats: AccuracyStats | null) => void;

  loadFromEvaluation: (evaluation: {
    id: string;
    overall_rating: 'correct' | 'incorrect';
    overall_notes: string | null;
    field_evaluations: FieldEvaluation[];
  }) => void;

  getFieldEvaluations: () => FieldEvaluation[];
  getAccuracySummary: () => { rated: number; total: number; correct: number; percentage: number };

  clearEvaluation: () => void;
}

const initialEvaluationState: EvaluationState = {
  evaluationId: null,
  schemaVersionId: null,
  documentId: null,
  overallRating: 'unrated',
  overallNotes: '',
  fieldRatings: new Map(),
  isDirty: false,
  isSaving: false,
  isLoading: false,
  accuracyStats: null,
};

export const useEvaluationStore = create<EvaluationStoreState>()(
  devtools(
    (set, get) => ({
      ...initialEvaluationState,

      initializeEvaluation: (schemaVersionId, documentId, extractedData) => {
        storeLogger.debug('Initializing evaluation:', { schemaVersionId, documentId });
        set({
          schemaVersionId,
          documentId,
          evaluationId: null,
          overallRating: 'unrated',
          overallNotes: '',
          fieldRatings: new Map(),
          isDirty: false,
          isSaving: false,
        });
      },

      setOverallRating: (rating) => {
        set({ overallRating: rating, isDirty: true });
      },

      setOverallNotes: (notes) => {
        set({ overallNotes: notes, isDirty: true });
      },

      setFieldRating: (fieldPath, isCorrect) => {
        const { fieldRatings } = get();
        const newRatings = new Map(fieldRatings);
        newRatings.set(fieldPath, isCorrect);
        set({ fieldRatings: newRatings, isDirty: true });
      },

      clearFieldRating: (fieldPath) => {
        const { fieldRatings } = get();
        const newRatings = new Map(fieldRatings);
        newRatings.delete(fieldPath);
        set({ fieldRatings: newRatings, isDirty: true });
      },

      setAllFieldRatings: (ratings) => {
        set({ fieldRatings: ratings, isDirty: true });
      },

      setSaving: (saving) => {
        set({ isSaving: saving });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setDirty: (dirty) => {
        set({ isDirty: dirty });
      },

      setEvaluationId: (id) => {
        set({ evaluationId: id });
      },

      setAccuracyStats: (stats) => {
        set({ accuracyStats: stats });
      },

      loadFromEvaluation: (evaluation) => {
        const fieldRatings = new Map<string, boolean>();
        for (const fe of evaluation.field_evaluations || []) {
          fieldRatings.set(fe.field_path, fe.is_correct);
        }

        set({
          evaluationId: evaluation.id,
          overallRating: evaluation.overall_rating,
          overallNotes: evaluation.overall_notes || '',
          fieldRatings,
          isDirty: false,
        });
      },

      getFieldEvaluations: () => {
        const { fieldRatings } = get();
        const evaluations: FieldEvaluation[] = [];

        fieldRatings.forEach((isCorrect, fieldPath) => {
          const fieldName = fieldPath.split('.').pop() || fieldPath;
          evaluations.push({
            field_path: fieldPath,
            field_name: fieldName,
            is_correct: isCorrect,
          });
        });

        return evaluations;
      },

      getAccuracySummary: () => {
        const { fieldRatings } = get();
        const total = fieldRatings.size;
        let correct = 0;

        fieldRatings.forEach((isCorrect) => {
          if (isCorrect) correct++;
        });

        return {
          rated: total,
          total,
          correct,
          percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
        };
      },

      clearEvaluation: () => {
        storeLogger.debug('Clearing evaluation state');
        set(initialEvaluationState);
      },
    }),
    { name: 'evaluation-store' }
  )
);

// ============================================
// Version History Store
// ============================================

import type {
  VersionState,
  SchemaVersionSummary,
  SchemaVersionDetail,
  VersionComparisonResponse,
} from '@/types/schema-playground';

interface VersionStoreState extends VersionState {
  // Actions
  setVersions: (versions: SchemaVersionSummary[], currentVersion: number) => void;
  setLoadingVersions: (loading: boolean) => void;

  setSelectedVersion: (version: SchemaVersionDetail | null) => void;
  setLoadingVersion: (loading: boolean) => void;

  setComparisonResult: (result: VersionComparisonResponse | null) => void;
  setComparing: (comparing: boolean) => void;

  setRollingBack: (rollingBack: boolean) => void;

  clearVersions: () => void;
}

const initialVersionState: VersionState = {
  versions: [],
  currentVersion: 1,
  isLoadingVersions: false,
  selectedVersion: null,
  isLoadingVersion: false,
  comparisonResult: null,
  isComparing: false,
  isRollingBack: false,
};

export const useVersionStore = create<VersionStoreState>()(
  devtools(
    (set) => ({
      ...initialVersionState,

      setVersions: (versions, currentVersion) => {
        set({ versions, currentVersion, isLoadingVersions: false });
      },

      setLoadingVersions: (loading) => {
        set({ isLoadingVersions: loading });
      },

      setSelectedVersion: (version) => {
        set({ selectedVersion: version, isLoadingVersion: false });
      },

      setLoadingVersion: (loading) => {
        set({ isLoadingVersion: loading });
      },

      setComparisonResult: (result) => {
        set({ comparisonResult: result, isComparing: false });
      },

      setComparing: (comparing) => {
        set({ isComparing: comparing });
      },

      setRollingBack: (rollingBack) => {
        set({ isRollingBack: rollingBack });
      },

      clearVersions: () => {
        storeLogger.debug('Clearing version state');
        set(initialVersionState);
      },
    }),
    { name: 'version-store' }
  )
);
