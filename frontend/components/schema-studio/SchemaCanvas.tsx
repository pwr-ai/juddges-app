"use client";

import * as React from "react";
import { useState, useEffect, useMemo } from "react";
import { Plus, Inbox, Trash2, FolderTree, ChevronDown, ChevronRight, GripVertical, Eye, ArrowUp, ArrowDown, Undo2, Redo2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PrimaryButton, SecondaryButton as SecondaryButtonStyled, DropdownButton } from "@/lib/styles/components";
import { getFieldTypeLabel } from "@/lib/schema-utils";
import { SecondaryButton, AccentButton, IconButton } from "@/lib/styles/components";
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
import { FieldCard } from "./FieldCard";
import { FieldEditor } from "./FieldEditor";
import { FieldGroupDialog } from "./FieldGroupDialog";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";
import { useUndoRedo } from "@/hooks/schema-editor/useUndoRedo";
import type { SchemaField } from "@/hooks/schema-editor/types";
import { cn } from "@/lib/utils";

// Drag and drop imports
import {
 DndContext,
 closestCenter,
 KeyboardSensor,
 PointerSensor,
 useSensor,
 useSensors,
 DragEndEvent,
 DragStartEvent,
 DragOverlay,
 defaultDropAnimationSideEffects,
 type DropAnimation,
} from "@dnd-kit/core";
import {
 arrayMove,
 SortableContext,
 sortableKeyboardCoordinates,
 useSortable,
 verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

/**
 * SortableFieldItem - Wrapper for FieldCard with drag handle
 */
interface SortableFieldItemProps {
 field: SchemaField;
 onEdit: (field: SchemaField) => void;
 onDelete: (fieldId: string) => void;
 isSelected: boolean;
 onSelect: (fieldId: string, selected: boolean) => void;
 hasChildren: boolean;
 isSelectionDisabled: boolean;
 isHighlighted: boolean;
 isExpanded?: boolean;
 onToggleExpand?: () => void;
 depth?: number;
 /** Move field up handler */
 onMoveUp?: () => void;
 /** Move field down handler */
 onMoveDown?: () => void;
 /** Whether this is the first item (disable move up) */
 isFirst?: boolean;
 /** Whether this is the last item (disable move down) */
 isLast?: boolean;
}

function SortableFieldItem({
 field,
 onEdit,
 onDelete,
 isSelected,
 onSelect,
 hasChildren,
 isSelectionDisabled,
 isHighlighted,
 isExpanded,
 onToggleExpand,
 depth = 0,
 onMoveUp,
 onMoveDown,
 isFirst = false,
 isLast = false,
}: SortableFieldItemProps) {
 const {
 attributes,
 listeners,
 setNodeRef,
 transform,
 transition,
 isDragging,
 } = useSortable({ id: field.id });

 // Only apply Y transform for vertical sorting (prevents horizontal drift)
 // Use CSS utility for consistent transform handling
 const style: React.CSSProperties = {
 transform: transform ? CSS.Transform.toString({
 ...transform,
 x: 0, // Lock horizontal movement
 scaleX: 1,
 scaleY: 1,
 }) : undefined,
 transition,
 opacity: isDragging ? 0.3 : 1,
 zIndex: isDragging ? 100 : undefined,
 position: 'relative' as const,
 };

 return (
 <div
 ref={setNodeRef}
 style={style}
 className={cn(
"flex items-center gap-1 group relative",
 isDragging &&"shadow-lg rounded-lg bg-background"
 )}
 >
 {/* Reorder controls - shown on hover */}
 <div className={cn(
"flex flex-col items-center gap-0.5 flex-shrink-0",
"opacity-0 group-hover:opacity-100 transition-opacity"
 )}>
 {/* Move up button */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 onMoveUp?.();
 }}
 disabled={isFirst || !onMoveUp}
 className={cn(
"p-0.5 rounded transition-colors",
 isFirst || !onMoveUp
 ? "text-muted-foreground/30 cursor-not-allowed"
 : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
 )}
 aria-label="Move field up"
 title="Move up"
 >
 <ArrowUp className="h-3.5 w-3.5"/>
 </button>

 {/* Drag handle */}
 <button
 {...attributes}
 {...listeners}
 className={cn(
"p-0.5 rounded cursor-grab active:cursor-grabbing",
"hover:bg-muted/50 text-muted-foreground hover:text-foreground"
 )}
 aria-label="Drag to reorder"
 title="Drag to reorder"
 >
 <GripVertical className="h-4 w-4"/>
 </button>

 {/* Move down button */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 onMoveDown?.();
 }}
 disabled={isLast || !onMoveDown}
 className={cn(
"p-0.5 rounded transition-colors",
 isLast || !onMoveDown
 ? "text-muted-foreground/30 cursor-not-allowed"
 : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
 )}
 aria-label="Move field down"
 title="Move down"
 >
 <ArrowDown className="h-3.5 w-3.5"/>
 </button>
 </div>

 {/* Expand/collapse for nested fields */}
 {hasChildren ? (
 <button
 onClick={onToggleExpand}
 className="flex items-center justify-center w-5 h-5 rounded hover:bg-primary/10 transition-colors flex-shrink-0"
 >
 {isExpanded ? (
 <ChevronDown className="h-3.5 w-3.5 text-primary"/>
 ) : (
 <ChevronRight className="h-3.5 w-3.5 text-primary"/>
 )}
 </button>
 ) : depth > 0 ? (
 <div className="w-5 flex-shrink-0"/>
 ) : null}

 {/* Field card */}
 <div className="flex-1 min-w-0">
 <FieldCard
 field={field}
 onEdit={onEdit}
 onDelete={onDelete}
 isSelected={isSelected}
 onSelect={onSelect}
 hasChildren={hasChildren}
 isSelectionDisabled={isSelectionDisabled}
 isHighlighted={isHighlighted}
 />
 </div>
 </div>
 );
}

/**
 * Props for the SchemaCanvas component
 */
interface SchemaCanvasProps {
 /** Session identifier for the schema */
 sessionId: string;
 /** Callback to open preview dialog */
 onPreviewClick?: () => void;
}

/**
 * SchemaCanvas - Canvas container with field list and editing capabilities
 *
 * Features:
 * - Displays all fields as visual cards
 * - Sortable field list (drag-and-drop)
 * - Add new field button
 * - Field editing modal integration
 * - Empty state for new schemas
 *
 * @example
 * ```tsx
 * <SchemaCanvas sessionId="session-123"/>
 * ```
 */
export function SchemaCanvas({ sessionId, onPreviewClick }: SchemaCanvasProps) {
 // Get fields and actions from Zustand store
 const { fields, addField, updateField, deleteField, setSelectedField, selectedField, reorderFields } = useSchemaEditorStore();

 // Undo/redo functionality
 const { undo, redo, canUndo, canRedo } = useUndoRedo();
 const [isEditorOpen, setIsEditorOpen] = useState(false);
 const [draftFieldId, setDraftFieldId] = useState<string | null>(null);
 const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
 const [showGroupDeleteDialog, setShowGroupDeleteDialog] = useState(false);
 const [showFieldGroupDialog, setShowFieldGroupDialog] = useState(false);
 const [activeId, setActiveId] = useState<string | null>(null);

 // Drag and drop sensors
 const sensors = useSensors(
 useSensor(PointerSensor, {
 activationConstraint: {
 distance: 5, // Reduced from 8px for more immediate drag response
 },
 }),
 useSensor(KeyboardSensor, {
 coordinateGetter: sortableKeyboardCoordinates,
 })
 );

 // Get root-level field IDs for sortable context
 const rootFieldIds = useMemo(() => {
 return fields.filter(f => !f.parent_field_id).map(f => f.id);
 }, [fields]);

 // Handle drag start
 const handleDragStart = (event: DragStartEvent) => {
 setActiveId(event.active.id as string);
 };

 // Handle drag end - reorder fields
 const handleDragEnd = (event: DragEndEvent) => {
 const { active, over } = event;
 setActiveId(null);

 if (over && active.id !== over.id) {
 const oldIndex = rootFieldIds.indexOf(active.id as string);
 const newIndex = rootFieldIds.indexOf(over.id as string);

 if (oldIndex !== -1 && newIndex !== -1) {
 reorderFields(oldIndex, newIndex);
 }
 }
 };

 // Get the active field for drag overlay
 const activeField = activeId ? fields.find(f => f.id === activeId) : null;

 // Ensure session is initialized
 useEffect(() => {
 const store = useSchemaEditorStore.getState();
 if (!store.sessionId) {
 store.initializeSession(sessionId);
 }
 }, [sessionId]);

 /**
 * Handle adding a new field - creates draft field immediately
 */
 const handleAddField = () => {
 // Create a draft field immediately with default values
 const draftField = addField({
 session_id: sessionId,
 field_path: "unnamed",
 field_name: "unnamed",
 field_type: "string",
 description: "",
 is_required: true,
 validation_rules: {},
 visual_metadata: {},
 created_by: "user",
 });

 // Set as selected and open editor
 setSelectedField(draftField);
 setDraftFieldId(draftField.id);
 setIsEditorOpen(true);
 };

 /**
 * Handle adding a new field without opening the editor
 */
 const handleAddFieldSimple = () => {
 // Generate a unique field name
 const existingNames = fields.map(f => f.field_name);
 let fieldName ="unnamed";
 let counter = 1;
 while (existingNames.includes(fieldName)) {
 fieldName = `unnamed_${counter}`;
 counter++;
 }

 // Create a field with default values without opening the editor
 addField({
 session_id: sessionId,
 field_path: fieldName,
 field_name: fieldName,
 field_type: "string",
 description: "",
 is_required: true,
 validation_rules: {},
 visual_metadata: {},
 created_by: "user",
 });
 };

 /**
 * Handle opening Field Group dialog
 */
 const handleOpenFieldGroupDialog = () => {
 setShowFieldGroupDialog(true);
 };

 /**
 * Handle creating or updating Field Group from dialog
 */
 const handleCreateFieldGroup = (data: {
 name: string;
 description: string;
 groupFields: Array<{
 name: string;
 type: string;
 description: string;
 enumValues: string;
 isChoice?: boolean;
 }>;
 }) => {
 const isEditing = selectedField && selectedField.field_type === "object";

 if (isEditing && selectedField) {
 // Update existing group field
 updateField(selectedField.id, {
 field_name: data.name,
 field_path: data.name,
 description: data.description || undefined,
 });

 // Get existing nested fields
 const existingNestedFields = fields.filter(f => f.parent_field_id === selectedField.id);

 // Delete nested fields that are no longer in the group
 existingNestedFields.forEach(existingField => {
 const stillExists = data.groupFields.some(gf => gf.name.trim() === existingField.field_name);
 if (!stillExists) {
 deleteField(existingField.id);
 }
 });

 // Update or add nested fields
 data.groupFields.forEach((fieldData) => {
 if (fieldData.name.trim()) {
 const existingField = existingNestedFields.find(f => f.field_name === fieldData.name.trim());
 const fieldType = fieldData.type === "date"? "string": fieldData.type;
 const validationRules: any = {};

 if (fieldData.type === "date") {
 validationRules.format ="date";
 } else if (fieldData.isChoice || (fieldData.type === "string"&& fieldData.enumValues && fieldData.enumValues.trim())) {
 validationRules.enum = fieldData.enumValues.split(",").map(v => v.trim()).filter(v => v);
 }

 if (existingField) {
 // Update existing nested field
 updateField(existingField.id, {
 field_name: fieldData.name.trim(),
 field_path: `${data.name}.${fieldData.name.trim()}`,
 field_type: fieldType as any,
 description: fieldData.description.trim() || undefined,
 validation_rules: validationRules,
 });
 } else {
 // Add new nested field
 addField({
 session_id: sessionId,
 field_path: `${data.name}.${fieldData.name.trim()}`,
 field_name: fieldData.name.trim(),
 field_type: fieldType as any,
 description: fieldData.description.trim() || undefined,
 is_required: true,
 validation_rules: validationRules,
 visual_metadata: {},
 created_by: "user",
 parent_field_id: selectedField.id,
 });
 }
 }
 });
 } else {
 // Create new group field
 const draftField = addField({
 session_id: sessionId,
 field_path: data.name,
 field_name: data.name,
 field_type: "object",
 description: data.description || undefined,
 is_required: true,
 validation_rules: {},
 visual_metadata: {},
 created_by: "user",
 });

 // Add fields from the tree view as nested fields
 data.groupFields.forEach((fieldData) => {
 if (fieldData.name.trim()) {
 const fieldType = fieldData.type === "date"? "string": fieldData.type;
 const validationRules: any = {};

 if (fieldData.type === "date") {
 validationRules.format ="date";
 } else if (fieldData.isChoice || (fieldData.type === "string"&& fieldData.enumValues && fieldData.enumValues.trim())) {
 validationRules.enum = fieldData.enumValues.split(",").map(v => v.trim()).filter(v => v);
 }

 addField({
 session_id: sessionId,
 field_path: `${data.name}.${fieldData.name.trim()}`,
 field_name: fieldData.name.trim(),
 field_type: fieldType as any,
 description: fieldData.description.trim() || undefined,
 is_required: true,
 validation_rules: validationRules,
 visual_metadata: {},
 created_by: "user",
 parent_field_id: draftField.id,
 });
 }
 });
 }
 };

 /**
 * Handle editing an existing field
 */
 const handleEditField = (field: SchemaField) => {
 // Check if this is a group field (object type with children)
 const hasChildren = fields.some(f => f.parent_field_id === field.id);

 if (field.field_type === "object"&& hasChildren) {
 // Open field group editor for group fields
 setSelectedField(field); // Store the field being edited
 setShowFieldGroupDialog(true);
 } else {
 // Regular field editor for non-group fields
 setSelectedField(field);
 setDraftFieldId(null);
 setIsEditorOpen(true);
 }
 };

 /**
 * Handle deleting a field
 */
 const handleDeleteField = (fieldId: string) => {
 deleteField(fieldId);
 if (selectedField?.id === fieldId) {
 setSelectedField(null);
 setIsEditorOpen(false);
 }
 };

 /**
 * Handle saving field (new or updated)
 * The field is already in the store (created as draft), just update it
 */
 const handleSaveField = (updates: Partial<SchemaField>) => {
 if (selectedField) {
 // Update the field in the store (whether it's a draft or existing field)
 updateField(selectedField.id, updates);
 }

 setIsEditorOpen(false);
 setSelectedField(null);
 setDraftFieldId(null);
 };

 /**
 * Handle canceling field edit
 * If it's a draft field, delete it from the store
 */
 const handleCancelEdit = () => {
 // If this was a draft field (just created), delete it
 if (draftFieldId && selectedField?.id === draftFieldId) {
 deleteField(draftFieldId);
 }

 setIsEditorOpen(false);
 setSelectedField(null);
 setDraftFieldId(null);
 };

 /**
 * Handle field selection
 */
 /**
 * Get all child field IDs recursively
 */
 const getAllChildIds = (parentId: string): string[] => {
 const childIds: string[] = [];
 const directChildren = fields.filter(f => f.parent_field_id === parentId);

 for (const child of directChildren) {
 childIds.push(child.id);
 // Recursively get grandchildren
 childIds.push(...getAllChildIds(child.id));
 }

 return childIds;
 };

 /**
 * Check if any parent is selected
 */
 const isParentSelected = (fieldId: string): boolean => {
 const field = fields.find(f => f.id === fieldId);
 if (!field || !field.parent_field_id) return false;

 // Check if direct parent is selected
 if (selectedFields.has(field.parent_field_id)) return true;

 // Recursively check grandparents
 return isParentSelected(field.parent_field_id);
 };

 const handleFieldSelect = (fieldId: string, selected: boolean) => {
 setSelectedFields((prev) => {
 const newSet = new Set(prev);

 if (selected) {
 // Selecting: add the field and all its children
 newSet.add(fieldId);
 const childIds = getAllChildIds(fieldId);
 childIds.forEach(childId => newSet.add(childId));
 } else {
 // Unselecting: only allow if parent is not selected
 const field = fields.find(f => f.id === fieldId);
 if (field && field.parent_field_id && isParentSelected(fieldId)) {
 // Parent is selected, don't allow unselecting
 return prev;
 }

 // Unselect the field and all its children
 newSet.delete(fieldId);
 const childIds = getAllChildIds(fieldId);
 childIds.forEach(childId => newSet.delete(childId));
 }

 return newSet;
 });
 };

 /**
 * Handle group delete
 */
 const handleGroupDelete = () => {
 selectedFields.forEach((fieldId) => {
 deleteField(fieldId);
 if (selectedField?.id === fieldId) {
 setSelectedField(null);
 setIsEditorOpen(false);
 }
 });
 setSelectedFields(new Set());
 setShowGroupDeleteDialog(false);
 };

 /**
 * Build tree structure from flat fields array
 */
 type FieldTreeNode = {
 field: SchemaField;
 children: FieldTreeNode[];
 };

 const buildFieldTree = (fieldsList: SchemaField[]): FieldTreeNode[] => {
 const rootFields = fieldsList.filter(f => !f.parent_field_id);

 const buildChildren = (parentId: string): FieldTreeNode[] => {
 return fieldsList
 .filter(f => f.parent_field_id === parentId)
 .map(f => ({
 field: f,
 children: buildChildren(f.id)
 }));
 };

 return rootFields.map(field => ({
 field,
 children: buildChildren(field.id)
 }));
 };

 // Initialize expanded fields - expand all fields with children by default
 const [expandedFields, setExpandedFields] = useState<Set<string>>(() => {
 const expanded = new Set<string>();
 fields.forEach(field => {
 // Check if this field has any children
 const hasChildren = fields.some(f => f.parent_field_id === field.id);
 if (hasChildren) {
 expanded.add(field.id);
 }
 });
 return expanded;
 });

 // Update expanded fields when fields change
 useEffect(() => {
 setExpandedFields(prev => {
 const newSet = new Set(prev);
 fields.forEach(field => {
 const hasChildren = fields.some(f => f.parent_field_id === field.id);
 if (hasChildren && !newSet.has(field.id)) {
 newSet.add(field.id);
 }
 });
 return newSet;
 });
 }, [fields]);

 const toggleExpand = (fieldId: string) => {
 setExpandedFields(prev => {
 const newSet = new Set(prev);
 if (newSet.has(fieldId)) {
 newSet.delete(fieldId);
 } else {
 newSet.add(fieldId);
 }
 return newSet;
 });
 };

 return (
 <>
 <div className="h-full flex flex-col min-h-0">
 {/* Header with field creator button */}
 <div className="flex-shrink-0 px-4 py-3 border-b border-white/20 flex items-center justify-between gap-2">
 <div className="flex items-center gap-3">
 <h3 className="text-base font-semibold text-foreground">Schema Fields</h3>
 {/* Undo/Redo buttons */}
 <div className="flex items-center gap-1 border-l border-border/40 pl-3">
 <button
 onClick={undo}
 disabled={!canUndo}
 className={cn(
"p-1.5 rounded-md transition-colors",
 canUndo
 ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
 : "text-muted-foreground/30 cursor-not-allowed"
 )}
 aria-label="Undo (Ctrl+Z)"
 title="Undo (Ctrl+Z)"
 >
 <Undo2 className="h-4 w-4"/>
 </button>
 <button
 onClick={redo}
 disabled={!canRedo}
 className={cn(
"p-1.5 rounded-md transition-colors",
 canRedo
 ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
 : "text-muted-foreground/30 cursor-not-allowed"
 )}
 aria-label="Redo (Ctrl+Shift+Z)"
 title="Redo (Ctrl+Shift+Z)"
 >
 <Redo2 className="h-4 w-4"/>
 </button>
 </div>
 </div>
 <div className="flex items-center gap-2">
 {onPreviewClick && (
 <SecondaryButton onClick={onPreviewClick} size="sm"icon={Eye}>
 Preview
 </SecondaryButton>
 )}
 <AccentButton onClick={handleOpenFieldGroupDialog} size="sm"icon={Plus}>
 <span className="flex items-center gap-1.5">
 <FolderTree className="h-3.5 w-3.5"/>
 Group
 </span>
 </AccentButton>
 <AccentButton onClick={handleAddField} size="sm"icon={Plus}>
 Field
 </AccentButton>
 </div>
 </div>

 {/* Field list with glassmorphism */}
 <div className="flex-1 min-h-0 overflow-hidden">
 <ScrollArea className="h-full bg-background">
 <div>
 {fields.length === 0 ? (
 // Empty state with enhanced glassmorphism 2.0 - vertically centered
 <div className="flex items-center justify-center min-h-full p-6">
 <div className={cn(
"relative w-full max-w-md rounded-2xl p-8",
 // Enhanced glassmorphism 2.0 base
"bg-white/30",
"backdrop-blur-xl backdrop-saturate-[180%]",
 // Enhanced borders with glass effect
"border border-primary/40",
 // Multi-layered shadows for depth and glass effect
"shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.2),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
"",
"overflow-hidden"
 )}>
 {/* Minimal glass layer without heavy gradients */}
 <div className="absolute inset-0 pointer-events-none rounded-2xl bg-white/30 -z-10"/>

 {/* Content */}
 <div className="relative z-10 flex flex-col items-center text-center">
 <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 mb-4 backdrop-blur-md border border-primary/30">
 <Inbox className="h-10 w-10 text-primary"/>
 </div>
 <h3 className="text-base font-semibold mb-2">No fields yet</h3>
 <p className="text-sm text-muted-foreground max-w-sm mb-6">
 Start by describing your needs in the chat, or manually add
 fields using the button above.
 </p>
 <SecondaryButton onClick={handleAddFieldSimple} size="sm"icon={Plus}>
 Add Your First Field
 </SecondaryButton>
 </div>
 </div>
 </div>
 ) : (
 // Field cards with glassmorphism container
 <div className="p-6">
 {/* Sticky selection bar - inside the content */}
 {selectedFields.size > 0 && (
 <div className="sticky top-0 z-10 -mx-6 -mt-6 px-6 py-2 flex items-center gap-2 bg-background/95 backdrop-blur-sm border-b border-white/10 mb-3">
 <span className="text-sm text-muted-foreground">
 {selectedFields.size} selected
 </span>
 <IconButton
 icon={Trash2}
 size="sm"
 variant="error"
 onClick={() => setShowGroupDeleteDialog(true)}
 aria-label="Delete selected fields"
 />
 </div>
 )}
 <div className={cn(
"relative rounded-xl p-4",
 // Glassmorphism 2.0 for field list container
"bg-white/20",
"backdrop-blur-lg backdrop-saturate-[180%]",
"border border-primary/20",
"shadow-[0_8px_32px_0_rgba(15,23,42,0.08),0_4px_16px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.4)]",
"",
"overflow-hidden"
 )}>
 {/* Minimal glass layer without heavy gradients */}
 <div className="absolute inset-0 pointer-events-none rounded-xl bg-white/20 -z-10"/>

 {/* Field cards with drag and drop */}
 <DndContext
 sensors={sensors}
 collisionDetection={closestCenter}
 modifiers={[restrictToVerticalAxis]}
 onDragStart={handleDragStart}
 onDragEnd={handleDragEnd}
 >
 <SortableContext
 items={rootFieldIds}
 strategy={verticalListSortingStrategy}
 >
 <div className="relative z-10 space-y-2">
 {(() => {
 const fieldTree = buildFieldTree(fields);
 return fieldTree.map((node, index) => {
 const hasChildren = node.children.length > 0;
 const isExpanded = expandedFields.has(node.field.id);

 return (
 <div key={node.field.id}>
 <SortableFieldItem
 field={node.field}
 onEdit={handleEditField}
 onDelete={handleDeleteField}
 isSelected={selectedFields.has(node.field.id) || isParentSelected(node.field.id)}
 onSelect={handleFieldSelect}
 hasChildren={hasChildren}
 isSelectionDisabled={isParentSelected(node.field.id)}
 isHighlighted={
 node.field.created_by === "ai"&&
 Date.now() - new Date(node.field.created_at || 0).getTime() < 5000
 }
 isExpanded={isExpanded}
 onToggleExpand={() => toggleExpand(node.field.id)}
 onMoveUp={() => {
 if (index > 0) {
 reorderFields(index, index - 1);
 }
 }}
 onMoveDown={() => {
 if (index < fieldTree.length - 1) {
 reorderFields(index, index + 1);
 }
 }}
 isFirst={index === 0}
 isLast={index === fieldTree.length - 1}
 />

 {/* Render nested children (not draggable for now) */}
 {hasChildren && isExpanded && (
 <div className="ml-10 mt-2 space-y-2 pl-3 border-l-2 border-primary/20">
 {node.children.map((child, childIndex) => (
 <SortableFieldItem
 key={child.field.id}
 field={child.field}
 onEdit={handleEditField}
 onDelete={handleDeleteField}
 isSelected={selectedFields.has(child.field.id) || isParentSelected(child.field.id)}
 onSelect={handleFieldSelect}
 hasChildren={child.children.length > 0}
 isSelectionDisabled={isParentSelected(child.field.id)}
 isHighlighted={
 child.field.created_by === "ai"&&
 Date.now() - new Date(child.field.created_at || 0).getTime() < 5000
 }
 depth={1}
 isFirst={childIndex === 0}
 isLast={childIndex === node.children.length - 1}
 />
 ))}
 </div>
 )}
 </div>
 );
 });
 })()}
 </div>
 </SortableContext>

 {/* Drag overlay for better visual feedback */}
 <DragOverlay
 modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
 dropAnimation={{
 duration: 200,
 easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
 sideEffects: defaultDropAnimationSideEffects({
 styles: {
 active: {
 opacity: '0.3',
 },
 },
 }),
 }}
 // Adjust origin to match cursor position better
 style={{
 cursor: 'grabbing',
 }}
 >
 {activeField ? (
 <div
 className="shadow-xl rounded-lg ring-2 ring-primary/50 bg-background"
 style={{
 width: 'max-content',
 minWidth: '300px',
 maxWidth: '500px',
 }}
 >
 <FieldCard
 field={activeField}
 onEdit={() => {}}
 onDelete={() => {}}
 isSelected={false}
 onSelect={() => {}}
 hasChildren={false}
 isSelectionDisabled={true}
 isHighlighted={false}
 />
 </div>
 ) : null}
 </DragOverlay>
 </DndContext>

 {/* Quick add button at bottom */}
 <div className="mt-3">
 <SecondaryButton
 onClick={handleAddFieldSimple}
 size="sm"
 icon={Plus}
 className="w-full border-dashed"
 >
 Add Another Field
 </SecondaryButton>
 </div>
 </div>
 </div>
 )}
 </div>
 </ScrollArea>
 </div>
 </div>

 {/* Field editor modal */}
 <FieldEditor
 field={selectedField}
 open={isEditorOpen}
 onSave={handleSaveField}
 onCancel={handleCancelEdit}
 />

 {/* Group delete confirmation dialog */}
 <AlertDialog open={showGroupDeleteDialog} onOpenChange={setShowGroupDeleteDialog}>
 <AlertDialogContent>
 <AlertDialogHeader>
 <AlertDialogTitle>Delete {selectedFields.size} field{selectedFields.size > 1 ? 's' : ''}?</AlertDialogTitle>
 <AlertDialogDescription>
 Are you sure you want to delete {selectedFields.size > 1 ? 'these fields' : 'this field'}? This action cannot be undone.
 </AlertDialogDescription>
 </AlertDialogHeader>
 <AlertDialogFooter>
 <AlertDialogCancel>Cancel</AlertDialogCancel>
 <AlertDialogAction
 onClick={handleGroupDelete}
 className="bg-destructive hover:bg-destructive/90"
 >
 Delete
 </AlertDialogAction>
 </AlertDialogFooter>
 </AlertDialogContent>
 </AlertDialog>

 {/* Field Group creation dialog */}
 <FieldGroupDialog
 open={showFieldGroupDialog}
 onOpenChange={setShowFieldGroupDialog}
 sessionId={sessionId}
 selectedField={selectedField}
 fields={fields}
 onSave={handleCreateFieldGroup}
 />
 </>
 );
}

/**
 * TODO: Implementation checklist
 *
 * [x] Create base UI with header and scrollable list
 * [x] Implement empty state with call-to-action
 * [x] Add field card rendering
 * [x] Integrate FieldEditor modal
 * [x] Handle add/edit/delete field actions
 * [ ] Connect to zustand store for state management
 * [ ] Implement Supabase CRUD operations
 * [ ] Add drag-and-drop reordering with dnd-kit
 * [ ] Implement optimistic updates with rollback
 * [ ] Add batch operations (delete multiple, reorder)
 * [ ] Implement field search/filter
 * [ ] Add field grouping (by type, by required)
 * [ ] Show nested field hierarchy (indent child fields)
 * [ ] Add expand/collapse for object/array fields
 * [ ] Implement virtual scrolling for 50+ fields
 * [ ] Add keyboard navigation (arrow keys, tab)
 * [ ] Show loading states during operations
 * [ ] Add success/error toast notifications
 * [x] Implement undo/redo for field operations
 */
