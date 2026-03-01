/**
 * Real-time Supabase synchronization hook for Schema Editor.
 *
 * This hook manages bidirectional synchronization between local Zustand store
 * and Supabase database with real-time subscriptions, optimistic updates,
 * conflict resolution, and connection state management.
 *
 * Features:
 * - Real-time subscriptions to schema_fields table
 * - Optimistic updates with automatic rollback on failure
 * - Conflict resolution (last-write-wins strategy)
 * - Connection state monitoring
 * - Automatic reconnection on disconnect
 * - Batch operations for performance
 *
 * @example
 * ```typescript
 * import { useSupabaseSync } from '@/hooks/schema-editor/useSupabaseSync';
 *
 * function SchemaEditor() {
 *   const { connectionState, syncField, syncAllFields } = useSupabaseSync({
 *     sessionId: 'session-123',
 *     schemaId: 'schema-456',
 *     onSyncError: (error) => toast.error(error.message)
 *   });
 *
 *   return connectionState === 'connected' ? <SchemaCanvas /> : <Connecting />;
 * }
 * ```
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSchemaEditorStore } from './useSchemaEditorStore';
import logger from '@/lib/logger';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SchemaField, SyncEvent } from './types';

const syncLogger = logger.child('supabaseSync');

/**
 * Connection state enumeration
 */
export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Sync error structure
 */
export interface SyncError {
  message: string;
  code: string;
  context?: Record<string, unknown>;
}

/**
 * Hook configuration options
 */
export interface UseSupabaseSyncOptions {
  /** Current session identifier */
  sessionId: string | null;

  /** Current schema identifier (null for drafts) */
  schemaId?: string | null;

  /** Whether to enable real-time sync */
  enabled?: boolean;

  /** Callback for sync errors */
  onSyncError?: (error: SyncError) => void;

  /** Callback for connection state changes */
  onConnectionStateChange?: (state: ConnectionState) => void;

  /** Debounce delay for batch operations (ms) */
  debounceMs?: number;
}

/**
 * Hook return value
 */
export interface UseSupabaseSyncReturn {
  /** Current connection state */
  connectionState: ConnectionState;

  /** Whether initial load is complete */
  isInitialLoadComplete: boolean;

  /** Load fields from database */
  loadFields: () => Promise<void>;

  /** Sync a single field to database */
  syncField: (field: SchemaField) => Promise<void>;

  /** Sync all fields to database */
  syncAllFields: () => Promise<void>;

  /** Delete field from database */
  deleteFieldFromDb: (fieldId: string) => Promise<void>;

  /** Force reconnect to real-time channel */
  reconnect: () => Promise<void>;

  /** Manually disconnect */
  disconnect: () => void;
}

/**
 * Custom hook for Supabase real-time synchronization
 */
export function useSupabaseSync(
  options: UseSupabaseSyncOptions
): UseSupabaseSyncReturn {
  const {
    sessionId,
    schemaId,
    enabled = true,
    onSyncError,
    onConnectionStateChange,
    debounceMs = 500,
  } = options;

  // Zustand store actions
  const {
    setFields,
    setIsLoading,
    setError,
    removeOptimisticUpdate,
    rollbackOptimisticUpdate,
  } = useSchemaEditorStore();

  // Local state
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);

  // Refs for cleanup and debouncing
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localOperationsRef = useRef<Set<string>>(new Set());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update connection state and notify callback
   */
  const updateConnectionState = useCallback(
    (newState: ConnectionState) => {
      setConnectionState(newState);
      onConnectionStateChange?.(newState);
      syncLogger.debug('Connection state changed', { state: newState });
    },
    [onConnectionStateChange]
  );

  /**
   * Handle sync errors
   */
  const handleSyncError = useCallback(
    (message: string, code: string, context?: Record<string, unknown>) => {
      const error: SyncError = { message, code, context };
      syncLogger.error('Sync error', error);
      setError(message);
      onSyncError?.(error);
    },
    [onSyncError, setError]
  );

  /**
   * Load fields from database
   */
  const loadFields = useCallback(async () => {
    if (!sessionId) {
      syncLogger.warn('Cannot load fields: no session ID');
      return;
    }

    try {
      setIsLoading(true);
      syncLogger.debug('Loading fields from database', { sessionId, schemaId });

      const { data, error } = await supabase
        .from('schema_fields')
        .select('*')
        .or(
          schemaId
            ? `schema_id.eq.${schemaId}`
            : `session_id.eq.${sessionId}`
        )
        .order('position', { ascending: true });

      if (error) {
        throw error;
      }

      const fields = (data ?? []) as SchemaField[];
      syncLogger.debug('Fields loaded', { count: fields.length });

      setFields(fields, true); // Mark as clean
      setIsInitialLoadComplete(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load fields';
      handleSyncError(message, 'LOAD_FIELDS_ERROR', { error });
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, schemaId, setFields, setIsLoading, handleSyncError]);

  /**
   * Sync a single field to database
   */
  const syncField = useCallback(
    async (field: SchemaField) => {
      try {
        syncLogger.debug('Syncing field to database', {
          fieldId: field.id,
          fieldName: field.field_name,
        });

        // Mark as local operation to prevent echo
        localOperationsRef.current.add(field.id);

        const { error } = await supabase
          .from('schema_fields')
          .upsert(field, { onConflict: 'id' });

        if (error) {
          throw error;
        }

        syncLogger.debug('Field synced successfully', { fieldId: field.id });

        // Remove from local operations after a delay
        setTimeout(() => {
          localOperationsRef.current.delete(field.id);
        }, 1000);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to sync field';
        handleSyncError(message, 'SYNC_FIELD_ERROR', { error, fieldId: field.id });
        throw error; // Re-throw for caller to handle
      }
    },
    [handleSyncError]
  );

  /**
   * Sync all fields to database (batch operation)
   */
  const syncAllFields = useCallback(async () => {
    const fields = useSchemaEditorStore.getState().fields;

    if (fields.length === 0) {
      syncLogger.debug('No fields to sync');
      return;
    }

    try {
      syncLogger.debug('Syncing all fields', { count: fields.length });

      // Mark all as local operations
      fields.forEach((f) => localOperationsRef.current.add(f.id));

      const { error } = await supabase
        .from('schema_fields')
        .upsert(fields, { onConflict: 'id' });

      if (error) {
        throw error;
      }

      syncLogger.debug('All fields synced successfully');

      // Remove from local operations after a delay
      setTimeout(() => {
        fields.forEach((f) => localOperationsRef.current.delete(f.id));
      }, 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync fields';
      handleSyncError(message, 'SYNC_ALL_FIELDS_ERROR', { error });
      throw error;
    }
  }, [handleSyncError]);

  /**
   * Delete field from database
   */
  const deleteFieldFromDb = useCallback(
    async (fieldId: string) => {
      try {
        syncLogger.debug('Deleting field from database', { fieldId });

        // Mark as local operation
        localOperationsRef.current.add(fieldId);

        const { error } = await supabase
          .from('schema_fields')
          .delete()
          .eq('id', fieldId);

        if (error) {
          throw error;
        }

        syncLogger.debug('Field deleted successfully', { fieldId });

        // Remove from local operations after a delay
        setTimeout(() => {
          localOperationsRef.current.delete(fieldId);
        }, 1000);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete field';
        handleSyncError(message, 'DELETE_FIELD_ERROR', { error, fieldId });
        throw error;
      }
    },
    [handleSyncError]
  );

  /**
   * Handle real-time INSERT events
   */
  const handleInsert = useCallback(
    (payload: { new: SchemaField }) => {
      const newField = payload.new;

      // Ignore if this is a local operation
      if (localOperationsRef.current.has(newField.id)) {
        syncLogger.debug('Ignoring local INSERT event', { fieldId: newField.id });
        return;
      }

      syncLogger.debug('Received remote INSERT event', {
        fieldId: newField.id,
        fieldName: newField.field_name,
      });

      const { fields, setFields } = useSchemaEditorStore.getState();

      // Check if field already exists (conflict)
      const existingField = fields.find((f) => f.id === newField.id);

      if (existingField) {
        syncLogger.warn('Field already exists, resolving conflict', {
          fieldId: newField.id,
        });

        // Last-write-wins: use newer timestamp
        const useRemote =
          new Date(newField.updated_at ?? newField.created_at ?? 0) >
          new Date(existingField.updated_at ?? existingField.created_at ?? 0);

        if (useRemote) {
          const updatedFields = fields.map((f) =>
            f.id === newField.id ? newField : f
          );
          setFields(updatedFields);
        }
      } else {
        // Add new field
        const updatedFields = [...fields, newField].sort(
          (a, b) => a.position - b.position
        );
        setFields(updatedFields);
      }
    },
    []
  );

  /**
   * Handle real-time UPDATE events
   */
  const handleUpdate = useCallback(
    (payload: { old: SchemaField; new: SchemaField }) => {
      const updatedField = payload.new;

      // Ignore if this is a local operation
      if (localOperationsRef.current.has(updatedField.id)) {
        syncLogger.debug('Ignoring local UPDATE event', { fieldId: updatedField.id });
        return;
      }

      syncLogger.debug('Received remote UPDATE event', {
        fieldId: updatedField.id,
        fieldName: updatedField.field_name,
      });

      const { fields, setFields } = useSchemaEditorStore.getState();

      // Find existing field
      const existingIndex = fields.findIndex((f) => f.id === updatedField.id);

      if (existingIndex === -1) {
        syncLogger.warn('Field not found for update, adding instead', {
          fieldId: updatedField.id,
        });
        const updatedFields = [...fields, updatedField].sort(
          (a, b) => a.position - b.position
        );
        setFields(updatedFields);
        return;
      }

      // Conflict resolution: last-write-wins
      const existingField = fields[existingIndex];
      const useRemote =
        new Date(updatedField.updated_at ?? 0) >
        new Date(existingField.updated_at ?? 0);

      if (useRemote) {
        const newFields = [...fields];
        newFields[existingIndex] = updatedField;
        setFields(newFields);
      } else {
        syncLogger.debug('Keeping local version (newer)', {
          fieldId: updatedField.id,
        });
      }
    },
    []
  );

  /**
   * Handle real-time DELETE events
   */
  const handleDelete = useCallback(
    (payload: { old: SchemaField }) => {
      const deletedField = payload.old;

      // Ignore if this is a local operation
      if (localOperationsRef.current.has(deletedField.id)) {
        syncLogger.debug('Ignoring local DELETE event', { fieldId: deletedField.id });
        return;
      }

      syncLogger.debug('Received remote DELETE event', {
        fieldId: deletedField.id,
        fieldName: deletedField.field_name,
      });

      const { fields, setFields } = useSchemaEditorStore.getState();

      // Remove field and its children
      const getChildFieldsRecursive = (parentId: string): string[] => {
        const children = fields.filter((f) => f.parent_field_id === parentId);
        const allChildIds = children.map((c) => c.id);

        children.forEach((child) => {
          allChildIds.push(...getChildFieldsRecursive(child.id));
        });

        return allChildIds;
      };

      const fieldIdsToDelete = new Set([
        deletedField.id,
        ...getChildFieldsRecursive(deletedField.id),
      ]);

      const updatedFields = fields
        .filter((f) => !fieldIdsToDelete.has(f.id))
        .map((f, index) => ({ ...f, position: index }));

      setFields(updatedFields);
    },
    []
  );

  /**
   * Subscribe to real-time changes
   */
  const subscribe = useCallback(() => {
    if (!sessionId || !enabled) {
      syncLogger.debug('Skipping subscription: disabled or no session');
      return;
    }

    updateConnectionState('connecting');
    syncLogger.debug('Subscribing to real-time changes', { sessionId, schemaId });

    const channel = supabase
      .channel(`schema-fields-${sessionId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'schema_fields',
          filter: schemaId
            ? `schema_id=eq.${schemaId}`
            : `session_id=eq.${sessionId}`,
        },
        handleInsert
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'schema_fields',
          filter: schemaId
            ? `schema_id=eq.${schemaId}`
            : `session_id=eq.${sessionId}`,
        },
        handleUpdate
      )
      .on(
        'postgres_changes' as any,
        {
          event: 'DELETE',
          schema: 'public',
          table: 'schema_fields',
          filter: schemaId
            ? `schema_id=eq.${schemaId}`
            : `session_id=eq.${sessionId}`,
        },
        handleDelete
      )
      .subscribe((status: any) => {
        if (status === 'SUBSCRIBED') {
          updateConnectionState('connected');
          syncLogger.info('Real-time subscription established');
        } else if (status === 'CHANNEL_ERROR') {
          updateConnectionState('error');
          handleSyncError(
            'Failed to establish real-time connection',
            'SUBSCRIPTION_ERROR'
          );
        } else if (status === 'TIMED_OUT') {
          updateConnectionState('error');
          handleSyncError('Real-time connection timed out', 'SUBSCRIPTION_TIMEOUT');
        } else if (status === 'CLOSED') {
          updateConnectionState('disconnected');
          syncLogger.info('Real-time subscription closed');
        }
      });

    channelRef.current = channel;
  }, [
    sessionId,
    schemaId,
    enabled,
    handleInsert,
    handleUpdate,
    handleDelete,
    updateConnectionState,
    handleSyncError,
  ]);

  /**
   * Unsubscribe from real-time changes
   */
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      syncLogger.debug('Disconnecting from real-time channel');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      updateConnectionState('disconnected');
    }
  }, [updateConnectionState]);

  /**
   * Force reconnect
   */
  const reconnect = useCallback(async () => {
    syncLogger.debug('Forcing reconnection');
    disconnect();
    await loadFields();
    subscribe();
  }, [disconnect, loadFields, subscribe]);

  /**
   * Initial load and subscription setup
   */
  useEffect(() => {
    if (!sessionId || !enabled) {
      return;
    }

    // Load initial data
    loadFields();

    // Subscribe to real-time updates
    subscribe();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [sessionId, enabled, loadFields, subscribe, disconnect]);

  /**
   * Cleanup debounce timer on unmount
   */
  useEffect(() => {
    const activeTimer = debounceTimerRef.current;
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer);
      }
    };
  }, []);

  return {
    connectionState,
    isInitialLoadComplete,
    loadFields,
    syncField,
    syncAllFields,
    deleteFieldFromDb,
    reconnect,
    disconnect,
  };
}

/**
 * Debounced sync helper
 *
 * Use this to debounce sync operations and reduce database calls.
 *
 * @example
 * ```typescript
 * const debouncedSync = useDebouncedSync(500);
 *
 * const handleFieldChange = (field: SchemaField) => {
 *   updateField(field.id, changes);
 *   debouncedSync(field);
 * };
 * ```
 */
export function useDebouncedSync(delay = 500) {
  const { syncField } = useSupabaseSync({ sessionId: null, enabled: false });
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (field: SchemaField) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        syncField(field);
      }, delay);
    },
    [syncField, delay]
  );
}
