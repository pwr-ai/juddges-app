import { useState, useCallback } from "react";
import { toast } from "sonner";
import { schemaService } from "@/lib/schema-editor/service";
import { exportSchemaAsJSON, exportSchemaAsYAML } from "@/lib/schema-editor/compiler";
import type { SchemaStatus } from "@/types/extraction_schemas";
import type { SchemaMetadata, SchemaField } from "@/hooks/schema-editor/types";

interface UseSchemaSaveParams {
  user: { id: string } | null;
  schemaId: string | null;
  fields: SchemaField[];
  metadata: SchemaMetadata;
  isDirty: boolean;
  isSaving: boolean;
  sessionId: string;
  schemaStatus: SchemaStatus;
  isVerified: boolean;
  // Store actions
  setIsSaving: (saving: boolean) => void;
  markClean: () => void;
  setError: (error: string) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
  initializeSession: (sessionId: string, schemaId: string | null) => void;
  // Callback when ownership changes after first save
  onSchemaSaved: (opts: {
    ownerId: string;
    newSchemaId?: string;
    status?: SchemaStatus;
  }) => void;
}

export function useSchemaSave({
  user,
  schemaId,
  fields,
  metadata,
  isDirty,
  isSaving,
  sessionId,
  schemaStatus,
  isVerified,
  setIsSaving,
  markClean,
  setError,
  updateMetadata,
  initializeSession,
  onSchemaSaved,
}: UseSchemaSaveParams) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSchemaName, setSaveSchemaName] = useState("");
  const [saveSchemaDescription, setSaveSchemaDescription] = useState("");
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);

  const handleDirectSave = useCallback(async (): Promise<void> => {
    if (fields.length === 0) {
      toast.error("Cannot save empty schema", {
        description: "Please add at least one field to your schema.",
      });
      return;
    }

    const currentSchemaName = metadata?.name?.trim();
    if (!currentSchemaName) {
      toast.error("Schema name is required", {
        description: "Please enter a name for your schema before saving.",
      });
      return;
    }

    setIsSaving(true);

    try {
      const saveMetadata: SchemaMetadata & { status?: SchemaStatus } = {
        ...(metadata ?? { field_count: fields.length }),
        name: currentSchemaName,
        description: metadata?.description || undefined,
        status: schemaStatus,
        field_count: fields.length,
      };

      const result = await schemaService.saveSchema(schemaId, fields, saveMetadata);

      if (!result.success) {
        toast.error("Failed to save schema", {
          description: result.errors[0] || "An unknown error occurred",
        });
        setError(result.errors.join("; "));
      } else {
        updateMetadata({ last_saved: new Date().toISOString() });
        markClean();
        toast.success("Schema saved successfully", {
          description: `${currentSchemaName} has been saved to the database.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error("Save operation failed", { description: errorMessage });
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, [fields, metadata, schemaId, schemaStatus, setIsSaving, setError, updateMetadata, markClean]);

  const handleOpenSaveDialog = useCallback((): void => {
    if (schemaId && schemaId.trim() !== "" && fields.length > 0) {
      handleDirectSave();
      return;
    }

    setSaveDialogError(null);
    setSaveSchemaName(metadata?.name || "");
    setSaveSchemaDescription(metadata?.description || "");
    setShowSaveDialog(true);
  }, [schemaId, fields.length, metadata, handleDirectSave]);

  const handleSave = useCallback(async (): Promise<void> => {
    setSaveDialogError(null);

    if (!saveSchemaName || saveSchemaName.trim() === "") {
      setSaveDialogError("Schema name is required. Please enter a name for your schema before saving.");
      return;
    }

    if (fields.length === 0) {
      setSaveDialogError("Cannot save empty schema. Please add at least one field to your schema.");
      return;
    }

    updateMetadata({
      name: saveSchemaName.trim(),
      description: saveSchemaDescription.trim() || undefined,
    });

    setIsSaving(true);

    try {
      const saveMetadata: SchemaMetadata & { status?: SchemaStatus; is_verified?: boolean } = {
        ...(metadata ?? { field_count: fields.length }),
        name: saveSchemaName.trim(),
        description: saveSchemaDescription.trim() || undefined,
        status: schemaStatus,
        is_verified: isVerified,
        field_count: fields.length,
      };

      const result = await schemaService.saveSchema(schemaId, fields, saveMetadata);

      if (!result.success) {
        const errorMessage = result.errors[0] || "An unknown error occurred";
        setSaveDialogError(errorMessage);
        setError(result.errors.join("; "));
        toast.error("Failed to save schema", { description: errorMessage });
      } else {
        if (user?.id) {
          onSchemaSaved({
            ownerId: user.id,
            newSchemaId: !schemaId ? result.schemaId : undefined,
            status: (result.schema?.status as SchemaStatus) || schemaStatus,
          });
          if (!schemaId && result.schemaId) {
            initializeSession(sessionId, result.schemaId);
          }
        }
        if (result.schema?.status) {
          onSchemaSaved({
            ownerId: user?.id || "",
            status: result.schema.status as SchemaStatus,
          });
        }
        updateMetadata({ last_saved: new Date().toISOString() });
        markClean();
        setSaveDialogError(null);
        setShowSaveDialog(false);
        const finalStatus = result.schema?.status || schemaStatus;
        const statusMessage = finalStatus === "draft" ? " as draft" : "";
        toast.success("Schema saved successfully", {
          description: `${saveSchemaName.trim()} has been saved to the database${statusMessage}.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setSaveDialogError(errorMessage);
      setError(errorMessage);
      toast.error("Save operation failed", { description: errorMessage });
    } finally {
      setIsSaving(false);
    }
  }, [
    saveSchemaName,
    saveSchemaDescription,
    fields,
    metadata,
    schemaId,
    schemaStatus,
    isVerified,
    user,
    sessionId,
    setIsSaving,
    setError,
    updateMetadata,
    markClean,
    initializeSession,
    onSchemaSaved,
  ]);

  const handleExport = useCallback(
    async (format: "json" | "yaml"): Promise<void> => {
      if (fields.length === 0) {
        toast.error("Cannot export empty schema", {
          description: "Please add at least one field to your schema.",
        });
        return;
      }

      try {
        const prepResult = await schemaService.prepareSchema(fields, metadata);
        if (!prepResult.success || !prepResult.compiledSchema) {
          toast.error("Export failed", {
            description: prepResult.errors[0] || "Schema compilation failed",
          });
          return;
        }

        const content =
          format === "json"
            ? exportSchemaAsJSON(prepResult.compiledSchema, true)
            : exportSchemaAsYAML(prepResult.compiledSchema);

        const blob = new Blob([content], {
          type: format === "json" ? "application/json" : "text/yaml",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${metadata.name || "schema"}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`Schema exported as ${format.toUpperCase()}`, {
          description: `Downloaded ${link.download}`,
        });
      } catch (error) {
        toast.error("Export failed", {
          description: error instanceof Error ? error.message : "Export failed",
        });
      }
    },
    [fields, metadata]
  );

  const handleDiscard = useCallback((): void => {
    if (!isDirty) {
      toast.info("No changes to discard");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to discard all unsaved changes? This action cannot be undone."
    );

    if (confirmed) {
      markClean();
      toast.info("Changes discarded", {
        description: "Schema has been reset to last saved state.",
      });
    }
  }, [isDirty, markClean]);

  return {
    showSaveDialog,
    setShowSaveDialog,
    saveSchemaName,
    setSaveSchemaName,
    saveSchemaDescription,
    setSaveSchemaDescription,
    saveDialogError,
    setSaveDialogError,
    handleDirectSave,
    handleOpenSaveDialog,
    handleSave,
    handleExport,
    handleDiscard,
  };
}
