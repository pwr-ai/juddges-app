/**
 * Hook for undo/redo functionality in the schema editor.
 *
 * Provides:
 * - undo() and redo() functions
 * - canUndo and canRedo state
 * - Keyboard shortcuts (Ctrl+Z for undo, Ctrl+Shift+Z or Ctrl+Y for redo)
 * - History state information
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { undo, redo, canUndo, canRedo } = useUndoRedo();
 *
 *   return (
 *     <div>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </div>
 *   );
 * }
 * ```
 */

import * as React from 'react';
import { useEffect, useCallback, useMemo, useState } from 'react';
import { useSchemaEditorStore } from './useSchemaEditorStore';
import type { SchemaField } from './types';

/**
 * Temporal state shape (matches partialize in store)
 */
interface TemporalState {
  fields: SchemaField[];
}

/**
 * Temporal store state interface
 */
interface TemporalStoreState {
  pastStates: TemporalState[];
  futureStates: TemporalState[];
  undo: (steps?: number) => void;
  redo: (steps?: number) => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;
  isTracking: boolean;
}

/**
 * Hook return type
 */
interface UseUndoRedoReturn {
  /** Undo the last action */
  undo: () => void;
  /** Redo the last undone action */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of undo states available */
  pastStatesCount: number;
  /** Number of redo states available */
  futureStatesCount: number;
  /** Clear all history */
  clear: () => void;
  /** Pause tracking (useful during batch operations) */
  pause: () => void;
  /** Resume tracking */
  resume: () => void;
  /** Whether tracking is paused */
  isPaused: boolean;
}

/**
 * Custom hook for undo/redo functionality with keyboard shortcuts.
 *
 * @param enableKeyboardShortcuts - Whether to enable keyboard shortcuts (default: true)
 * @returns Undo/redo controls and state
 */
export function useUndoRedo(enableKeyboardShortcuts = true): UseUndoRedoReturn {
  // Access the temporal store attached to the schema editor store
  // The temporal middleware adds a .temporal property to the store
  const temporalStore = (useSchemaEditorStore as any).temporal;
  const { markDirty } = useSchemaEditorStore();

  // Get temporal state using the temporal store's getState
  const getTemporalState = useCallback((): TemporalStoreState => {
    return temporalStore?.getState() ?? {
      pastStates: [],
      futureStates: [],
      undo: () => {},
      redo: () => {},
      clear: () => {},
      pause: () => {},
      resume: () => {},
      isTracking: true,
    };
  }, [temporalStore]);

  // Subscribe to temporal store changes
  const [temporalState, setTemporalState] = useState<TemporalStoreState>(getTemporalState);

  // Subscribe to temporal store updates
  useEffect(() => {
    if (!temporalStore) return;

    // Subscribe to temporal store
    const unsubscribe = temporalStore.subscribe((state: TemporalStoreState) => {
      setTemporalState(state);
    });

    return () => {
      unsubscribe();
    };
  }, [temporalStore]);

  // Computed state
  const canUndo = useMemo(() => temporalState.pastStates.length > 0, [temporalState.pastStates]);
  const canRedo = useMemo(() => temporalState.futureStates.length > 0, [temporalState.futureStates]);

  /**
   * Perform undo operation
   */
  const undo = useCallback(() => {
    if (!canUndo) return;

    temporalState.undo();
    markDirty();
  }, [canUndo, temporalState, markDirty]);

  /**
   * Perform redo operation
   */
  const redo = useCallback(() => {
    if (!canRedo) return;

    temporalState.redo();
    markDirty();
  }, [canRedo, temporalState, markDirty]);

  /**
   * Clear history
   */
  const clear = useCallback(() => {
    temporalState.clear();
  }, [temporalState]);

  /**
   * Pause tracking
   */
  const pause = useCallback(() => {
    temporalState.pause();
  }, [temporalState]);

  /**
   * Resume tracking
   */
  const resume = useCallback(() => {
    temporalState.resume();
  }, [temporalState]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Skip if typing in input fields (allow browser default undo/redo)
      if (isInputField) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      // Undo: Ctrl+Z (or Cmd+Z on Mac)
      if (ctrlKey && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      // Redo: Ctrl+Shift+Z or Ctrl+Y (or Cmd+Shift+Z / Cmd+Y on Mac)
      if (ctrlKey && (
        (event.key === 'z' && event.shiftKey) ||
        event.key === 'y'
      )) {
        event.preventDefault();
        redo();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enableKeyboardShortcuts, undo, redo]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    pastStatesCount: temporalState.pastStates.length,
    futureStatesCount: temporalState.futureStates.length,
    clear,
    pause,
    resume,
    isPaused: !temporalState.isTracking,
  };
}

/**
 * Hook to use undo/redo within a specific scope.
 * Automatically clears history when the component unmounts.
 *
 * @param enableKeyboardShortcuts - Whether to enable keyboard shortcuts
 * @returns Undo/redo controls and state
 */
export function useScopedUndoRedo(enableKeyboardShortcuts = true): UseUndoRedoReturn {
  const undoRedo = useUndoRedo(enableKeyboardShortcuts);

  useEffect(() => {
    // Clear history on mount to start fresh
    undoRedo.clear();

    // Clear history on unmount
    return () => {
      undoRedo.clear();
    };
  }, []);

  return undoRedo;
}

export default useUndoRedo;
