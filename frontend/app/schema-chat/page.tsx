"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SchemaStudioLayout } from "@/components/schema-studio/SchemaStudioLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FolderOpen, Settings, X, Database, Edit2, Check, Eye, FileCode, Sparkles, RefreshCw, Save, Plus, Download, Upload, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";
import { schemaService } from "@/lib/schema-editor/service";
import type { SchemaSaveResponse } from "@/lib/schema-editor/service";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/lib/styles/components/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageContainer, SecondaryButton, AccentButton, IconButton, BaseCard, LightCard, SectionHeader, SearchableDropdownButton, PrimaryButton, VerifiedBadge, SchemaStatusBadge } from "@/lib/styles/components";
import { SchemaStatusSelector } from "@/lib/styles/components/schema-status-selector";
import type { SchemaStatus } from "@/types/extraction_schemas";
import { Label } from "@/components/ui/label";
import { SaveActions } from "@/components/schema-studio/SaveActions";
import { exportSchemaAsJSON, exportSchemaAsYAML, compileSchemaFieldsToJSONSchema } from "@/lib/schema-editor/compiler";
import { ExtractionDataViewer } from "@/lib/styles/components/extraction/ExtractionDataViewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import { TabSelector } from "@/components/schema-studio/TabSelector";
import { cn } from "@/lib/utils";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";

interface Collection {
  id: string;
  name: string;
  document_count?: number;
}

export default function SchemaStudioPage(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedCollection, setSelectedCollection] = useState<string>("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [agentMode, setAgentMode] = useState<"rabbit" | "thinking">("rabbit");
  const [showSchemaPopover, setShowSchemaPopover] = useState(false);
  const [savedSchemas, setSavedSchemas] = useState<SchemaSaveResponse[]>([]);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");
  const [schemaSearchQuery, setSchemaSearchQuery] = useState<string>("");
  const [importText, setImportText] = useState<string>("");
  const [importTab, setImportTab] = useState<"load" | "import">("load");
  const [hasLoadedFromUrl, setHasLoadedFromUrl] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Array<{ id: string; name: string; savedAt: string; data: any }>>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectName, setProjectName] = useState<string>("");
  const [isEditingSchemaName, setIsEditingSchemaName] = useState(false);
  const [tempSchemaName, setTempSchemaName] = useState<string>("");
  const [isEditingSchemaDescription, setIsEditingSchemaDescription] = useState(false);
  const [tempSchemaDescription, setTempSchemaDescription] = useState<string>("");
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showNewSchemaDialog, setShowNewSchemaDialog] = useState(false);
  const [showLoadSchemaDialog, setShowLoadSchemaDialog] = useState(false);
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [pendingLoadSchemaId, setPendingLoadSchemaId] = useState<string | null>(null);
  const [pendingNavigationUrl, setPendingNavigationUrl] = useState<string | null>(null);
  const [saveSchemaName, setSaveSchemaName] = useState<string>("");
  const [saveSchemaDescription, setSaveSchemaDescription] = useState<string>("");
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [schemaOwnerId, setSchemaOwnerId] = useState<string | null>(null);
  const [saveDialogError, setSaveDialogError] = useState<string | null>(null);
  const [isNewOrDuplicatedSchema, setIsNewOrDuplicatedSchema] = useState<boolean>(false);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus>('draft');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Store original router methods to bypass interception when confirming navigation
  const originalRouterMethodsRef = useRef<{
    push: typeof router.push;
    replace: typeof router.replace;
    back: typeof router.back;
  } | null>(null);

  // Get store methods
  const { 
    setFields, 
    updateMetadata, 
    initializeSession, 
    updateField,
    schemaId,
    fields,
    metadata,
    isDirty,
    isSaving,
    setIsSaving,
    markClean,
    setError,
  } = useSchemaEditorStore();

  const schemaName = metadata?.name || "Untitled Schema Project";
  const displayName = projectName.trim() || schemaName;

  // Prevent page reload when there are unsaved changes
  useUnsavedChangesWarning(
    isDirty,
    "You have unsaved changes to your schema. Are you sure you want to leave?"
  );

  // Initialize router methods ref on mount
  useEffect(() => {
    if (!originalRouterMethodsRef.current) {
      originalRouterMethodsRef.current = {
        push: router.push,
        replace: router.replace,
        back: router.back,
      };
    }
  }, [router]);

  // Intercept Next.js router navigation when there are unsaved changes
  useEffect(() => {
    if (!isDirty) {
      return;
    }

    // Intercept Link clicks
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;
      
      if (!link) return;
      
      const href = link.getAttribute('href');
      if (!href) return;
      
      // Skip if it's the same page or external link
      if (href === pathname || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {
        return;
      }
      
      // Skip if it's a download link
      if (link.hasAttribute('download')) {
        return;
      }
      
      // Prevent default navigation
      e.preventDefault();
      e.stopPropagation();
      
      // Show confirmation dialog
      setPendingNavigationUrl(href);
      setShowNavigationDialog(true);
    };

    // Intercept router.push calls by patching the router
    const originalPush = router.push;
    const originalReplace = router.replace;
    const originalBack = router.back;

    // Store original methods in ref so they can be accessed in handleConfirmNavigation
    originalRouterMethodsRef.current = {
      push: originalPush,
      replace: originalReplace,
      back: originalBack,
    };

    const interceptedPush = (href: string, options?: { scroll?: boolean }) => {
      // Check if navigating to a different path
      if (href !== pathname && isDirty) {
        setPendingNavigationUrl(href);
        setShowNavigationDialog(true);
        return;
      }
      
      // Same path or no unsaved changes, proceed normally
      return originalPush(href, options);
    };

    const interceptedReplace = (href: string, options?: { scroll?: boolean }) => {
      // Check if navigating to a different path
      if (href !== pathname && isDirty) {
        setPendingNavigationUrl(href);
        setShowNavigationDialog(true);
        return;
      }
      
      // Same path or no unsaved changes, proceed normally
      return originalReplace(href, options);
    };

    const interceptedBack = () => {
      if (isDirty) {
        setPendingNavigationUrl(null);
        setShowNavigationDialog(true);
        return;
      }
      
      return originalBack();
    };

    // Patch router methods
    (router as any).push = interceptedPush;
    (router as any).replace = interceptedReplace;
    (router as any).back = interceptedBack;

    // Add click listener for Link components
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      // Restore original methods
      (router as any).push = originalPush;
      (router as any).replace = originalReplace;
      (router as any).back = originalBack;
      
      // Remove click listener
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [isDirty, router, pathname]);

  // Handle confirmed navigation
  const handleConfirmNavigation = () => {
    // Use original router methods to bypass interception
    const originalMethods = originalRouterMethodsRef.current;
    if (!originalMethods) {
      // Fallback to router methods if refs not set (shouldn't happen)
      if (pendingNavigationUrl) {
        router.push(pendingNavigationUrl);
      } else {
        router.back();
      }
    } else {
      if (pendingNavigationUrl) {
        originalMethods.push(pendingNavigationUrl);
      } else {
        originalMethods.back();
      }
    }
    setShowNavigationDialog(false);
    setPendingNavigationUrl(null);
  };

  // Don't auto-sync save dialog fields with metadata - only sync when dialog opens

  // Generate placeholder data for preview from current schema fields
  const generatePreviewData = React.useMemo(() => {
    if (fields.length === 0) return {};

    // Compile fields to JSON Schema
    const compilationResult = compileSchemaFieldsToJSONSchema(fields, {
      name: schemaName,
      description: metadata?.description,
    });

    if (!compilationResult.success || !compilationResult.schema) {
      return {};
    }

    const schema = compilationResult.schema;
    const placeholderData: Record<string, any> = {};

    const generatePlaceholder = (fieldName: string, fieldDef: any): any => {
      if (!fieldDef || typeof fieldDef !== 'object') return null;

      const fieldType = fieldDef.type || 'string';
      const fieldNameFormatted = fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      // Check if it's a date field
      if (fieldDef.format === 'date' || (fieldDef.type === 'string' && fieldDef.format === 'date')) {
        return '2024-01-15';
      }

      // Check if it's a datetime field
      if (fieldDef.format === 'date-time' || fieldDef.format === 'datetime') {
        return '2024-01-15T10:00:00Z';
      }

      // Check if it's an email field
      if (fieldDef.format === 'email' || fieldType === 'email') {
        return 'example@domain.com';
      }

      // Check if it's a URL field
      if (fieldDef.format === 'uri' || fieldDef.format === 'url' || fieldType === 'url') {
        return 'https://example.com';
      }

      // Check for enum
      if (fieldDef.enum && Array.isArray(fieldDef.enum) && fieldDef.enum.length > 0) {
        return fieldDef.enum[0];
      }

      switch (fieldType) {
        case 'string':
          // Use default if available
          if (fieldDef.default !== undefined && fieldDef.default !== null) {
            return fieldDef.default;
          }
          // Generate better sample text based on field name
          const fieldNameLower = fieldName.toLowerCase();
          if (fieldNameLower.includes('name') || fieldNameLower.includes('nazwa')) {
            return 'John Doe';
          }
          if (fieldNameLower.includes('email') || fieldNameLower.includes('mail')) {
            return 'example@email.com';
          }
          if (fieldNameLower.includes('phone') || fieldNameLower.includes('telefon')) {
            return '+48 123 456 789';
          }
          if (fieldNameLower.includes('address') || fieldNameLower.includes('adres')) {
            return '123 Main Street, Warsaw';
          }
          if (fieldNameLower.includes('question') || fieldNameLower.includes('pytanie')) {
            return 'What is the tax rate for this transaction?';
          }
          if (fieldNameLower.includes('answer') || fieldNameLower.includes('odpowiedz')) {
            return 'The tax rate is 23% according to current regulations.';
          }
          if (fieldNameLower.includes('description') || fieldNameLower.includes('opis')) {
            return 'Detailed description of the field content';
          }
          if (fieldNameLower.includes('note') || fieldNameLower.includes('uwaga')) {
            return 'Additional notes or comments';
          }
          if (fieldNameLower.includes('comment') || fieldNameLower.includes('komentarz')) {
            return 'User comment or remark';
          }
          if (fieldNameLower.includes('title') || fieldNameLower.includes('tytul')) {
            return 'Document Title';
          }
          if (fieldNameLower.includes('number') || fieldNameLower.includes('numer')) {
            return '12345';
          }
          if (fieldNameLower.includes('code') || fieldNameLower.includes('kod')) {
            return 'ABC123';
          }
          if (fieldNameLower.includes('id') || fieldNameLower.includes('identyfikator')) {
            return 'ID-2024-001';
          }
          if (fieldNameLower.includes('status')) {
            return 'Active';
          }
          if (fieldNameLower.includes('type')) {
            return 'Standard';
          }
          // Default for other string fields
          return 'Example text value';

        case 'number':
        case 'integer':
          if (fieldDef.default !== undefined && fieldDef.default !== null) {
            return fieldDef.default;
          }
          return 123;

        case 'boolean':
          if (fieldDef.default !== undefined && fieldDef.default !== null) {
            return fieldDef.default;
          }
          return true;

        case 'array':
          if (fieldDef.items) {
            const items = fieldDef.items;
            if (items.type === 'object' && items.properties) {
              // Array of objects
              const sampleItem: Record<string, any> = {};
              Object.entries(items.properties).forEach(([itemFieldName, itemFieldDef]: [string, any]) => {
                sampleItem[itemFieldName] = generatePlaceholder(itemFieldName, itemFieldDef);
              });
              return [sampleItem];
            } else if (items.type === 'string') {
              return ['Item 1', 'Item 2', 'Item 3'];
            } else if (items.type === 'number') {
              return [1, 2, 3];
            }
          }
          return ['Sample Item 1', 'Sample Item 2'];

        case 'object':
          if (fieldDef.properties) {
            const nestedObj: Record<string, any> = {};
            Object.entries(fieldDef.properties).forEach(([nestedFieldName, nestedFieldDef]: [string, any]) => {
              nestedObj[nestedFieldName] = generatePlaceholder(nestedFieldName, nestedFieldDef);
            });
            return nestedObj;
          }
          return { sample: 'value' };

        default:
          return `Sample ${fieldNameFormatted}`;
      }
    };

    // Generate placeholders for all top-level fields
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([fieldName, fieldDef]: [string, any]) => {
        placeholderData[fieldName] = generatePlaceholder(fieldName, fieldDef);
      });
    }

    return placeholderData;
  }, [fields, schemaName, metadata?.description]);


  const fetchCollections = async (): Promise<void> => {
    try {
      const response = await fetch("/api/collections");
      if (!response.ok) throw new Error("Failed to fetch collections");
      const data = await response.json();
      setCollections(data);
    } catch (error) {
      console.error("Error fetching collections:", error);
      toast.error("Failed to load collections");
    }
  };

  const handleCollectionChange = (value: string): void => {
    setSelectedCollection(value);
    if (value === "none") {
      toast.success("Schema is not scoped to any collection");
    } else {
      const collection = collections.find((c) => c.id === value);
      toast.success(`Schema scoped to: ${collection?.name}`);
    }
  };

  // Prepare collection options for SearchableDropdownButton
  const collectionOptions = React.useMemo(() => {
    const options = [
      {
        value: "none",
        label: "No Collection",
        description: "Schema applies to all documents",
      },
      ...collections.map((collection) => ({
        value: collection.id,
        label: collection.name,
        description: collection.document_count !== undefined 
          ? `${collection.document_count} documents`
          : undefined,
      })),
    ];
    return options;
  }, [collections]);

  const handleAgentModeChange = (mode: "rabbit" | "thinking"): void => {
    setAgentMode(mode);
    toast.success(`Agent mode changed to: ${mode === "rabbit" ? "Rabbit (Fast)" : "Thinking (Advanced)"}`);
  };

  const handleNewSession = (): void => {
    // Check if there are unsaved changes
    if (isDirty) {
      setShowNewSchemaDialog(true);
      return;
    }
    
    // No unsaved changes, proceed directly
    createNewSchema();
  };

  const createNewSchema = (): void => {
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    setSessionId(newSessionId);
    initializeSession(newSessionId, null);
    setSelectedSchemaId("");
    setIsVerified(false); // Reset verification status for new schema
    setSchemaOwnerId(null); // Reset owner ID for new schema
    setIsNewOrDuplicatedSchema(true); // Mark as new schema (will be saved as draft)
    setSchemaStatus('draft'); // Set status to draft for new schemas
    setShowNewSchemaDialog(false);
    
    // Remove schemaId from URL when creating new schema
    const params = new URLSearchParams(searchParams.toString());
    params.delete('schemaId');
    params.delete('schema'); // Also remove alternative parameter
    params.delete('duplicate'); // Remove duplicate parameter if present
    const newSearch = params.toString();
    router.replace(newSearch ? `${pathname}?${newSearch}` : pathname, { scroll: false });
    
    toast.success("New schema session started");
  };

  const fetchSavedSchemas = async (): Promise<void> => {
    setIsLoadingSchemas(true);
    try {
      const result = await schemaService.listSchemas();
      if (result.success && result.schemas) {
        setSavedSchemas(result.schemas);
      } else {
        toast.error('Failed to load schemas', {
          description: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      console.error('Error fetching schemas:', error);
      toast.error('Failed to load schemas');
    } finally {
      setIsLoadingSchemas(false);
    }
  };

  const handleLoadSchema = async (loadSchemaId: string): Promise<void> => {
    if (!loadSchemaId || loadSchemaId.trim() === '') {
      console.warn('handleLoadSchema: Invalid schemaId provided');
      return;
    }

    // Check if there are unsaved changes (whether loading a new schema or reloading the current one)
    if (isDirty) {
      setPendingLoadSchemaId(loadSchemaId);
      setShowLoadSchemaDialog(true);
      return;
    }

    // No unsaved changes, proceed directly
    await performLoadSchema(loadSchemaId);
  };

  const performLoadSchema = async (loadSchemaId: string): Promise<void> => {
    if (!loadSchemaId || loadSchemaId.trim() === '') {
      console.warn('performLoadSchema: Invalid schemaId provided');
      return;
    }

    try {
      toast.loading('Loading schema...', { id: 'load-schema' });

      const result = await schemaService.loadSchema(loadSchemaId);

      if (!result.success || !result.fields || !result.schema) {
        console.error('Schema load failed:', result.error);
        toast.error('Failed to load schema', {
          id: 'load-schema',
          description: result.error || 'Unknown error',
        });
        return;
      }

      // Check if this is a duplicate request or if schema belongs to another user
      const isDuplicate = searchParams.get('duplicate') === 'true';
      const isAnotherUserSchema = result.schema.userId && result.schema.userId !== user?.id;
      const shouldSaveAsNew = Boolean(isDuplicate || isAnotherUserSchema);
      const schemaName = shouldSaveAsNew 
        ? `Copy of ${result.schema.name}`
        : result.schema.name;

      // Ensure we have a session ID
      const currentSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      if (!sessionId) {
        setSessionId(currentSessionId);
      }

      // If it's a duplicate or another user's schema, initialize without schemaId (so it saves as new)
      // Otherwise, initialize with the loaded schema ID
      const schemaIdToUse = shouldSaveAsNew ? null : result.schema.id;
      initializeSession(currentSessionId, schemaIdToUse);
      
      // Mark as new/duplicated if saving as new (will be saved as draft)
      setIsNewOrDuplicatedSchema(shouldSaveAsNew);

      // Update fields in store - ensure all fields have the correct session_id
      const fieldsWithSession = result.fields.map(field => ({
        ...field,
        session_id: currentSessionId,
      }));
      
      setFields(fieldsWithSession, true); // Mark as clean since just loaded

      // Update metadata
      updateMetadata({
        name: schemaName,
        description: result.schema.description || undefined,
        field_count: result.fields.length,
        last_saved: isAnotherUserSchema ? undefined : result.schema.updatedAt,
      });

      // Load verification status (only for own schemas, not duplicated)
      setIsVerified(shouldSaveAsNew ? false : (result.schema.is_verified || false));

      // Load schema status
      setSchemaStatus(shouldSaveAsNew ? 'draft' : ((result.schema.status as SchemaStatus) || 'published'));

      // Load schema owner ID
      setSchemaOwnerId(result.schema.userId || null);

      // Only set selectedSchemaId and update URL if it's the user's own schema (not duplicated)
      if (shouldSaveAsNew) {
        setSelectedSchemaId("");
        // Remove schemaId and duplicate from URL if present
        const params = new URLSearchParams(searchParams.toString());
        params.delete('schemaId');
        params.delete('duplicate');
        router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
      } else {
        setSelectedSchemaId(loadSchemaId);
        // Reset new/duplicated flag when loading existing schema
        setIsNewOrDuplicatedSchema(false);
        // Update URL with schemaId parameter (without causing navigation)
        const params = new URLSearchParams(searchParams.toString());
        params.set('schemaId', loadSchemaId);
        params.delete('duplicate'); // Remove duplicate param if present
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }

      toast.success(shouldSaveAsNew ? 'Schema copied successfully' : 'Schema loaded successfully', {
        id: 'load-schema',
        description: shouldSaveAsNew 
          ? `Copied "${result.schema.name}" with ${result.fields.length} fields. You can now edit and save as your own.`
          : `Loaded "${result.schema.name}" with ${result.fields.length} fields`,
      });

      // Close popover after successful load
      setShowSchemaPopover(false);
      setShowLoadSchemaDialog(false);
      setPendingLoadSchemaId(null);
    } catch (error) {
      console.error('Error loading schema:', error);
      toast.error('Failed to load schema', {
        id: 'load-schema',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
      setShowLoadSchemaDialog(false);
      setPendingLoadSchemaId(null);
    }
  };

  const handleImportFromJSON = async (): Promise<void> => {
    if (!importText.trim()) {
      toast.error('Please paste schema JSON to import');
      return;
    }

    try {
      toast.loading('Importing schema...', { id: 'import-schema' });

      // Parse the JSON text
      const parsed = JSON.parse(importText);

      // Normalize to CompiledJSONSchema format
      // Support multiple formats:
      // 1. Full JSON Schema with properties
      // 2. Just properties object
      // 3. Schema with "schema" field containing properties
      let jsonSchema: any;
      
      if (parsed.properties) {
        // Already a JSON Schema format
        jsonSchema = {
          type: 'object',
          properties: parsed.properties,
          required: Array.isArray(parsed.required) ? parsed.required : [],
          additionalProperties: parsed.additionalProperties ?? false,
        };
      } else if (parsed.schema && parsed.schema.properties) {
        // Schema with nested "schema" field
        jsonSchema = {
          type: 'object',
          properties: parsed.schema.properties,
          required: Array.isArray(parsed.schema.required) ? parsed.schema.required : [],
          additionalProperties: parsed.schema.additionalProperties ?? false,
        };
      } else if (typeof parsed === 'object' && !parsed.type) {
        // Just properties object
        jsonSchema = {
          type: 'object',
          properties: parsed,
          required: [],
          additionalProperties: false,
        };
      } else {
        throw new Error('Invalid schema format. Expected JSON Schema with properties or a properties object.');
      }

      // Use schemaService to parse JSON Schema to fields
      // We'll create a temporary schema object and use the service's parsing logic
      const tempSchema: SchemaSaveResponse = {
        id: 'temp-import',
        name: parsed.name || 'Imported Schema',
        description: parsed.description || null,
        category: parsed.category || 'imported',
        type: 'json_schema',
        text: JSON.stringify(jsonSchema),
        dates: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Parse the JSON Schema to fields using the service's logic
      // Since parseJsonSchemaToFields is private, we'll use loadSchema approach
      // But we need to save it first, or we can parse it directly
      // Let's parse it directly by creating a helper
      const parseJsonSchemaToFields = (
        schema: any,
        parentId: string | null = null,
        parentPath = 'root'
      ): any[] => {
        const fields: any[] = [];
        const properties = schema.properties || {};
        const required = Array.isArray(schema.required) ? schema.required : [];

        let position = 0;

        for (const [fieldName, property] of Object.entries(properties)) {
          const fieldId = `field-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
          const fieldPath = `${parentPath}.${fieldName}`;

          const field: any = {
            id: fieldId,
            session_id: '',
            field_path: fieldPath,
            field_name: fieldName,
            field_type: (property as any).type || 'string',
            description: (property as any).description,
            is_required: required.includes(fieldName),
            parent_field_id: parentId,
            position: position++,
            validation_rules: {},
            visual_metadata: {},
            created_by: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Extract validation rules
          const prop = property as any;
          if (prop.pattern) field.validation_rules.pattern = prop.pattern;
          if (prop.minLength !== undefined) field.validation_rules.minLength = prop.minLength;
          if (prop.maxLength !== undefined) field.validation_rules.maxLength = prop.maxLength;
          if (prop.minimum !== undefined) field.validation_rules.minimum = prop.minimum;
          if (prop.maximum !== undefined) field.validation_rules.maximum = prop.maximum;
          if (prop.enum) field.validation_rules.enum = prop.enum;

          fields.push(field);

          // Handle nested objects
          if (prop.type === 'object' && prop.properties) {
            const nestedSchema = {
              type: 'object',
              properties: prop.properties,
              required: Array.isArray(prop.required) ? prop.required : [],
              additionalProperties: false,
            };
            const nestedFields = parseJsonSchemaToFields(nestedSchema, fieldId, fieldPath);
            fields.push(...nestedFields);
          }

          // Handle arrays with item schema
          if (prop.type === 'array' && prop.items) {
            const itemId = `field-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            const itemField: any = {
              id: itemId,
              session_id: '',
              field_path: `${fieldPath}[]`,
              field_name: 'items',
              field_type: prop.items.type || 'string',
              description: prop.items.description,
              is_required: false,
              parent_field_id: fieldId,
              position: 0,
              validation_rules: {},
              visual_metadata: {},
              created_by: 'user',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            fields.push(itemField);
          }
        }

        return fields;
      };

      const parsedFields = parseJsonSchemaToFields(jsonSchema);

      if (parsedFields.length === 0) {
        throw new Error('No fields found in schema. Please check the JSON format.');
      }

      // Ensure we have a session ID
      const currentSessionId = sessionId || `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      if (!sessionId) {
        setSessionId(currentSessionId);
      }

      // Initialize session (no schema ID for imported schemas)
      initializeSession(currentSessionId, null);
      
      // Mark as new schema (will be saved as draft)
      setIsNewOrDuplicatedSchema(true);
      setSchemaStatus('draft'); // Set status to draft for imported schemas

      // Update fields in store
      const fieldsWithSession = parsedFields.map(field => ({
        ...field,
        session_id: currentSessionId,
      }));

      setFields(fieldsWithSession, true);

      // Update metadata
      updateMetadata({
        name: parsed.name || 'Imported Schema',
        description: parsed.description || undefined,
        field_count: parsedFields.length,
        last_saved: undefined,
      });

      // Clear import text and close popover
      setImportText('');
      setShowSchemaPopover(false);

      toast.success('Schema imported successfully', {
        id: 'import-schema',
        description: `Imported "${parsed.name || 'Imported Schema'}" with ${parsedFields.length} fields`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid JSON format';
      toast.error('Failed to import schema', {
        id: 'import-schema',
        description: errorMessage,
      });
    }
  };

  // Initialize session ID on mount - only once
  useEffect(() => {
    const initSession = (): void => {
      // Generate a unique session ID for this schema editing session
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      setSessionId(newSessionId);
      
      // Initialize store session only if not already initialized
      const store = useSchemaEditorStore.getState();
      if (!store.sessionId || store.sessionId !== newSessionId) {
        initializeSession(newSessionId, null);
      }
      
      setIsInitializing(false);
    };

    initSession();
    fetchCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initialize tempSchemaName when schemaName changes
  useEffect(() => {
    if (!isEditingSchemaName) {
      setTempSchemaName(schemaName);
    }
  }, [schemaName, isEditingSchemaName]);

  // Initialize tempSchemaDescription when description changes
  useEffect(() => {
    if (!isEditingSchemaDescription) {
      setTempSchemaDescription(metadata?.description || "");
    }
  }, [metadata?.description, isEditingSchemaDescription]);


  // Fetch schemas when popover opens
  useEffect(() => {
    if (showSchemaPopover && user) {
      fetchSavedSchemas();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSchemaPopover, user]);

  // Load schema from URL parameter on mount
  useEffect(() => {
    // Only load if:
    // 1. Not initializing
    // 2. Session is initialized
    // 3. Haven't loaded from URL yet
    // 4. User is authenticated
    if (isInitializing || !sessionId || hasLoadedFromUrl || !user) {
      return;
    }

    // Support both 'schemaId' and 'schema' as URL parameters
    const urlSchemaId = searchParams.get('schemaId') || searchParams.get('schema');
    if (urlSchemaId && urlSchemaId.trim() !== '') {
      // Load schema directly - handleLoadSchema will handle API calls and errors
      const loadSchemaFromUrl = async (): Promise<void> => {
        setHasLoadedFromUrl(true); // Mark as attempted to prevent retries
        await handleLoadSchema(urlSchemaId.trim());
      };

      loadSchemaFromUrl();
    } else {
      // No schemaId in URL, mark as processed
      setHasLoadedFromUrl(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitializing, sessionId, hasLoadedFromUrl, user, searchParams]);

  /**
   * Fetch saved projects from localStorage
   */
  const fetchSavedProjects = (): void => {
    try {
      const projectsJson = localStorage.getItem('schema-studio-projects');
      if (projectsJson) {
        const projects = JSON.parse(projectsJson);
        setSavedProjects(projects);
      } else {
        setSavedProjects([]);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
      setSavedProjects([]);
    }
  };

  /**
   * Save current project state
   */
  const handleSaveProject = (): void => {
    const nameToSave = projectName.trim() || schemaName;
    if (!nameToSave) {
      toast.error('Project name is required');
      return;
    }

    try {
      const projectData = {
        id: `project-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        name: nameToSave,
        savedAt: new Date().toISOString(),
        data: {
          fields,
          metadata,
          selectedCollection,
          agentMode,
          sessionId,
          schemaId,
        },
      };

      const projectsJson = localStorage.getItem('schema-studio-projects');
      const projects = projectsJson ? JSON.parse(projectsJson) : [];
      projects.push(projectData);
      localStorage.setItem('schema-studio-projects', JSON.stringify(projects));

      setSavedProjects(projects);
      setProjectName("");
      toast.success('Project saved successfully', {
        description: `"${projectData.name}" has been saved.`,
      });
    } catch (error) {
      console.error('Error saving project:', error);
      toast.error('Failed to save project');
    }
  };

  /**
   * Load a saved project
   */
  const handleLoadProject = (projectId: string): void => {
    try {
      const project = savedProjects.find(p => p.id === projectId);
      if (!project) {
        toast.error('Project not found');
        return;
      }

      const confirmed = window.confirm(
        'Loading this project will replace your current work. Continue?'
      );

      if (!confirmed) return;

      // Restore state
      if (project.data.fields) {
        setFields(project.data.fields, true);
      }
      if (project.data.metadata) {
        updateMetadata(project.data.metadata);
      }
      if (project.data.selectedCollection) {
        setSelectedCollection(project.data.selectedCollection);
      }
      if (project.data.agentMode) {
        setAgentMode(project.data.agentMode);
      }
      if (project.data.schemaId) {
        initializeSession(sessionId, project.data.schemaId);
      }

      toast.success('Project loaded successfully', {
        description: `"${project.name}" has been loaded.`,
      });

      // Removed - no longer using settings dialog
    } catch (error) {
      console.error('Error loading project:', error);
      toast.error('Failed to load project');
    }
  };

  /**
   * Delete a saved project
   */
  const handleDeleteProject = (projectId: string): void => {
    try {
      const confirmed = window.confirm(
        'Are you sure you want to delete this project? This action cannot be undone.'
      );

      if (!confirmed) return;

      const projects = savedProjects.filter(p => p.id !== projectId);
      localStorage.setItem('schema-studio-projects', JSON.stringify(projects));
      setSavedProjects(projects);

      toast.success('Project deleted successfully');
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Failed to delete project');
    }
  };

  /**
   * Direct save for existing schemas (no dialog needed)
   */
  const handleDirectSave = async (): Promise<void> => {
    // Always validate fields
    if (fields.length === 0) {
      toast.error('Cannot save empty schema', {
        description: 'Please add at least one field to your schema.',
      });
      return;
    }

    // Validate we have a schema name (should exist for existing schemas)
    if (!metadata?.name || metadata.name.trim() === '') {
      toast.error('Schema name is required', {
        description: 'Please enter a name for your schema before saving.',
      });
      return;
    }

    setIsSaving(true);

    try {
      const result = await schemaService.saveSchema(schemaId, fields, {
        ...metadata,
        name: metadata.name.trim(),
        description: metadata.description || undefined,
        status: schemaStatus, // Include current status for new schemas
      } as any);

      if (!result.success) {
        toast.error('Failed to save schema', {
          description: result.errors[0] || 'An unknown error occurred',
        });
        setError(result.errors.join('; '));
      } else {
        updateMetadata({
          last_saved: new Date().toISOString(),
        });
        markClean();
        toast.success('Schema saved successfully', {
          description: `${metadata.name.trim()} has been saved to the database.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Save operation failed', {
        description: errorMessage,
      });
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle opening save dialog or direct save
   */
  const handleOpenSaveDialog = (): void => {
    // If editing an existing schema (schemaId exists) and has fields, save directly
    if (schemaId && schemaId.trim() !== '' && fields.length > 0) {
      handleDirectSave();
      return;
    }

    // Clear any previous errors when opening dialog
    setSaveDialogError(null);

    // For new schemas or if no fields, open dialog
    // Always sync dialog fields with current metadata (save dialog reflects metadata, doesn't manipulate it)
    setSaveSchemaName(metadata?.name || "");
    setSaveSchemaDescription(metadata?.description || "");
    setShowSaveDialog(true);
  };

  /**
   * Handle schema save from dialog
   */
  const handleSave = async (): Promise<void> => {
    // Clear any previous errors
    setSaveDialogError(null);

    // Validate we have required metadata
    if (!saveSchemaName || saveSchemaName.trim() === '') {
      setSaveDialogError('Schema name is required. Please enter a name for your schema before saving.');
      return;
    }

    if (fields.length === 0) {
      setSaveDialogError('Cannot save empty schema. Please add at least one field to your schema.');
      return;
    }

    // Update metadata with dialog values
    updateMetadata({
      name: saveSchemaName.trim(),
      description: saveSchemaDescription.trim() || undefined,
    });

    setIsSaving(true);

    try {
      // Use the current schemaStatus state - it's already set correctly:
      // - 'draft' for new/imported/duplicated schemas (set in initialization)
      // - loaded status for existing schemas
      // - user's selection if they changed it via the status selector
      const result = await schemaService.saveSchema(schemaId, fields, {
        ...metadata,
        name: saveSchemaName.trim(),
        description: saveSchemaDescription.trim() || undefined,
        status: schemaStatus, // Use state variable, not hardcoded value
        is_verified: isVerified,
      } as any);

      if (!result.success) {
        const errorMessage = result.errors[0] || 'An unknown error occurred';
        setSaveDialogError(errorMessage);
        setError(result.errors.join('; '));
        // Also show toast for visibility
        toast.error('Failed to save schema', {
          description: errorMessage,
        });
      } else {
        // Update owner ID when schema is first saved (user owns their newly created schemas)
        if (!schemaId && user?.id) {
          setSchemaOwnerId(user.id);
          // Update session with new schema ID
          if (result.schemaId) {
            initializeSession(sessionId, result.schemaId);
          }
          // Reset new/duplicated flag after first save
          setIsNewOrDuplicatedSchema(false);
        } else if (schemaId && user?.id) {
          // For existing schemas, ensure owner ID is set (user owns schemas they're editing)
          setSchemaOwnerId(user.id);
          // Reset new/duplicated flag when updating existing schema
          setIsNewOrDuplicatedSchema(false);
        }
        // Update schema status from server response (use server's status, not local calculation)
        if (result.schema?.status) {
          setSchemaStatus(result.schema.status as SchemaStatus);
        } else {
          // Fallback to calculated status if server response doesn't include it
          setSchemaStatus(schemaStatus);
        }
        updateMetadata({
          last_saved: new Date().toISOString(),
        });
        markClean();
        setSaveDialogError(null);
        setShowSaveDialog(false);
        const finalStatus = result.schema?.status || schemaStatus;
        const statusMessage = finalStatus === 'draft' ? ' as draft' : '';
        toast.success('Schema saved successfully', {
          description: `${saveSchemaName.trim()} has been saved to the database${statusMessage}.`,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setSaveDialogError(errorMessage);
      setError(errorMessage);
      // Also show toast for visibility
      toast.error('Save operation failed', {
        description: errorMessage,
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle schema export
   */
  const handleExport = async (format: "json" | "yaml"): Promise<void> => {
    if (fields.length === 0) {
      toast.error('Cannot export empty schema', {
        description: 'Please add at least one field to your schema.',
      });
      return;
    }

    try {
      const prepResult = await schemaService.prepareSchema(fields, metadata);

      if (!prepResult.success || !prepResult.compiledSchema) {
        toast.error('Export failed', {
          description: prepResult.errors[0] || 'Schema compilation failed',
        });
        return;
      }

      const content =
        format === 'json'
          ? exportSchemaAsJSON(prepResult.compiledSchema, true)
          : exportSchemaAsYAML(prepResult.compiledSchema);

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
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      toast.error('Export failed', {
        description: errorMessage,
      });
    }
  };

  /**
   * Handle discard changes
   */
  const handleDiscard = (): void => {
    if (!isDirty) {
      toast.info('No changes to discard');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to discard all unsaved changes? This action cannot be undone.'
    );

    if (confirmed) {
      markClean();
      toast.info('Changes discarded', {
        description: 'Schema has been reset to last saved state.',
      });
    }
  };

  /**
   * Handle toggling verification status
   * Only allows verification for schemas owned by the current user
   * Saves immediately if schema exists, otherwise just updates state
   */
  const handleToggleVerification = async (): Promise<void> => {
    // Check if user owns the schema
    // For new schemas (!schemaId), user owns it
    // For existing schemas, schemaOwnerId must exist AND match user?.id
    const isOwner = !schemaId || (schemaOwnerId && schemaOwnerId === user?.id);
    
    if (schemaId && !isOwner) {
      toast.error('Cannot verify schema', {
        description: 'You can only verify schemas that you own. Duplicate this schema to create your own copy.',
      });
      return;
    }

    const newVerifiedStatus = !isVerified;
    setIsVerified(newVerifiedStatus);

    // If schema exists, save immediately
    if (schemaId) {
      try {
        setIsSaving(true);
        const result = await schemaService.updateSchemaVerification(schemaId, newVerifiedStatus);
        
        if (!result.success) {
          // Revert on error
          setIsVerified(!newVerifiedStatus);
          toast.error('Failed to update verification status', {
            description: result.error || 'Unknown error',
          });
        } else {
          toast.success(newVerifiedStatus ? 'Schema marked as verified' : 'Verification removed', {
            description: 'Verification status has been updated.',
          });
        }
      } catch (error) {
        // Revert on error
        setIsVerified(!newVerifiedStatus);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to update verification status', {
          description: errorMessage,
        });
      } finally {
        setIsSaving(false);
      }
    } else {
      // Schema doesn't exist yet, just update state
      // Verification will be saved when schema is first saved
      toast.info(newVerifiedStatus ? 'Will be marked as verified when saved' : 'Verification removed', {
        description: 'Verification status will be saved with the schema.',
      });
    }
  };

  /**
   * Handle changing schema status
   * Only allows status change for schemas owned by the current user
   * Saves immediately if schema exists, otherwise just updates state
   */
  const handleStatusChange = async (newStatus: SchemaStatus): Promise<void> => {
    // Check if user owns the schema
    // For new schemas (!schemaId), user owns it
    // For existing schemas, schemaOwnerId must exist AND match user?.id
    const isOwner = !schemaId || (schemaOwnerId && schemaOwnerId === user?.id);

    if (schemaId && !isOwner) {
      toast.error('Cannot change status', {
        description: 'You can only change the status of schemas that you own.',
      });
      return;
    }

    const previousStatus = schemaStatus;
    setSchemaStatus(newStatus);

    // If schema exists, save immediately
    if (schemaId) {
      try {
        setIsUpdatingStatus(true);
        const result = await schemaService.updateSchemaStatus(schemaId, newStatus);

        if (!result.success) {
          // Revert on error
          setSchemaStatus(previousStatus);
          toast.error('Failed to update status', {
            description: result.error || 'Unknown error',
          });
        } else {
          const statusLabels: Record<SchemaStatus, string> = {
            draft: 'Draft',
            published: 'Published',
            review: 'In Review',
            archived: 'Archived',
          };
          toast.success(`Schema status changed to ${statusLabels[newStatus]}`, {
            description: newStatus === 'published'
              ? 'This schema is now visible to all users.'
              : newStatus === 'draft'
              ? 'This schema is now a draft.'
              : newStatus === 'review'
              ? 'This schema is pending review.'
              : 'This schema has been archived.',
          });
        }
      } catch (error) {
        // Revert on error
        setSchemaStatus(previousStatus);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to update status', {
          description: errorMessage,
        });
      } finally {
        setIsUpdatingStatus(false);
      }
    } else {
      // Schema doesn't exist yet, just update state
      // Status will be saved when schema is first saved
      toast.info(`Status will be set to ${newStatus} when saved`, {
        description: 'Status will be saved with the schema.',
      });
    }
  };

  /**
   * Handle saving schema name
   * Updates local state and saves to database if schema exists
   */
  const handleSaveName = async (newName: string): Promise<void> => {
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    // Check ownership for existing schemas
    const isOwner = !schemaId || (schemaOwnerId && schemaOwnerId === user?.id);
    if (schemaId && !isOwner) {
      toast.error('Cannot update name', {
        description: 'You can only update schemas that you own.',
      });
      return;
    }

    // Update local state
    updateMetadata({ name: trimmedName });

    // If schema exists, save to database
    if (schemaId) {
      try {
        setIsSaving(true);
        const result = await schemaService.updateSchemaMetadata(schemaId, { name: trimmedName });

        if (!result.success) {
          toast.error('Failed to update name', {
            description: result.error || 'Unknown error',
          });
        } else {
          toast.success('Schema name updated');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to update name', {
          description: errorMessage,
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  /**
   * Handle saving schema description
   * Updates local state and saves to database if schema exists
   */
  const handleSaveDescription = async (newDescription: string): Promise<void> => {
    const trimmedDescription = newDescription.trim() || undefined;

    // Check ownership for existing schemas
    const isOwner = !schemaId || (schemaOwnerId && schemaOwnerId === user?.id);
    if (schemaId && !isOwner) {
      toast.error('Cannot update description', {
        description: 'You can only update schemas that you own.',
      });
      return;
    }

    // Update local state
    updateMetadata({ description: trimmedDescription });

    // If schema exists, save to database
    if (schemaId) {
      try {
        setIsSaving(true);
        const result = await schemaService.updateSchemaMetadata(schemaId, {
          description: trimmedDescription || ''
        });

        if (!result.success) {
          toast.error('Failed to update description', {
            description: result.error || 'Unknown error',
          });
        } else {
          toast.success('Schema description updated');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error('Failed to update description', {
          description: errorMessage,
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  /**
   * Handle duplicating the current schema
   * Creates a new draft copy that the current user owns
   * Useful for reusing parts or whole schemas from others
   */
  const handleDuplicateSchema = (): void => {
    if (fields.length === 0) {
      toast.error('Cannot duplicate empty schema', {
        description: 'The schema must have at least one field to duplicate.',
      });
      return;
    }

    // Generate new name with "Copy of" prefix or "(Copy)" suffix
    const currentName = metadata?.name || 'Untitled Schema';
    const newName = currentName.startsWith('Copy of ')
      ? `${currentName} (2)`
      : `Copy of ${currentName}`;

    // Create new session for the duplicated schema
    const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Reset to new schema state
    initializeSession(newSessionId, null);

    // Keep the fields but update metadata
    setFields(fields.map(field => ({
      ...field,
      session_id: newSessionId,
      id: `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    })));

    updateMetadata({
      name: newName,
      description: metadata?.description,
      field_count: fields.length,
    });

    // Reset schema-specific state
    setSelectedSchemaId('');
    setSchemaOwnerId(user?.id || null);
    setIsNewOrDuplicatedSchema(true);
    setSchemaStatus('draft');
    setIsVerified(false);

    // Update URL to remove schemaId
    const params = new URLSearchParams(searchParams.toString());
    params.delete('schemaId');
    params.delete('duplicate');
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl);

    toast.success('Schema duplicated', {
      description: `Created "${newName}" as a new draft. Save to keep your changes.`,
    });
  };

  if (!user) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
        <p className="text-muted-foreground">Please sign in to access the Schema Studio.</p>
      </div>
    );
  }

  if (isInitializing) {
    return (
      <div className="container mx-auto px-6 py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>

      <div className="w-full glass-page-background h-[calc(100vh-4rem)] flex flex-col">
        <div className="w-full max-w-page-wide mx-auto px-0 py-0 flex flex-col flex-1 min-h-0">
          <div className="w-full flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left side - Settings, Schema Name, Export, and Collection */}
            <div className="flex items-center gap-3">
              {/* New Schema button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      icon={Plus}
                      size="lg"
                      variant="primary"
                      onClick={handleNewSession}
                      aria-label="New Schema"
                      enhancedHover={true}
                      disabled={fields.length === 0}
                      className="bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="bg-white/25 dark:bg-slate-900/35 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30 dark:border-primary/40">
                    <p>{fields.length === 0 ? 'Add at least one field to create a new schema' : 'New Schema'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Duplicate Schema button - creates a draft copy for the current user */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <IconButton
                      icon={Copy}
                      size="lg"
                      variant="muted"
                      onClick={handleDuplicateSchema}
                      aria-label="Duplicate Schema"
                      enhancedHover={true}
                      disabled={fields.length === 0}
                      className="disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </TooltipTrigger>
                  <TooltipContent className="bg-white/25 dark:bg-slate-900/35 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30 dark:border-primary/40">
                    <p>{fields.length === 0 ? 'Add fields first to duplicate' : 'Duplicate Schema (create your own draft copy)'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Schema Name and Description - Stacked vertically */}
              <div className="flex flex-col gap-1">
                {/* Schema Name with Edit - auto-saves to database for existing schemas */}
                {isEditingSchemaName ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempSchemaName}
                      onChange={(e) => setTempSchemaName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          if (tempSchemaName.trim()) {
                            handleSaveName(tempSchemaName);
                          } else {
                            setTempSchemaName(schemaName);
                          }
                          setIsEditingSchemaName(false);
                        }
                        if (e.key === "Escape") {
                          setTempSchemaName(schemaName);
                          setIsEditingSchemaName(false);
                        }
                      }}
                      onBlur={() => {
                        if (tempSchemaName.trim()) {
                          handleSaveName(tempSchemaName);
                        } else {
                          setTempSchemaName(schemaName);
                        }
                        setIsEditingSchemaName(false);
                      }}
                      autoFocus
                      className="h-8 w-48 text-sm font-semibold"
                    />
                    <IconButton
                      icon={Check}
                      size="sm"
                      variant="muted"
                      onClick={() => {
                        if (tempSchemaName.trim()) {
                          handleSaveName(tempSchemaName);
                        } else {
                          setTempSchemaName(schemaName);
                        }
                        setIsEditingSchemaName(false);
                      }}
                      aria-label="Save schema name"
                    />
                    <IconButton
                      icon={X}
                      size="sm"
                      variant="muted"
                      onClick={() => {
                        setTempSchemaName(schemaName);
                        setIsEditingSchemaName(false);
                      }}
                      aria-label="Cancel editing"
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 transition-colors"
                      onClick={() => {
                        setTempSchemaName(schemaName);
                        setIsEditingSchemaName(true);
                      }}
                    >
                      <span className="text-sm font-semibold text-foreground">{displayName}</span>
                      <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    {/* Schema Status Selector - interactive for owners, read-only for others */}
                    {schemaStatus && (
                      <SchemaStatusSelector
                        status={schemaStatus}
                        isOwner={!schemaId || (!!schemaOwnerId && schemaOwnerId === user?.id)}
                        onStatusChange={handleStatusChange}
                        isLoading={isUpdatingStatus}
                        disabled={isSaving}
                        size="sm"
                      />
                    )}
                    {/* Verification Toggle */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={handleToggleVerification}
                            disabled={isSaving || !!(schemaId && schemaOwnerId && schemaOwnerId !== user?.id)}
                            className={cn(
                              "flex items-center gap-1.5",
                              "h-7 px-2 rounded-md",
                              "transition-all duration-200",
                              "border",
                              isVerified
                                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400"
                                : "bg-muted/50 dark:bg-muted/30 border-border text-muted-foreground",
                              "hover:scale-105 active:scale-95",
                              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            )}
                            aria-label={isVerified ? "Remove verification" : "Mark as verified"}
                          >
                            {isVerified ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium">Verified</span>
                              </>
                            ) : (
                              <>
                                <X className="h-3.5 w-3.5" />
                                <span className="text-xs font-medium">Not Verified</span>
                              </>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-white/25 dark:bg-slate-900/35 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30 dark:border-primary/40">
                          <p>
                            {schemaId && schemaOwnerId && schemaOwnerId !== user?.id
                              ? "You can only verify schemas you own. Duplicate this schema to create your own copy."
                              : isVerified
                              ? "Click to remove verification"
                              : "Click to mark as verified"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

                {/* Schema Description with Edit - auto-saves to database for existing schemas */}
                {isEditingSchemaDescription ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempSchemaDescription}
                      onChange={(e) => setTempSchemaDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveDescription(tempSchemaDescription);
                          setIsEditingSchemaDescription(false);
                        }
                        if (e.key === "Escape") {
                          setTempSchemaDescription(metadata?.description || "");
                          setIsEditingSchemaDescription(false);
                        }
                      }}
                      onBlur={() => {
                        handleSaveDescription(tempSchemaDescription);
                        setIsEditingSchemaDescription(false);
                      }}
                      placeholder="Add description..."
                      autoFocus
                      className="h-8 w-64 text-sm text-muted-foreground"
                    />
                    <IconButton
                      icon={Check}
                      size="sm"
                      variant="muted"
                      onClick={() => {
                        handleSaveDescription(tempSchemaDescription);
                        setIsEditingSchemaDescription(false);
                      }}
                      aria-label="Save schema description"
                    />
                    <IconButton
                      icon={X}
                      size="sm"
                      variant="muted"
                      onClick={() => {
                        setTempSchemaDescription(metadata?.description || "");
                        setIsEditingSchemaDescription(false);
                      }}
                      aria-label="Cancel editing"
                    />
                  </div>
                ) : (
                  <div
                    className="group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 transition-colors"
                    onClick={() => {
                      setTempSchemaDescription(metadata?.description || "");
                      setIsEditingSchemaDescription(true);
                    }}
                  >
                    <span className="text-xs text-muted-foreground">
                      {metadata?.description || "Add description..."}
                    </span>
                  </div>
                )}
              </div>

            </div>


            {/* Right side - Import, Save/Export */}
            <div className="flex items-center gap-3">
              {/* Import Schema button with Popover */}
              <Popover open={showSchemaPopover} onOpenChange={setShowSchemaPopover}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Import Schema"
                    className={cn(
                      "text-sm h-9 px-4 rounded-xl",
                      "inline-flex items-center justify-center",
                      "transition-all duration-300",
                      "bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm",
                      "border border-slate-200/50 dark:border-slate-800/50",
                      "hover:bg-white/80 dark:hover:bg-slate-800/80",
                      "hover:scale-105 hover:shadow-md",
                      "active:scale-[0.98] active:opacity-90",
                      "font-semibold",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    )}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </button>
                </PopoverTrigger>
                <PopoverContent 
                  className={cn(
                    "w-80 p-4 z-[100]",
                    // Glassmorphism 2.0
                    "bg-white/80 dark:bg-slate-900/80",
                    "backdrop-blur-xl backdrop-saturate-[180%]",
                    "border border-primary/20 dark:border-primary/30",
                    "shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
                    "dark:shadow-[0_18px_45px_0_rgba(0,0,0,0.4),0_8px_20px_0_rgba(139,92,246,0.15),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
                  )}
                  align="end" 
                  side="bottom" 
                  sideOffset={8}
                >
                  <TabSelector
                    value={importTab}
                    onValueChange={(v) => setImportTab(v as "load" | "import")}
                    tabs={[
                      { value: "load", label: "Load" },
                      { value: "import", label: "Import" },
                    ]}
                    className="w-full"
                  >
                    <TabsContent value="load" className="space-y-3 mt-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-foreground">Load Schema</h4>
                        <IconButton
                          icon={isLoadingSchemas ? Loader2 : RefreshCw}
                          onClick={fetchSavedSchemas}
                          disabled={isLoadingSchemas}
                          size="sm"
                          variant="muted"
                          aria-label="Refresh schemas"
                        />
                      </div>
                      <div className="space-y-2">
                        {/* Search input */}
                        <Input
                          type="text"
                          placeholder="Search schemas..."
                          value={schemaSearchQuery}
                          onChange={(e) => setSchemaSearchQuery(e.target.value)}
                          className="h-9 text-sm"
                        />
                        
                        {/* Schema list */}
                        <ScrollArea className="h-[200px] w-full">
                          {isLoadingSchemas ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              <span className="ml-2 text-sm text-muted-foreground">Loading schemas...</span>
                            </div>
                          ) : savedSchemas.length === 0 ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">
                              No saved schemas found
                            </div>
                          ) : (
                            <div className="space-y-1 pr-4">
                              {savedSchemas
                                .filter((schema) => {
                                  if (!schemaSearchQuery.trim()) return true;
                                  const query = schemaSearchQuery.toLowerCase();
                                  return (
                                    schema.name.toLowerCase().includes(query) ||
                                    schema.category.toLowerCase().includes(query)
                                  );
                                })
                                .sort((a, b) => {
                                  // Sort verified schemas first
                                  if (a.is_verified && !b.is_verified) return -1;
                                  if (!a.is_verified && b.is_verified) return 1;
                                  return 0; // Keep original order for schemas with same verification status
                                })
                                .map((schema) => (
                                  <button
                                    key={schema.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSchemaId(schema.id);
                                      handleLoadSchema(schema.id);
                                      setShowSchemaPopover(false);
                                    }}
                                    className={cn(
                                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                                      "hover:bg-primary/10 dark:hover:bg-primary/20",
                                      "border border-transparent hover:border-primary/30",
                                      selectedSchemaId === schema.id && "bg-primary/10 dark:bg-primary/20 border-primary/30"
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <FileCode className="h-4 w-4 text-primary shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <div className="font-medium text-foreground truncate">
                                            {schema.name}
                                          </div>
                                          {schema.is_verified && <VerifiedBadge size="sm" />}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          {schema.category} • Updated {new Date(schema.updatedAt).toLocaleDateString()}
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                            </div>
                          )}
                        </ScrollArea>
                        
                        {schemaId && (
                          <p className="text-xs text-muted-foreground pt-1">
                            Current: {savedSchemas.find(s => s.id === schemaId)?.name || 'Unsaved schema'}
                          </p>
                        )}
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="import" className="space-y-3 mt-0">
                      <div className="space-y-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-2">Import from JSON</h4>
                          <Label htmlFor="import-text" className="text-xs text-muted-foreground">
                            Paste your schema JSON below
                          </Label>
                        </div>
                        <Textarea
                          id="import-text"
                          className="font-mono text-xs min-h-[250px]"
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder={`Paste your schema JSON here, e.g.:\n{\n  "name": "Contract Schema",\n  "description": "Schema for contracts",\n  "type": "object",\n  "properties": {\n    "party_name": {\n      "type": "string",\n      "description": "Name of party"\n    }\n  },\n  "required": ["party_name"]\n}`}
                        />
                        <div className="text-xs text-muted-foreground">
                          <p className="mb-2">Expected format:</p>
                          <ul className="list-disc list-inside space-y-1">
                            <li>JSON Schema with &quot;properties&quot; field</li>
                            <li>Or schema object with nested &quot;schema.properties&quot;</li>
                            <li>Optional: &quot;name&quot;, &quot;description&quot;, &quot;required&quot; fields</li>
                          </ul>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <SecondaryButton
                            onClick={() => {
                              setImportText('');
                              setImportTab('load');
                            }}
                            size="sm"
                          >
                            Cancel
                          </SecondaryButton>
                          <PrimaryButton
                            onClick={handleImportFromJSON}
                            icon={Upload}
                            size="sm"
                            disabled={!importText.trim()}
                          >
                            Import Schema
                          </PrimaryButton>
                        </div>
                      </div>
                    </TabsContent>
                  </TabSelector>
                </PopoverContent>
              </Popover>

              {/* Save and Export */}
              <SaveActions
                onSave={handleOpenSaveDialog}
                onExport={handleExport}
                onDiscard={handleDiscard}
                isDirty={isDirty}
                isSaving={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Main split-pane layout - full height */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Edit Mode - Current schema editor */}
          <SchemaStudioLayout
            sessionId={sessionId}
            collectionId={selectedCollection && selectedCollection !== "none" ? selectedCollection : undefined}
            collectionName={
              selectedCollection && selectedCollection !== "none"
                ? collections.find((c) => c.id === selectedCollection)?.name
                : undefined
            }
            onPreviewClick={() => setShowPreviewDialog(true)}
          />
        </div>
      </div>
      </div>
      </div>

      {/* Extraction Result Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className={cn(
          "max-w-4xl max-h-[90vh]",
          // Glassmorphism 2.0
          "bg-white/80 dark:bg-slate-900/80",
          "backdrop-blur-xl backdrop-saturate-[180%]",
          "border border-primary/20 dark:border-primary/30",
          "shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
          "dark:shadow-[0_18px_45px_0_rgba(0,0,0,0.4),0_8px_20px_0_rgba(139,92,246,0.15),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
        )}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Extraction Result Preview
            </DialogTitle>
            <DialogDescription>
              Preview how extracted data will be displayed based on your schema
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="py-4">
              {Object.keys(generatePreviewData).length === 0 ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <div className="text-center">
                    <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">
                      Add fields to see extraction preview
                    </p>
                  </div>
                </div>
              ) : (
                <ExtractionDataViewer
                  data={generatePreviewData}
                  viewMode="document"
                  globalLayout="list"
                  hideCopyButtons={true}
                />
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Save Schema Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={(open) => {
        setShowSaveDialog(open);
        // Clear error when dialog closes
        if (!open) {
          setSaveDialogError(null);
        }
      }}>
        <DialogContent className={cn(
          "sm:max-w-[500px]",
          "bg-white dark:bg-slate-900",
          "border border-border",
          "shadow-xl"
        )}>
          <DialogHeader>
            <DialogTitle>Save Schema</DialogTitle>
            <DialogDescription>
              Enter a name and description for your schema. These values will be preserved when you close the dialog.
            </DialogDescription>
          </DialogHeader>

          {/* Error message display - appears right after description */}
          {saveDialogError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 mt-2">
              <p className="text-sm text-destructive font-medium">{saveDialogError}</p>
            </div>
          )}
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="save-schema-name" className="text-sm font-semibold">
                Schema Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="save-schema-name"
                value={saveSchemaName}
                onChange={(e) => {
                  setSaveSchemaName(e.target.value);
                  // Clear error when user starts typing
                  if (saveDialogError) {
                    setSaveDialogError(null);
                  }
                }}
                placeholder="Enter schema name..."
                className={cn(
                  "rounded-lg",
                  saveDialogError && "border-destructive focus-visible:ring-destructive"
                )}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && saveSchemaName.trim() && !isSaving) {
                    handleSave();
                  }
                }}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="save-schema-description" className="text-sm font-semibold">
                Description
              </Label>
              <Textarea
                id="save-schema-description"
                value={saveSchemaDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSaveSchemaDescription(e.target.value)}
                placeholder="Enter schema description (optional)..."
                className="rounded-lg min-h-[100px]"
                rows={4}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <SecondaryButton
              onClick={() => setShowSaveDialog(false)}
              disabled={isSaving}
              size="sm"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={handleSave}
              disabled={!saveSchemaName.trim() || isSaving || fields.length === 0}
              size="sm"
              isLoading={isSaving}
              loadingText="Saving..."
            >
              Save Schema
            </PrimaryButton>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Schema Confirmation Dialog */}
      <AlertDialog open={showNewSchemaDialog} onOpenChange={setShowNewSchemaDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. Starting a new schema will discard all unsaved changes. This action cannot be undone.
              <br /><br />
              Are you sure you want to start a new schema?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={createNewSchema}
              className="bg-destructive hover:bg-destructive/90"
            >
              Start New Schema
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Load Schema Confirmation Dialog */}
      <AlertDialog open={showLoadSchemaDialog} onOpenChange={setShowLoadSchemaDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. {pendingLoadSchemaId === schemaId ? 'Reloading this schema' : 'Loading another schema'} will discard all unsaved changes. This action cannot be undone.
              <br /><br />
              Are you sure you want to {pendingLoadSchemaId === schemaId ? 'reload' : 'load'} this schema?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowLoadSchemaDialog(false);
                setPendingLoadSchemaId(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLoadSchemaId) {
                  performLoadSchema(pendingLoadSchemaId);
                }
              }}
              className="bg-destructive hover:bg-destructive/90"
            >
              {pendingLoadSchemaId === schemaId ? 'Reload Schema' : 'Load Schema'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Navigation Confirmation Dialog */}
      <AlertDialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to your current schema. Navigating away will discard all unsaved changes. This action cannot be undone.
              <br /><br />
              Are you sure you want to leave this page?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowNavigationDialog(false);
                setPendingNavigationUrl(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmNavigation}
              className="bg-destructive hover:bg-destructive/90"
            >
              Leave Page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

