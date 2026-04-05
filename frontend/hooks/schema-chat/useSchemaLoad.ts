import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { schemaService } from "@/lib/schema-editor/service";
import type { SchemaSaveResponse } from "@/lib/schema-editor/service";
import { parseImportTextToSchema } from "@/lib/schema-chat/import-parser";
import type { SchemaStatus } from "@/types/extraction_schemas";
import type { SchemaField } from "@/hooks/schema-editor/types";
import { logger } from "@/lib/logger";

interface UseSchemaLoadParams {
  user: { id: string } | null;
  sessionId: string;
  isDirty: boolean;
  searchParams: URLSearchParams;
  pathname: string;
  router: {
    replace: (href: string, options?: { scroll?: boolean }) => void;
  };
  isInitializing: boolean;
  // Store actions
  initializeSession: (sessionId: string, schemaId: string | null) => void;
  setFields: (fields: SchemaField[], markClean?: boolean) => void;
  updateMetadata: (metadata: Record<string, unknown>) => void;
  // Callbacks to update parent state
  onSchemaLoaded: (opts: {
    selectedSchemaId: string;
    isVerified: boolean;
    schemaOwnerId: string | null;
    schemaStatus: SchemaStatus;
  }) => void;
  onSchemaReset: () => void;
}

export function useSchemaLoad({
  user,
  sessionId,
  isDirty,
  searchParams,
  pathname,
  router,
  isInitializing,
  initializeSession,
  setFields,
  updateMetadata,
  onSchemaLoaded,
  onSchemaReset,
}: UseSchemaLoadParams) {
  const [savedSchemas, setSavedSchemas] = useState<SchemaSaveResponse[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState("");
  const [schemaSearchQuery, setSchemaSearchQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [importTab, setImportTab] = useState<"load" | "import">("load");
  const [showSchemaPopover, setShowSchemaPopover] = useState(false);
  const [showLoadSchemaDialog, setShowLoadSchemaDialog] = useState(false);
  const [pendingLoadSchemaId, setPendingLoadSchemaId] = useState<string | null>(null);
  const [hasLoadedFromUrl, setHasLoadedFromUrl] = useState(false);

  const fetchSavedSchemas = useCallback(async (): Promise<void> => {
    setIsLoadingSchemas(true);
    try {
      const schemas = await schemaService.listSchemas();
      setSavedSchemas(schemas as any);
    } catch (error) {
      logger.error("Error fetching schemas: ", error);
      toast.error("Failed to load schemas");
    } finally {
      setIsLoadingSchemas(false);
    }
  }, []);

  const performLoadSchema = useCallback(
    async (loadSchemaId: string): Promise<void> => {
      if (!loadSchemaId || loadSchemaId.trim() === "") return;

      try {
        toast.loading("Loading schema...", { id: "load-schema" });
        const result = await schemaService.loadSchema(loadSchemaId);

        if (!result.success || !result.fields || !result.schema) {
          toast.error("Failed to load schema", {
            id: "load-schema",
            description: result.error || "Unknown error",
          });
          return;
        }

        const isDuplicate = searchParams.get("duplicate") === "true";
        const isAnotherUserSchema =
          result.schema.userId && result.schema.userId !== user?.id;
        const shouldSaveAsNew = Boolean(isDuplicate || isAnotherUserSchema);
        const schemaName = shouldSaveAsNew
          ? `Copy of ${result.schema.name}`
          : result.schema.name;

        const currentSessionId =
          sessionId ||
          `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const schemaIdToUse = shouldSaveAsNew ? null : result.schema.id;
        initializeSession(currentSessionId, schemaIdToUse);

        const fieldsWithSession = result.fields.map((field) => ({
          ...field,
          session_id: currentSessionId,
        }));
        setFields(fieldsWithSession, true);

        updateMetadata({
          name: schemaName,
          description: result.schema.description || undefined,
          field_count: result.fields.length,
          last_saved: isAnotherUserSchema
            ? undefined
            : result.schema.updatedAt,
        });

        onSchemaLoaded({
          selectedSchemaId: shouldSaveAsNew ? "" : loadSchemaId,
          isVerified: shouldSaveAsNew
            ? false
            : result.schema.is_verified || false,
          schemaOwnerId: result.schema.userId || null,
          schemaStatus: shouldSaveAsNew
            ? "draft"
            : ((result.schema.status as SchemaStatus) || "published"),
        });

        if (shouldSaveAsNew) {
          setSelectedSchemaId("");
          const params = new URLSearchParams(searchParams.toString());
          params.delete("schemaId");
          params.delete("duplicate");
          router.replace(
            `${pathname}${params.toString() ? `?${params.toString()}` : ""}`,
            { scroll: false }
          );
        } else {
          setSelectedSchemaId(loadSchemaId);
          const params = new URLSearchParams(searchParams.toString());
          params.set("schemaId", loadSchemaId);
          params.delete("duplicate");
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }

        toast.success(
          shouldSaveAsNew
            ? "Schema copied successfully"
            : "Schema loaded successfully",
          {
            id: "load-schema",
            description: shouldSaveAsNew
              ? `Copied "${result.schema.name}" with ${result.fields.length} fields. You can now edit and save as your own.`
              : `Loaded "${result.schema.name}" with ${result.fields.length} fields`,
          }
        );

        setShowSchemaPopover(false);
        setShowLoadSchemaDialog(false);
        setPendingLoadSchemaId(null);
      } catch (error) {
        logger.error("Error loading schema: ", error);
        toast.error("Failed to load schema", {
          id: "load-schema",
          description:
            error instanceof Error ? error.message : "Unknown error",
        });
        setShowLoadSchemaDialog(false);
        setPendingLoadSchemaId(null);
      }
    },
    [
      user,
      sessionId,
      searchParams,
      pathname,
      router,
      initializeSession,
      setFields,
      updateMetadata,
      onSchemaLoaded,
    ]
  );

  const handleLoadSchema = useCallback(
    async (loadSchemaId: string): Promise<void> => {
      if (!loadSchemaId || loadSchemaId.trim() === "") return;

      if (isDirty) {
        setPendingLoadSchemaId(loadSchemaId);
        setShowLoadSchemaDialog(true);
        return;
      }

      await performLoadSchema(loadSchemaId);
    },
    [isDirty, performLoadSchema]
  );

  const handleImportFromJSON = useCallback(async (): Promise<void> => {
    if (!importText.trim()) {
      toast.error("Please paste schema JSON to import");
      return;
    }

    try {
      toast.loading("Importing schema...", { id: "import-schema" });
      const parsed = parseImportTextToSchema(importText);

      const currentSessionId =
        sessionId ||
        `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      initializeSession(currentSessionId, null);
      onSchemaReset();

      const fieldsWithSession = parsed.fields.map((field) => ({
        ...field,
        session_id: currentSessionId,
      }));
      setFields(fieldsWithSession, true);

      updateMetadata({
        name: parsed.name || "Imported Schema",
        description: parsed.description || undefined,
        field_count: parsed.fields.length,
        last_saved: undefined,
      });

      setImportText("");
      setShowSchemaPopover(false);

      toast.success("Schema imported successfully", {
        id: "import-schema",
        description: `Imported "${parsed.name || "Imported Schema"}" with ${parsed.fields.length} fields`,
      });
    } catch (error) {
      toast.error("Failed to import schema", {
        id: "import-schema",
        description:
          error instanceof Error ? error.message : "Invalid JSON format",
      });
    }
  }, [importText, sessionId, initializeSession, setFields, updateMetadata, onSchemaReset]);

  const cancelLoadSchema = useCallback(() => {
    setShowLoadSchemaDialog(false);
    setPendingLoadSchemaId(null);
  }, []);

  const confirmLoadSchema = useCallback(() => {
    if (pendingLoadSchemaId) {
      performLoadSchema(pendingLoadSchemaId);
    }
  }, [pendingLoadSchemaId, performLoadSchema]);

  // Fetch schemas when popover opens
  useEffect(() => {
    if (showSchemaPopover && user) {
      fetchSavedSchemas();
    }
  }, [showSchemaPopover, user, fetchSavedSchemas]);

  // Load schema from URL parameter on mount
  useEffect(() => {
    if (isInitializing || !sessionId || hasLoadedFromUrl || !user) return;

    const urlSchemaId =
      searchParams.get("schemaId") || searchParams.get("schema");
    if (urlSchemaId && urlSchemaId.trim() !== "") {
      setHasLoadedFromUrl(true);
      handleLoadSchema(urlSchemaId.trim());
    } else {
      setHasLoadedFromUrl(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing, sessionId, hasLoadedFromUrl, user, searchParams]);

  return {
    // State
    savedSchemas,
    isLoadingSchemas,
    selectedSchemaId,
    setSelectedSchemaId,
    schemaSearchQuery,
    setSchemaSearchQuery,
    importText,
    setImportText,
    importTab,
    setImportTab,
    showSchemaPopover,
    setShowSchemaPopover,
    showLoadSchemaDialog,
    pendingLoadSchemaId,
    // Handlers
    fetchSavedSchemas,
    handleLoadSchema,
    performLoadSchema,
    handleImportFromJSON,
    cancelLoadSchema,
    confirmLoadSchema,
  };
}
