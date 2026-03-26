import { create } from "zustand";
import type {
  Experiment,
  ExperimentResults,
  CreateExperimentInput,
  ActiveExperimentsResponse,
} from "@/types/experiments";
import logger from "@/lib/logger";

const experimentLogger = logger.child("experiment-store");

interface ExperimentState {
  experiments: Experiment[];
  activeExperiments: Experiment[];
  assignments: Record<string, string>; // experimentId -> variantId
  selectedExperiment: Experiment | null;
  results: ExperimentResults | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchExperiments: (status?: string) => Promise<void>;
  fetchActiveExperiments: () => Promise<void>;
  fetchExperimentResults: (experimentId: string) => Promise<void>;
  createExperiment: (input: CreateExperimentInput) => Promise<Experiment | null>;
  updateExperimentStatus: (experimentId: string, status: string) => Promise<void>;
  assignVariant: (experimentId: string, variantId: string) => Promise<void>;
  trackEvent: (experimentId: string, variantId: string, eventType: string, eventValue?: number, metadata?: Record<string, unknown>) => Promise<void>;
  setSelectedExperiment: (experiment: Experiment | null) => void;
  getVariantForExperiment: (experimentId: string) => string | null;
  clearError: () => void;
}

export const useExperimentStore = create<ExperimentState>((set, get) => ({
  experiments: [],
  activeExperiments: [],
  assignments: {},
  selectedExperiment: null,
  results: null,
  isLoading: false,
  error: null,

  fetchExperiments: async (status?: string) => {
    set({ isLoading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);

      const response = await fetch(`/api/experiments?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch experiments");

      const data = await response.json();
      set({ experiments: data.experiments || [], isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch experiments";
      experimentLogger.error("fetchExperiments failed", error);
      set({ error: message, isLoading: false });
    }
  },

  fetchActiveExperiments: async () => {
    try {
      const response = await fetch("/api/experiments?endpoint=active");
      if (!response.ok) throw new Error("Failed to fetch active experiments");

      const data: ActiveExperimentsResponse = await response.json();
      set({
        activeExperiments: data.experiments || [],
        assignments: data.assignments || {},
      });
    } catch (error) {
      experimentLogger.error("fetchActiveExperiments failed", error);
    }
  },

  fetchExperimentResults: async (experimentId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/experiments/${experimentId}/results`);
      if (!response.ok) throw new Error("Failed to fetch experiment results");

      const data: ExperimentResults = await response.json();
      set({ results: data, isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch results";
      experimentLogger.error("fetchExperimentResults failed", error);
      set({ error: message, isLoading: false });
    }
  },

  createExperiment: async (input: CreateExperimentInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch("/api/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!response.ok) throw new Error("Failed to create experiment");

      const experiment: Experiment = await response.json();
      set((state) => ({
        experiments: [experiment, ...state.experiments],
        isLoading: false,
      }));
      return experiment;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create experiment";
      experimentLogger.error("createExperiment failed", error);
      set({ error: message, isLoading: false });
      return null;
    }
  },

  updateExperimentStatus: async (experimentId: string, status: string) => {
    try {
      const response = await fetch(`/api/experiments?id=${experimentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) throw new Error("Failed to update experiment");

      set((state) => ({
        experiments: state.experiments.map((e) =>
          e.id === experimentId ? { ...e, status: status as Experiment["status"] } : e
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update experiment";
      experimentLogger.error("updateExperimentStatus failed", error);
      set({ error: message });
    }
  },

  assignVariant: async (experimentId: string, variantId: string) => {
    try {
      await fetch("/api/experiments?action=assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experimentId, variant_id: variantId }),
      });

      set((state) => ({
        assignments: { ...state.assignments, [experimentId]: variantId },
      }));
    } catch (error) {
      experimentLogger.error("assignVariant failed", error);
    }
  },

  trackEvent: async (experimentId, variantId, eventType, eventValue, metadata) => {
    try {
      await fetch("/api/experiments?action=track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experiment_id: experimentId,
          variant_id: variantId,
          event_type: eventType,
          event_value: eventValue,
          metadata,
        }),
      });
    } catch (error) {
      experimentLogger.error("trackEvent failed", error);
    }
  },

  setSelectedExperiment: (experiment) => set({ selectedExperiment: experiment }),

  getVariantForExperiment: (experimentId: string) => {
    return get().assignments[experimentId] || null;
  },

  clearError: () => set({ error: null }),
}));
