"use client";

import * as React from "react";
import { useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
 AlertDialog,
 AlertDialogAction,
 AlertDialogCancel,
 AlertDialogContent,
 AlertDialogDescription,
 AlertDialogFooter,
 AlertDialogHeader,
 AlertDialogTitle,
 AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
 Loader2,
 History,
 RotateCcw,
 Sparkles,
 Edit,
 Code,
 Plus,
 Download,
 GitMerge,
 Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVersionStore } from "@/hooks/schema-editor/usePlaygroundStore";
import { formatDistanceToNow } from "date-fns";
import type { SchemaVersionSummary, SchemaChangeType } from "@/types/schema-playground";

interface VersionsTabProps {
 schemaId: string | null;
}

// Icon mapping for change types
const CHANGE_TYPE_ICONS: Record<SchemaChangeType, React.ReactNode> = {
 create: <Plus className="h-3.5 w-3.5"/>,
 ai_update: <Sparkles className="h-3.5 w-3.5"/>,
 visual_edit: <Edit className="h-3.5 w-3.5"/>,
 code_edit: <Code className="h-3.5 w-3.5"/>,
 import: <Download className="h-3.5 w-3.5"/>,
 bulk_import: <Download className="h-3.5 w-3.5"/>,
 rollback: <RotateCcw className="h-3.5 w-3.5"/>,
 merge: <GitMerge className="h-3.5 w-3.5"/>,
};

// Color mapping for change types
const CHANGE_TYPE_COLORS: Record<SchemaChangeType, string> = {
 create: "bg-green-100 text-green-700",
 ai_update: "bg-purple-100 text-purple-700",
 visual_edit: "bg-blue-100 text-blue-700",
 code_edit: "bg-gray-100 text-gray-700",
 import: "bg-cyan-100 text-cyan-700",
 bulk_import: "bg-cyan-100 text-cyan-700",
 rollback: "bg-orange-100 text-orange-700",
 merge: "bg-indigo-100 text-indigo-700",
};

// Label mapping for change types
const CHANGE_TYPE_LABELS: Record<SchemaChangeType, string> = {
 create: "Created",
 ai_update: "AI Update",
 visual_edit: "Visual Edit",
 code_edit: "Code Edit",
 import: "Imported",
 bulk_import: "Bulk Import",
 rollback: "Rollback",
 merge: "Merged",
};

/**
 * VersionsTab - View and manage schema version history
 *
 * Allows users to:
 * 1. View all versions of a schema
 * 2. See what changed in each version
 * 3. Rollback to a previous version
 */
export function VersionsTab({ schemaId }: VersionsTabProps) {
 const {
 versions,
 currentVersion,
 isLoadingVersions,
 isRollingBack,
 setVersions,
 setLoadingVersions,
 setRollingBack,
 } = useVersionStore();

 // Load versions when schemaId changes
 useEffect(() => {
 if (!schemaId) {
 setVersions([], 1);
 return;
 }

 const loadVersions = async () => {
 setLoadingVersions(true);
 try {
 const response = await fetch(`/api/schemas/${schemaId}/versions`);
 if (!response.ok) throw new Error("Failed to load versions");

 const data = await response.json();
 setVersions(data.versions || [], data.current_version || 1);
 } catch (error) {
 toast.error("Failed to load version history");
 }
 };

 loadVersions();
 }, [schemaId, setVersions, setLoadingVersions]);

 // Handle rollback
 const handleRollback = useCallback(
 async (versionNumber: number) => {
 if (!schemaId) return;

 setRollingBack(true);
 try {
 const response = await fetch(
 `/api/schemas/${schemaId}/versions/${versionNumber}/rollback`,
 {
 method: "POST",
 headers: {"Content-Type": "application/json"},
 body: JSON.stringify({}),
 }
 );

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.detail || "Rollback failed");
 }

 const result = await response.json();

 toast.success("Rollback successful", {
 description: `Restored version ${versionNumber}. New version: ${result.new_version}`,
 });

 // Reload versions
 const versionsResponse = await fetch(`/api/schemas/${schemaId}/versions`);
 const versionsData = await versionsResponse.json();
 setVersions(versionsData.versions || [], versionsData.current_version || 1);

 // TODO: Reload schema fields in editor
 } catch (error) {
 const message = error instanceof Error ? error.message : "Unknown error";
 toast.error("Rollback failed", { description: message });
 } finally {
 setRollingBack(false);
 }
 },
 [schemaId, setRollingBack, setVersions]
 );

 // If no schema, show placeholder
 if (!schemaId) {
 return (
 <div className="h-full flex items-center justify-center p-8">
 <div className="text-center text-muted-foreground">
 <History className="h-12 w-12 mx-auto mb-4 opacity-50"/>
 <h3 className="text-lg font-medium mb-2">No Version History</h3>
 <p className="text-sm">Save your schema to start tracking versions.</p>
 </div>
 </div>
 );
 }

 // Loading state
 if (isLoadingVersions) {
 return (
 <div className="h-full flex items-center justify-center">
 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground"/>
 </div>
 );
 }

 // Empty state
 if (versions.length === 0) {
 return (
 <div className="h-full flex items-center justify-center p-8">
 <div className="text-center text-muted-foreground">
 <History className="h-12 w-12 mx-auto mb-4 opacity-50"/>
 <h3 className="text-lg font-medium mb-2">No Versions Yet</h3>
 <p className="text-sm">Make changes to your schema to create versions.</p>
 </div>
 </div>
 );
 }

 return (
 <div className="h-full flex flex-col">
 {/* Header */}
 <div className="flex-shrink-0 p-4 border-b border-border/40 bg-background/50">
 <div className="flex items-center justify-between">
 <div>
 <h3 className="font-medium">Version History</h3>
 <p className="text-sm text-muted-foreground">
 {versions.length} version{versions.length !== 1 ? "s": ""}
 </p>
 </div>
 <Badge variant="outline">Current: v{currentVersion}</Badge>
 </div>
 </div>

 {/* Version list */}
 <ScrollArea className="flex-1">
 <div className="p-4 space-y-3">
 {versions.map((version, index) => (
 <VersionCard
 key={version.id}
 version={version}
 isCurrent={version.version_number === currentVersion}
 isRollingBack={isRollingBack}
 onRollback={handleRollback}
 />
 ))}
 </div>
 </ScrollArea>
 </div>
 );
}

// Version card component
function VersionCard({
 version,
 isCurrent,
 isRollingBack,
 onRollback,
}: {
 version: SchemaVersionSummary;
 isCurrent: boolean;
 isRollingBack: boolean;
 onRollback: (versionNumber: number) => void;
}) {
 const changeType = version.change_type as SchemaChangeType;
 const icon = CHANGE_TYPE_ICONS[changeType] || <Edit className="h-3.5 w-3.5"/>;
 const colorClass = CHANGE_TYPE_COLORS[changeType] || CHANGE_TYPE_COLORS.visual_edit;
 const label = CHANGE_TYPE_LABELS[changeType] || changeType;

 return (
 <div
 className={cn(
"p-4 rounded-lg border transition-colors",
 isCurrent
 ? "border-primary/40 bg-primary/5"
 : "border-border/40 bg-background hover:bg-muted/50"
 )}
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 {/* Version header */}
 <div className="flex items-center gap-2 mb-2">
 <Badge variant="outline"className="font-mono">
 v{version.version_number}
 </Badge>
 <Badge className={cn("gap-1", colorClass)}>
 {icon}
 {label}
 </Badge>
 {isCurrent && (
 <Badge variant="default"className="gap-1 bg-green-500">
 <Check className="h-3 w-3"/>
 Current
 </Badge>
 )}
 </div>

 {/* Change summary */}
 {version.change_summary && (
 <p className="text-sm text-muted-foreground mb-2">
 {version.change_summary}
 </p>
 )}

 {/* Changed fields */}
 {version.changed_fields && version.changed_fields.length > 0 && (
 <div className="flex flex-wrap gap-1 mb-2">
 {version.changed_fields.slice(0, 5).map((field) => (
 <Badge key={field} variant="secondary"className="text-xs font-mono">
 {field}
 </Badge>
 ))}
 {version.changed_fields.length > 5 && (
 <Badge variant="secondary"className="text-xs">
 +{version.changed_fields.length - 5} more
 </Badge>
 )}
 </div>
 )}

 {/* Timestamp */}
 <p className="text-xs text-muted-foreground">
 {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
 </p>
 </div>

 {/* Actions */}
 {!isCurrent && (
 <AlertDialog>
 <AlertDialogTrigger asChild>
 <Button
 size="sm"
 variant="outline"
 disabled={isRollingBack}
 className="flex-shrink-0"
 >
 {isRollingBack ? (
 <Loader2 className="h-4 w-4 animate-spin"/>
 ) : (
 <>
 <RotateCcw className="h-4 w-4 mr-1"/>
 Rollback
 </>
 )}
 </Button>
 </AlertDialogTrigger>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Rollback to version {version.version_number}?</AlertDialogTitle>
 <AlertDialogDescription>
 This will restore the schema to its state at version {version.version_number}.
 A new version will be created to preserve the audit trail.
 This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction onClick={() => onRollback(version.version_number)}>
 Rollback
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>
 )}
 </div>
 </div>
 );
}
