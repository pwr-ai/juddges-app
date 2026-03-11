"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SchemaStudioLayout } from "@/components/schema-studio/SchemaStudioLayout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, X, Edit2, Check, FileCode, RefreshCw, Plus, Upload, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";
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
import { SecondaryButton, IconButton, PrimaryButton, VerifiedBadge } from "@/lib/styles/components";
import { SchemaStatusSelector } from "@/lib/styles/components/schema-status-selector";
import type { SchemaStatus } from "@/types/extraction_schemas";
import { Label } from "@/components/ui/label";
import { SaveActions } from "@/components/schema-studio/SaveActions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TabsContent } from "@/components/ui/tabs";
import { TabSelector } from "@/components/schema-studio/TabSelector";
import { cn } from "@/lib/utils";
import { useUnsavedChangesWarning } from "@/hooks/useUnsavedChangesWarning";
import { useSchemaNavigationInterception } from "@/hooks/schema-chat/useSchemaNavigationInterception";
import { useSchemaPreviewData } from "@/hooks/schema-chat/useSchemaPreviewData";
import { SchemaDialogs } from "@/components/schema-chat/SchemaDialogs";
import { useSchemaLoad } from "@/hooks/schema-chat/useSchemaLoad";
import { useSchemaSave } from "@/hooks/schema-chat/useSchemaSave";
import { useSchemaMetadataOps } from "@/hooks/schema-chat/useSchemaMetadataOps";

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
 const [selectedCollection] = useState<string>("");
 const [collections, setCollections] = useState<Collection[]>([]);
 const [sessionId, setSessionId] = useState<string>("");
 const [isInitializing, setIsInitializing] = useState(true);
 const [showPreviewDialog, setShowPreviewDialog] = useState(false);
 const [showNewSchemaDialog, setShowNewSchemaDialog] = useState(false);

 const {
 setFields,
 updateMetadata,
 initializeSession,
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
 const displayName = schemaName;

 // --- Extracted hooks ---

 const metadataOps = useSchemaMetadataOps({
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
 });

 const schemaLoad = useSchemaLoad({
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
 onSchemaLoaded: (opts) => {
 schemaLoad.setSelectedSchemaId(opts.selectedSchemaId);
 metadataOps.setIsVerified(opts.isVerified);
 metadataOps.setSchemaOwnerId(opts.schemaOwnerId);
 metadataOps.setSchemaStatus(opts.schemaStatus);
 },
 onSchemaReset: () => {
 metadataOps.setSchemaStatus("draft");
 },
 });

 const schemaSave = useSchemaSave({
 user,
 schemaId,
 fields,
 metadata,
 isDirty,
 isSaving,
 sessionId,
 schemaStatus: metadataOps.schemaStatus,
 isVerified: metadataOps.isVerified,
 setIsSaving,
 markClean,
 setError,
 updateMetadata,
 initializeSession,
 onSchemaSaved: (opts) => {
 metadataOps.setSchemaOwnerId(opts.ownerId);
 if (opts.status) metadataOps.setSchemaStatus(opts.status);
 },
 });

 // Prevent page reload when there are unsaved changes
 useUnsavedChangesWarning(
 isDirty,
"You have unsaved changes to your schema. Are you sure you want to leave? "
 );

 const {
 showNavigationDialog,
 setShowNavigationDialog,
 confirmNavigation,
 cancelNavigation,
 } = useSchemaNavigationInterception({ isDirty, router, pathname });

 const generatePreviewData = useSchemaPreviewData(fields, schemaName, metadata?.description);

 // --- Session initialization ---

 const fetchCollections = async (): Promise<void> => {
 try {
 const response = await fetch("/api/collections");
 if (!response.ok) throw new Error("Failed to fetch collections");
 const data = await response.json();
 setCollections(data);
 } catch (error) {
 console.error("Error fetching collections: ", error);
 toast.error("Failed to load collections");
 }
 };

 const createNewSchema = (): void => {
 const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
 setSessionId(newSessionId);
 initializeSession(newSessionId, null);
 schemaLoad.setSelectedSchemaId("");
 metadataOps.setIsVerified(false);
 metadataOps.setSchemaOwnerId(null);
 metadataOps.setSchemaStatus("draft");
 setShowNewSchemaDialog(false);

 const params = new URLSearchParams(searchParams.toString());
 params.delete("schemaId");
 params.delete("schema");
 params.delete("duplicate");
 const newSearch = params.toString();
 router.replace(newSearch ? `${pathname}?${newSearch}` : pathname, { scroll: false });
 toast.success("New schema session started");
 };

 const handleNewSession = (): void => {
 if (isDirty) {
 setShowNewSchemaDialog(true);
 return;
 }
 createNewSchema();
 };

 useEffect(() => {
 const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
 setSessionId(newSessionId);
 const store = useSchemaEditorStore.getState();
 if (!store.sessionId || store.sessionId !== newSessionId) {
 initializeSession(newSessionId, null);
 }
 setIsInitializing(false);
 fetchCollections();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, []);

 // --- Guards ---

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
 <Loader2 className="h-8 w-8 animate-spin text-primary"/>
 </div>
 );
 }

 // --- Render ---

 return (
 <>
 <div className="w-full glass-page-background h-[calc(100vh-4rem)] flex flex-col">
 <div className="w-full max-w-page-wide mx-auto px-0 py-0 flex flex-col flex-1 min-h-0">
 <div className="w-full flex flex-col flex-1 min-h-0">
 {/* Toolbar */}
 <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur-sm px-4 sm:px-6 lg:px-8 py-3">
 <div className="flex items-center justify-between gap-4">
 {/* Left side - New, Duplicate, Schema Name, Status */}
 <div className="flex items-center gap-3">
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
 className="bg-primary/10 border border-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
 />
 </TooltipTrigger>
 <TooltipContent className="bg-white/25 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30">
 <p>{fields.length === 0 ? "Add at least one field to create a new schema": "New Schema"}</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>

 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <IconButton
 icon={Copy}
 size="lg"
 variant="muted"
 onClick={metadataOps.handleDuplicateSchema}
 aria-label="Duplicate Schema"
 enhancedHover={true}
 disabled={fields.length === 0}
 className="disabled:opacity-50 disabled:cursor-not-allowed"
 />
 </TooltipTrigger>
 <TooltipContent className="bg-white/25 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30">
 <p>{fields.length === 0 ? "Add fields first to duplicate": "Duplicate Schema (create your own draft copy)"}</p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>

 {/* Schema Name and Description */}
 <div className="flex flex-col gap-1">
 {metadataOps.isEditingSchemaName ? (
 <div className="flex items-center gap-2">
 <Input
 value={metadataOps.tempSchemaName}
 onChange={(e) => metadataOps.setTempSchemaName(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") {
 if (metadataOps.tempSchemaName.trim()) {
 metadataOps.handleSaveName(metadataOps.tempSchemaName);
 } else {
 metadataOps.setTempSchemaName(schemaName);
 }
 metadataOps.setIsEditingSchemaName(false);
 }
 if (e.key === "Escape") {
 metadataOps.setTempSchemaName(schemaName);
 metadataOps.setIsEditingSchemaName(false);
 }
 }}
 onBlur={() => {
 if (metadataOps.tempSchemaName.trim()) {
 metadataOps.handleSaveName(metadataOps.tempSchemaName);
 } else {
 metadataOps.setTempSchemaName(schemaName);
 }
 metadataOps.setIsEditingSchemaName(false);
 }}
 autoFocus
 className="h-8 w-48 text-sm font-semibold"
 />
 <IconButton icon={Check} size="sm"variant="muted"onClick={() => { if (metadataOps.tempSchemaName.trim()) metadataOps.handleSaveName(metadataOps.tempSchemaName); else metadataOps.setTempSchemaName(schemaName); metadataOps.setIsEditingSchemaName(false); }} aria-label="Save schema name"/>
 <IconButton icon={X} size="sm"variant="muted"onClick={() => { metadataOps.setTempSchemaName(schemaName); metadataOps.setIsEditingSchemaName(false); }} aria-label="Cancel editing"/>
 </div>
 ) : (
 <div className="flex items-center gap-2">
 <div
 className="group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 transition-colors"
 onClick={() => { metadataOps.setTempSchemaName(schemaName); metadataOps.setIsEditingSchemaName(true); }}
 >
 <span className="text-sm font-semibold text-foreground">{displayName}</span>
 <Edit2 className="h-3.5 w-3.5 text-muted-foreground"/>
 </div>
 {metadataOps.schemaStatus && (
 <SchemaStatusSelector
 status={metadataOps.schemaStatus}
 isOwner={metadataOps.isOwner}
 onStatusChange={metadataOps.handleStatusChange}
 isLoading={metadataOps.isUpdatingStatus}
 disabled={isSaving}
 size="sm"
 />
 )}
 <TooltipProvider>
 <Tooltip>
 <TooltipTrigger asChild>
 <button
 type="button"
 onClick={metadataOps.handleToggleVerification}
 disabled={isSaving || !!(schemaId && metadataOps.schemaOwnerId && metadataOps.schemaOwnerId !== user?.id)}
 className={cn(
"flex items-center gap-1.5 h-7 px-2 rounded-md transition-all duration-200 border",
 metadataOps.isVerified
 ? "bg-green-50 border-green-200 text-green-700"
 : "bg-muted/50 border-border text-muted-foreground",
"hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
 )}
 aria-label={metadataOps.isVerified ? "Remove verification": "Mark as verified"}
 >
 {metadataOps.isVerified ? (
 <><CheckCircle2 className="h-3.5 w-3.5"/><span className="text-xs font-medium">Verified</span></>
 ) : (
 <><X className="h-3.5 w-3.5"/><span className="text-xs font-medium">Not Verified</span></>
 )}
 </button>
 </TooltipTrigger>
 <TooltipContent className="bg-white/25 backdrop-blur-xl backdrop-saturate-[180%] border-primary/30">
 <p>
 {schemaId && metadataOps.schemaOwnerId && metadataOps.schemaOwnerId !== user?.id
 ? "You can only verify schemas you own. Duplicate this schema to create your own copy."
 : metadataOps.isVerified ? "Click to remove verification": "Click to mark as verified"}
 </p>
 </TooltipContent>
 </Tooltip>
 </TooltipProvider>
 </div>
 )}

 {/* Description */}
 {metadataOps.isEditingSchemaDescription ? (
 <div className="flex items-center gap-2">
 <Input
 value={metadataOps.tempSchemaDescription}
 onChange={(e) => metadataOps.setTempSchemaDescription(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === "Enter") { metadataOps.handleSaveDescription(metadataOps.tempSchemaDescription); metadataOps.setIsEditingSchemaDescription(false); }
 if (e.key === "Escape") { metadataOps.setTempSchemaDescription(metadata?.description || ""); metadataOps.setIsEditingSchemaDescription(false); }
 }}
 onBlur={() => { metadataOps.handleSaveDescription(metadataOps.tempSchemaDescription); metadataOps.setIsEditingSchemaDescription(false); }}
 placeholder="Add description..."
 autoFocus
 className="h-8 w-64 text-sm text-muted-foreground"
 />
 <IconButton icon={Check} size="sm"variant="muted"onClick={() => { metadataOps.handleSaveDescription(metadataOps.tempSchemaDescription); metadataOps.setIsEditingSchemaDescription(false); }} aria-label="Save schema description"/>
 <IconButton icon={X} size="sm"variant="muted"onClick={() => { metadataOps.setTempSchemaDescription(metadata?.description || ""); metadataOps.setIsEditingSchemaDescription(false); }} aria-label="Cancel editing"/>
 </div>
 ) : (
 <div
 className="group flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded-md px-2 py-1 -mx-2 transition-colors"
 onClick={() => { metadataOps.setTempSchemaDescription(metadata?.description || ""); metadataOps.setIsEditingSchemaDescription(true); }}
 >
 <span className="text-xs text-muted-foreground">{metadata?.description || "Add description..."}</span>
 </div>
 )}
 </div>
 </div>

 {/* Right side - Import, Save/Export */}
 <div className="flex items-center gap-3">
 <Popover open={schemaLoad.showSchemaPopover} onOpenChange={schemaLoad.setShowSchemaPopover}>
 <PopoverTrigger asChild>
 <button
 type="button"
 aria-label="Import Schema"
 className={cn(
"text-sm h-9 px-4 rounded-xl inline-flex items-center justify-center transition-all duration-300",
"bg-white/60 backdrop-blur-sm border border-slate-200/50",
"hover:bg-white/80 hover:scale-105 hover:shadow-md",
"active:scale-[0.98] active:opacity-90 font-semibold",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
 )}
 >
 <Upload className="h-4 w-4 mr-2"/>
 Import
 </button>
 </PopoverTrigger>
 <PopoverContent
 className={cn(
"w-80 p-4 z-[100] bg-white/80 backdrop-blur-xl backdrop-saturate-[180%]",
"border border-primary/20",
"shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
""
 )}
 align="end"
 side="bottom"
 sideOffset={8}
 >
 <TabSelector
 value={schemaLoad.importTab}
 onValueChange={(v) => schemaLoad.setImportTab(v as"load"|"import")}
 tabs={[
 { value: "load", label: "Load"},
 { value: "import", label: "Import"},
 ]}
 className="w-full"
 >
 <TabsContent value="load"className="space-y-3 mt-0">
 <div className="flex items-center justify-between">
 <h4 className="text-sm font-semibold text-foreground">Load Schema</h4>
 <IconButton icon={schemaLoad.isLoadingSchemas ? Loader2 : RefreshCw} onClick={schemaLoad.fetchSavedSchemas} disabled={schemaLoad.isLoadingSchemas} size="sm"variant="muted"aria-label="Refresh schemas"/>
 </div>
 <div className="space-y-2">
 <Input type="text"placeholder="Search schemas..."value={schemaLoad.schemaSearchQuery} onChange={(e) => schemaLoad.setSchemaSearchQuery(e.target.value)} className="h-9 text-sm"/>
 <ScrollArea className="h-[200px] w-full">
 {schemaLoad.isLoadingSchemas ? (
 <div className="flex items-center justify-center py-8">
 <Loader2 className="h-4 w-4 animate-spin text-muted-foreground"/>
 <span className="ml-2 text-sm text-muted-foreground">Loading schemas...</span>
 </div>
 ) : schemaLoad.savedSchemas.length === 0 ? (
 <div className="text-sm text-muted-foreground py-8 text-center">No saved schemas found</div>
 ) : (
 <div className="space-y-1 pr-4">
 {schemaLoad.savedSchemas
 .filter((schema) => {
 if (!schemaLoad.schemaSearchQuery.trim()) return true;
 const query = schemaLoad.schemaSearchQuery.toLowerCase();
 return schema.name.toLowerCase().includes(query) || schema.category.toLowerCase().includes(query);
 })
 .sort((a, b) => {
 if (a.is_verified && !b.is_verified) return -1;
 if (!a.is_verified && b.is_verified) return 1;
 return 0;
 })
 .map((schema) => (
 <button
 key={schema.id}
 type="button"
 onClick={() => { schemaLoad.setSelectedSchemaId(schema.id); schemaLoad.handleLoadSchema(schema.id); schemaLoad.setShowSchemaPopover(false); }}
 className={cn(
"w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:bg-primary/10 border border-transparent hover:border-primary/30",
 schemaLoad.selectedSchemaId === schema.id &&"bg-primary/10 border-primary/30"
 )}
 >
 <div className="flex items-center gap-2">
 <FileCode className="h-4 w-4 text-primary shrink-0"/>
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-1.5 flex-wrap">
 <div className="font-medium text-foreground truncate">{schema.name}</div>
 {schema.is_verified && <VerifiedBadge size="sm"/>}
 </div>
 <div className="text-xs text-muted-foreground">{schema.category} • Updated {new Date(schema.updatedAt).toLocaleDateString()}</div>
 </div>
 </div>
 </button>
 ))}
 </div>
 )}
 </ScrollArea>
 {schemaId && (
 <p className="text-xs text-muted-foreground pt-1">
 Current: {schemaLoad.savedSchemas.find((s) => s.id === schemaId)?.name || "Unsaved schema"}
 </p>
 )}
 </div>
 </TabsContent>

 <TabsContent value="import"className="space-y-3 mt-0">
 <div className="space-y-3">
 <div>
 <h4 className="text-sm font-semibold text-foreground mb-2">Import from JSON</h4>
 <Label htmlFor="import-text"className="text-xs text-muted-foreground">Paste your schema JSON below</Label>
 </div>
 <Textarea
 id="import-text"
 className="font-mono text-xs min-h-[250px]"
 value={schemaLoad.importText}
 onChange={(e) => schemaLoad.setImportText(e.target.value)}
 placeholder={`Paste your schema JSON here, e.g.:\n{\n"name": "Contract Schema",\n"description": "Schema for contracts",\n"type": "object",\n"properties": {\n"party_name": {\n"type": "string",\n"description": "Name of party"\n }\n },\n"required": ["party_name"]\n}`}
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
 <SecondaryButton onClick={() => { schemaLoad.setImportText(""); schemaLoad.setImportTab("load"); }} size="sm">Cancel</SecondaryButton>
 <PrimaryButton onClick={schemaLoad.handleImportFromJSON} icon={Upload} size="sm"disabled={!schemaLoad.importText.trim()}>Import Schema</PrimaryButton>
 </div>
 </div>
 </TabsContent>
 </TabSelector>
 </PopoverContent>
 </Popover>

 <SaveActions
 onSave={schemaSave.handleOpenSaveDialog}
 onExport={schemaSave.handleExport}
 onDiscard={schemaSave.handleDiscard}
 isDirty={isDirty}
 isSaving={isSaving}
 />
 </div>
 </div>
 </div>

 {/* Main split-pane layout */}
 <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
 <SchemaStudioLayout
 sessionId={sessionId}
 collectionId={selectedCollection && selectedCollection !=="none"? selectedCollection : undefined}
 collectionName={
 selectedCollection && selectedCollection !=="none"
 ? collections.find((c) => c.id === selectedCollection)?.name
 : undefined
 }
 onPreviewClick={() => setShowPreviewDialog(true)}
 />
 </div>
 </div>
 </div>
 </div>

 <SchemaDialogs
 showPreviewDialog={showPreviewDialog}
 onPreviewOpenChange={setShowPreviewDialog}
 previewData={generatePreviewData}
 showSaveDialog={schemaSave.showSaveDialog}
 onSaveOpenChange={schemaSave.setShowSaveDialog}
 saveDialogError={schemaSave.saveDialogError}
 onSaveDialogErrorChange={schemaSave.setSaveDialogError}
 saveSchemaName={schemaSave.saveSchemaName}
 onSaveSchemaNameChange={schemaSave.setSaveSchemaName}
 saveSchemaDescription={schemaSave.saveSchemaDescription}
 onSaveSchemaDescriptionChange={schemaSave.setSaveSchemaDescription}
 isSaving={isSaving}
 fieldsCount={fields.length}
 onSave={schemaSave.handleSave}
 showNewSchemaDialog={showNewSchemaDialog}
 onNewSchemaOpenChange={setShowNewSchemaDialog}
 onConfirmNewSchema={createNewSchema}
 showLoadSchemaDialog={schemaLoad.showLoadSchemaDialog}
 onLoadSchemaOpenChange={() => {}}
 pendingLoadSchemaId={schemaLoad.pendingLoadSchemaId}
 currentSchemaId={schemaId}
 onCancelLoadSchema={schemaLoad.cancelLoadSchema}
 onConfirmLoadSchema={schemaLoad.confirmLoadSchema}
 showNavigationDialog={showNavigationDialog}
 onNavigationOpenChange={setShowNavigationDialog}
 onCancelNavigation={cancelNavigation}
 onConfirmNavigation={confirmNavigation}
 />
 </>
 );
}
