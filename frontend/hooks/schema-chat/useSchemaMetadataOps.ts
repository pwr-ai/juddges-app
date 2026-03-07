import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { schemaService } from "@/lib/schema-editor/service";
import type { SchemaStatus } from "@/types/extraction_schemas";
import type { SchemaField, SchemaMetadata } from "@/hooks/schema-editor/types";

interface UseSchemaMetadataOpsParams {
  user: { id: string } | null;
  schemaId: string | null;
  fields: SchemaField[];
  metadata: SchemaMetadata;
  isSaving: boolean;
  sessionId: string;
  pathname: string;
  searchParams: URLSearchParams;
  router: {
    replace: (href: string, options?: { scroll?: boolean }) => void;
  };
  schemaName: string;
  // Store actions
  setIsSaving: (saving: boolean) => void;
  setFields: (fields: SchemaField[], markClean?: boolean) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
  initializeSession: (sessionId: string, schemaId: string | null) => void;
}

export function useSchemaMetadataOps({
  user,
  schemaId,
  fields,
  metadata,
  isSaving,
  sessionId,
  pathname,
  searchParams,
  router,
  schemaName,
  setIsSaving,
  setFields,
  updateMetadata,
  initializeSession,
}: UseSchemaMetadataOpsParams) {
  const [isVerified, setIsVerified] = useState(false);
  const [schemaOwnerId, setSchemaOwnerId] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>("draft");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isEditingSchemaName, setIsEditingSchemaName] = useState(false);
  const [tempSchemaName, setTempSchemaName] = useState("");
  const [isEditingSchemaDescription, setIsEditingSchemaDescription] = useState(false);
  const [tempSchemaDescription, setTempSchemaDescription] = useState("");

  // Sync temp name with schema name when not editing
  useEffect(() => {
    if (!isEditingSchemaName) {
      setTempSchemaName(schemaName);
    }
  }, [schemaName, isEditingSchemaName]);

  // Sync temp description with metadata description when not editing
  useEffect(() => {
    if (!isEditingSchemaDescription) {
      setTempSchemaDescription(metadata?.description || "");
    }
  }, [metadata?.description, isEditingSchemaDescription]);

  const isOwner = !schemaId || (!!schemaOwnerId && schemaOwnerId === user?.id);

  const handleToggleVerification = useCallback(async (): Promise<void> => {
    if (schemaId && !isOwner) {
      toast.error("Cannot verify schema", {
        description: "You can only verify schemas that you own. Duplicate this schema to create your own copy.",
      });
      return;
    }

    const newVerifiedStatus = !isVerified;
    setIsVerified(newVerifiedStatus);

    if (schemaId) {
      try {
        setIsSaving(true);
        const result = await schemaService.updateSchemaVerification(schemaId, newVerifiedStatus);

        if (!result.success) {
          setIsVerified(!newVerifiedStatus);
          toast.error("Failed to update verification status", {
            description: result.error || "Unknown error",
          });
        } else {
          toast.success(
            newVerifiedStatus ? "Schema marked as verified" : "Verification removed",
            { description: "Verification status has been updated." }
          );
        }
      } catch (error) {
        setIsVerified(!newVerifiedStatus);
        toast.error("Failed to update verification status", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      toast.info(
        newVerifiedStatus ? "Will be marked as verified when saved" : "Verification removed",
        { description: "Verification status will be saved with the schema." }
      );
    }
  }, [schemaId, isOwner, isVerified, setIsSaving]);

  const handleStatusChange = useCallback(
    async (newStatus: SchemaStatus): Promise<void> => {
      if (schemaId && !isOwner) {
        toast.error("Cannot change status", {
          description: "You can only change the status of schemas that you own.",
        });
        return;
      }

      const previousStatus = schemaStatus;
      setSchemaStatus(newStatus);

      if (schemaId) {
        try {
          setIsUpdatingStatus(true);
          const result = await schemaService.updateSchemaStatus(schemaId, newStatus);

          if (!result.success) {
            setSchemaStatus(previousStatus);
            toast.error("Failed to update status", {
              description: result.error || "Unknown error",
            });
          } else {
            const statusLabels: Record<SchemaStatus, string> = {
              draft: "Draft",
              published: "Published",
              review: "In Review",
              archived: "Archived",
            };
            toast.success(`Schema status changed to ${statusLabels[newStatus]}`, {
              description:
                newStatus === "published"
                  ? "This schema is now visible to all users."
                  : newStatus === "draft"
                    ? "This schema is now a draft."
                    : newStatus === "review"
                      ? "This schema is pending review."
                      : "This schema has been archived.",
            });
          }
        } catch (error) {
          setSchemaStatus(previousStatus);
          toast.error("Failed to update status", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          setIsUpdatingStatus(false);
        }
      } else {
        toast.info(`Status will be set to ${newStatus} when saved`, {
          description: "Status will be saved with the schema.",
        });
      }
    },
    [schemaId, isOwner, schemaStatus]
  );

  const handleSaveName = useCallback(
    async (newName: string): Promise<void> => {
      const trimmedName = newName.trim();
      if (!trimmedName) return;

      if (schemaId && !isOwner) {
        toast.error("Cannot update name", {
          description: "You can only update schemas that you own.",
        });
        return;
      }

      updateMetadata({ name: trimmedName });

      if (schemaId) {
        try {
          setIsSaving(true);
          const result = await schemaService.updateSchemaMetadata(schemaId, { name: trimmedName });
          if (!result.success) {
            toast.error("Failed to update name", {
              description: result.error || "Unknown error",
            });
          } else {
            toast.success("Schema name updated");
          }
        } catch (error) {
          toast.error("Failed to update name", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          setIsSaving(false);
        }
      }
    },
    [schemaId, isOwner, updateMetadata, setIsSaving]
  );

  const handleSaveDescription = useCallback(
    async (newDescription: string): Promise<void> => {
      const trimmedDescription = newDescription.trim() || undefined;

      if (schemaId && !isOwner) {
        toast.error("Cannot update description", {
          description: "You can only update schemas that you own.",
        });
        return;
      }

      updateMetadata({ description: trimmedDescription });

      if (schemaId) {
        try {
          setIsSaving(true);
          const result = await schemaService.updateSchemaMetadata(schemaId, {
            description: trimmedDescription || "",
          });
          if (!result.success) {
            toast.error("Failed to update description", {
              description: result.error || "Unknown error",
            });
          } else {
            toast.success("Schema description updated");
          }
        } catch (error) {
          toast.error("Failed to update description", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        } finally {
          setIsSaving(false);
        }
      }
    },
    [schemaId, isOwner, updateMetadata, setIsSaving]
  );

  const handleDuplicateSchema = useCallback((): void => {
    if (fields.length === 0) {
      toast.error("Cannot duplicate empty schema", {
        description: "The schema must have at least one field to duplicate.",
      });
      return;
    }

    const currentName = metadata?.name || "Untitled Schema";
    const newName = currentName.startsWith("Copy of ")
      ? `${currentName} (2)`
      : `Copy of ${currentName}`;

    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    initializeSession(newSessionId, null);

    setFields(
      fields.map((field) => ({
        ...field,
        session_id: newSessionId,
        id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      }))
    );

    updateMetadata({
      name: newName,
      description: metadata?.description,
      field_count: fields.length,
    });

    setSchemaOwnerId(user?.id || null);
    setSchemaStatus("draft");
    setIsVerified(false);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("schemaId");
    params.delete("duplicate");
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);

    toast.success("Schema duplicated", {
      description: `Created "${newName}" as a new draft. Save to keep your changes.`,
    });
  }, [
    fields,
    metadata,
    user,
    searchParams,
    pathname,
    router,
    initializeSession,
    setFields,
    updateMetadata,
  ]);

  return {
    isVerified,
    setIsVerified,
    schemaOwnerId,
    setSchemaOwnerId,
    schemaStatus,
    setSchemaStatus,
    isUpdatingStatus,
    isEditingSchemaName,
    setIsEditingSchemaName,
    tempSchemaName,
    setTempSchemaName,
    isEditingSchemaDescription,
    setIsEditingSchemaDescription,
    tempSchemaDescription,
    setTempSchemaDescription,
    isOwner,
    handleToggleVerification,
    handleStatusChange,
    handleSaveName,
    handleSaveDescription,
    handleDuplicateSchema,
  };
}
