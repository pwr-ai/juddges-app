import { create } from "zustand";

interface TourState {
  /** Whether the onboarding product tour modal is open. */
  isOpen: boolean;
  /** Open the tour manually (e.g. from the Help page "Show tour" button). */
  openTour: () => void;
  /** Close the tour. */
  closeTour: () => void;
  /** Set the open state directly (used by the Dialog's onOpenChange). */
  setOpen: (open: boolean) => void;
}

/**
 * Lightweight store for re-triggering the onboarding tour from anywhere in the
 * app. First-visit auto-display is handled separately via Supabase user
 * metadata in {@link file://./../../components/legal/legal-compliance-wrapper.tsx};
 * this store only carries the manual "show tour again" signal so the Help page
 * button can reach the modal that lives inside the compliance wrapper.
 */
export const useTourStore = create<TourState>()((set) => ({
  isOpen: false,
  openTour: () => set({ isOpen: true }),
  closeTour: () => set({ isOpen: false }),
  setOpen: (open: boolean) => set({ isOpen: open }),
}));
