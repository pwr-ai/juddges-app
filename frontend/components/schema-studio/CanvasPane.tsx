"use client";

import * as React from "react";
import { useState } from "react";
import { SchemaCanvas } from "./SchemaCanvas";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";
import { schemaService } from "@/lib/schema-editor/service";
import { exportSchemaAsJSON, exportSchemaAsYAML } from "@/lib/schema-editor/compiler";
import { toast } from "sonner";
import logger from "@/lib/logger";

const canvasPaneLogger = logger.child('canvas-pane');

/**
 * Props for the CanvasPane component
 */
interface CanvasPaneProps {
  /** Session identifier for the schema */
  sessionId: string;
  /** Optional collection ID */
  collectionId?: string;
  /** Callback to open preview dialog */
  onPreviewClick?: () => void;
}

/**
 * CanvasPane - Right pane of the Schema Studio with visual editor
 *
 * Provides:
 * - Schema metadata (name, description)
 * - Visual field list with cards
 * - Field editing capabilities
 * - Save/export actions
 * - Validation feedback
 *
 * @example
 * ```tsx
 * <CanvasPane
 *   sessionId="session-123"
 *   collectionId="collection-456"
 * />
 * ```
 */
export function CanvasPane({ sessionId, collectionId, onPreviewClick }: CanvasPaneProps) {
  // State for validation feedback
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Get state from zustand store
  const {
    fields,
    metadata,
    schemaId,
    isDirty,
    isSaving,
    setIsSaving,
    markClean,
    updateMetadata,
    setError,
  } = useSchemaEditorStore();

  const fieldCount = fields.length;

  /**
   * Handle schema save
   *
   * Compiles fields to JSON Schema, validates, and saves to extraction_schemas table.
   */
  const handleSave = async () => {
    canvasPaneLogger.info('Save initiated', {
      sessionId,
      schemaId,
      fieldCount,
    });

    // Validate we have required metadata
    if (!metadata.name || metadata.name.trim() === '') {
      toast.error('Schema name is required', {
        description: 'Please enter a name for your schema before saving.',
      });
      setValidationErrors(['Schema name is required']);
      return;
    }

    if (fields.length === 0) {
      toast.error('Cannot save empty schema', {
        description: 'Please add at least one field to your schema.',
      });
      setValidationErrors(['Schema must have at least one field']);
      return;
    }

    // Clear previous validation state
    setValidationErrors([]);
    setValidationWarnings([]);
    setSaveSuccess(false);

    // Set saving state
    setIsSaving(true);

    try {
      // Use schema service to save
      const result = await schemaService.saveSchema(schemaId, fields, metadata);

      if (!result.success) {
        // Save failed - show errors
        canvasPaneLogger.error('Save failed', { errors: result.errors });
        setValidationErrors(result.errors ?? []);
        setValidationWarnings(result.warnings ?? []);

        toast.error('Failed to save schema', {
          description: result.errors?.[0] || 'An unknown error occurred',
        });

        setError((result.errors ?? []).join('; '));
      } else {
        // Save successful
        canvasPaneLogger.info('Save successful', {
          schemaId: result.schema?.id,
          warningCount: result.warnings?.length ?? 0,
        });

        // Update metadata with new schema ID and last saved timestamp
        updateMetadata({
          last_saved: new Date().toISOString(),
        });

        // Mark as clean (no unsaved changes)
        markClean();

        // Show warnings if any
        if ((result.warnings?.length ?? 0) > 0) {
          setValidationWarnings(result.warnings ?? []);
        }

        // Show success message
        setSaveSuccess(true);
        toast.success('Schema saved successfully', {
          description: `${metadata.name} has been saved to the database.`,
        });

        // Clear success indicator after 3 seconds
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      canvasPaneLogger.error('Save exception', error);

      setValidationErrors([errorMessage]);
      toast.error('Save operation failed', {
        description: errorMessage,
      });

      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle schema export
   *
   * Compiles schema and downloads as JSON or YAML file.
   */
  const handleExport = async (format: "json" | "yaml") => {
    canvasPaneLogger.info('Export initiated', { format, fieldCount });

    if (fields.length === 0) {
      toast.error('Cannot export empty schema', {
        description: 'Please add at least one field to your schema.',
      });
      return;
    }

    try {
      // Prepare schema (compile and validate)
      const prepResult = await schemaService.prepareSchema(fields, metadata);

      if (!prepResult.success || !prepResult.compiledSchema) {
        toast.error('Export failed', {
          description: prepResult.errors[0] || 'Schema compilation failed',
        });
        setValidationErrors(prepResult.errors);
        return;
      }

      // Convert to requested format
      const content =
        format === 'json'
          ? exportSchemaAsJSON(fields, { pretty: true })
          : exportSchemaAsYAML(fields);

      // Create download
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/yaml',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${metadata.name || 'schema'}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Schema exported as ${format.toUpperCase()}`, {
        description: `Downloaded ${link.download}`,
      });

      canvasPaneLogger.info('Export successful', { format, fileName: link.download });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      canvasPaneLogger.error('Export exception', error);

      toast.error('Export failed', {
        description: errorMessage,
      });
    }
  };

  /**
   * Handle discard changes
   *
   * Resets to last saved state after confirmation.
   */
  const handleDiscard = () => {
    if (!isDirty) {
      toast.info('No changes to discard');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to discard all unsaved changes? This action cannot be undone.'
    );

    if (!confirmed) {
      return;
    }

    canvasPaneLogger.info('Discarding changes', { sessionId });

    // TODO: Implement reload from last saved state
    // For now, just mark as clean and show message
    markClean();
    setValidationErrors([]);
    setValidationWarnings([]);
    setSaveSuccess(false);

    toast.info('Changes discarded', {
      description: 'Schema has been reset to last saved state.',
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Validation feedback */}
      {saveSuccess && (
        <div className="px-6 pt-4">
          <Alert className="border-green-600 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription>
              <div className="text-sm text-green-900">
                <p className="font-medium">Schema saved successfully!</p>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="px-6 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm">
                <p className="font-medium mb-1">Validation Errors:</p>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {validationWarnings.length > 0 && (
        <div className="px-6 pt-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="text-sm">
                <p className="font-medium mb-1">Warnings:</p>
                <ul className="list-disc list-inside space-y-1">
                  {validationWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Main canvas with field list */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <SchemaCanvas sessionId={sessionId} onPreviewClick={onPreviewClick} />
      </div>
    </div>
  );
}

/**
 * TODO: Implementation checklist
 *
 * [x] Create base UI structure with header/canvas/footer
 * [x] Add schema metadata panel
 * [x] Add save actions component
 * [x] Display validation feedback
 * [ ] Connect to zustand store for state
 * [ ] Implement real-time validation
 * [ ] Add schema compilation logic
 * [ ] Implement save to Supabase
 * [ ] Add version history tracking
 * [ ] Implement export functionality (JSON/YAML)
 * [ ] Add confirmation dialogs for destructive actions
 * [ ] Implement test panel slide-out
 * [ ] Add keyboard shortcuts (Ctrl+S to save)
 * [ ] Show last saved timestamp
 */
