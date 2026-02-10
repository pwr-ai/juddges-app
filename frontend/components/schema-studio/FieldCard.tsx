"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconButton, PrimaryButton, SecondaryButton } from "@/lib/styles/components";
import {
  Edit2,
  Trash2,
  GripVertical,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  FolderTree,
  Type,
  Hash,
  ToggleLeft,
  List,
  Check,
  X,
  CircleDot,
  Layers,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { motion, type Variants } from "framer-motion";
import type { SchemaField } from "@/hooks/schema-editor/types";
import type { FieldType } from "./types";
import { TYPE_COLORS } from "./types";
import { useSchemaEditorStore } from "@/hooks/schema-editor/useSchemaEditorStore";

/**
 * Props for the FieldCard component
 */
interface FieldCardProps {
  /** The field to display */
  field: SchemaField;
  /** Callback when edit is requested */
  onEdit: (field: SchemaField) => void;
  /** Callback when delete is requested */
  onDelete: (fieldId: string) => void;
  /** Whether to highlight (for AI-created fields) */
  isHighlighted?: boolean;
  /** Whether the card is being dragged */
  isDragging?: boolean;
  /** Whether the field has validation errors */
  hasError?: boolean;
  /** Drag handle props (from dnd-kit) */
  dragHandleProps?: Record<string, unknown>;
  /** Whether the field is selected */
  isSelected?: boolean;
  /** Callback when selection changes */
  onSelect?: (fieldId: string, selected: boolean) => void;
  /** Whether this field has children (for group badge) */
  hasChildren?: boolean;
  /** Whether selection is disabled (e.g., when parent is selected) */
  isSelectionDisabled?: boolean;
  /** Callback when field is updated */
  onUpdate?: (fieldId: string, updates: Partial<SchemaField>) => void;
  /** Whether to show expanded actions (controlled externally) */
  isExpanded?: boolean;
  /** Callback when card is clicked to toggle expanded state */
  onToggleExpanded?: () => void;
}

/**
 * Get icon component or text for field type
 */
const getFieldTypeIcon = (type: FieldType) => {
  const iconProps = { className: "h-3.5 w-3.5" };
  switch (type) {
    case "string":
      return "Abc";
    case "number":
      return <Hash {...iconProps} />;
    case "boolean":
      return <ToggleLeft {...iconProps} />;
    case "array":
      return <List {...iconProps} />;
    case "object":
      return <FolderTree {...iconProps} />;
    default:
      return "Abc";
  }
};

/**
 * FieldCard - Visual card representation of a schema field
 *
 * Features:
 * - Color-coded by field type (string=blue, number=green, etc.)
 * - Hover elevation effect
 * - Required/optional badge
 * - Edit and delete actions
 * - Drag handle for reordering
 * - Highlight animation for AI-created fields
 * - Error state visualization
 *
 * @example
 * ```tsx
 * <FieldCard
 *   field={field}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   isHighlighted={field.created_by === 'ai'}
 * />
 * ```
 */
export function FieldCard({
  field,
  onEdit,
  onDelete,
  isHighlighted = false,
  isDragging = false,
  hasError = false,
  dragHandleProps,
  isSelected = false,
  onSelect,
  hasChildren = false,
  isSelectionDisabled = false,
  onUpdate,
  isExpanded: controlledExpanded,
  onToggleExpanded,
}: FieldCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState(field.field_name);
  const [isTypePopoverOpen, setIsTypePopoverOpen] = useState(false);
  // Internal expanded state when not controlled externally
  const [internalExpanded, setInternalExpanded] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const { updateField } = useSchemaEditorStore();

  // Use controlled or internal expanded state
  const isActionsExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  // Toggle expanded state
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[role="checkbox"]') ||
      target.closest('[data-radix-popper-content-wrapper]')
    ) {
      return;
    }

    if (onToggleExpanded) {
      onToggleExpanded();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // Handle field name save
  const handleNameSave = () => {
    const trimmedName = editingName.trim();
    if (trimmedName && trimmedName !== field.field_name) {
      // Validate field name (basic validation)
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedName)) {
        if (onUpdate) {
          onUpdate(field.id, { field_name: trimmedName });
        } else {
          updateField(field.id, { field_name: trimmedName });
        }
      }
    }
    setIsEditingName(false);
    setEditingName(field.field_name);
  };

  // Handle field name cancel
  const handleNameCancel = () => {
    setIsEditingName(false);
    setEditingName(field.field_name);
  };

  // Handle field name key press
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameSave();
    } else if (e.key === 'Escape') {
      handleNameCancel();
    }
  };

  // Check if field is a choice type (has enum validation)
  const isChoiceType = field.validation_rules?.enum && Array.isArray(field.validation_rules.enum) && field.validation_rules.enum.length > 0;
  
  // Check if field is a group (object with children)
  const isGroupType = hasChildren && field.field_type === "object";
  
  // Check if type can be changed (groups with children cannot change type)
  const canChangeType = !isGroupType;

  // Get type label for badge
  const getTypeLabel = () => {
    if (isChoiceType) return 'choice';
    if (isGroupType) return 'group';
    return field.field_type;
  };

  // Get type icon for badge
  const getTypeBadgeIcon = () => {
    if (isChoiceType) return <CircleDot className="h-3 w-3" />;
    if (isGroupType) return <Layers className="h-3 w-3" />;
    return getFieldTypeIcon(field.field_type);
  };

  // Handle type change
  const handleTypeChange = (newType: FieldType | 'choice' | 'group') => {
    // Don't allow changing type for groups with children
    if (!canChangeType) {
      return;
    }

    if (newType === 'choice') {
      // Choice is stored as string with enum validation
      if (onUpdate) {
        onUpdate(field.id, { 
          field_type: 'string',
          validation_rules: {
            ...field.validation_rules,
            enum: field.validation_rules?.enum || []
          }
        });
      } else {
        updateField(field.id, { 
          field_type: 'string',
          validation_rules: {
            ...field.validation_rules,
            enum: field.validation_rules?.enum || []
          }
        });
      }
    } else if (newType === 'group') {
      // Group is stored as object type
      if (onUpdate) {
        onUpdate(field.id, { field_type: 'object' });
      } else {
        updateField(field.id, { field_type: 'object' });
      }
    } else {
      // Regular type change
      // If changing from choice, clear enum
      const newValidationRules = { ...field.validation_rules };
      if (isChoiceType && newType !== 'string') {
        delete newValidationRules.enum;
      }
      
      if (onUpdate) {
        onUpdate(field.id, { 
          field_type: newType,
          validation_rules: newValidationRules
        });
      } else {
        updateField(field.id, { 
          field_type: newType,
          validation_rules: newValidationRules
        });
      }
    }
    setIsTypePopoverOpen(false);
  };

  // Get color for field type (use choice color for choice types)
  const typeColor = field.visual_metadata.color || 
    (isChoiceType ? '#8b5cf6' : // purple for choice
     isGroupType ? TYPE_COLORS.object : // use object color for groups
     TYPE_COLORS[field.field_type]);

  // Check if this is a group field (object with children)
  const isGroup = hasChildren && field.field_type === "object";

  // Handle delete confirmation
  const handleDeleteConfirm = () => {
    onDelete(field.id);
    setShowDeleteDialog(false);
  };

  // Animation variants
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
    exit: {
      opacity: 0,
      x: -100,
      transition: { duration: 0.2 },
    },
  };

  const pulseVariants: Variants = {
    pulse: {
      scale: [1, 1.02, 1],
      borderColor: [typeColor, `${typeColor}80`, typeColor],
      transition: { duration: 3 },
    },
  };

  return (
    <>
      <motion.div
        initial="hidden"
        animate={isHighlighted ? "pulse" : "visible"}
        exit="exit"
        variants={isHighlighted ? pulseVariants : cardVariants}
      >
        <div
          onClick={handleCardClick}
          className={cn(
            "group relative transition-all duration-200 rounded-lg cursor-pointer",
            "hover:shadow-lg hover:-translate-y-0.5",
            isDragging && "opacity-50 rotate-2",
            hasError && "border-destructive",
            isHighlighted && "border-primary",
            isActionsExpanded && "ring-2 ring-primary/30"
          )}
          style={{
            borderLeftWidth: "3px",
            borderLeftColor: typeColor,
            // Subtle glassmorphism
            background: "rgba(255, 255, 255, 0.6)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            // Use separate border properties instead of shorthand to avoid conflict with borderLeftColor
            borderTopWidth: "1px",
            borderTopStyle: "solid",
            borderTopColor: "rgba(0, 0, 0, 0.1)",
            borderRightWidth: "1px",
            borderRightStyle: "solid",
            borderRightColor: "rgba(0, 0, 0, 0.1)",
            borderBottomWidth: "1px",
            borderBottomStyle: "solid",
            borderBottomColor: "rgba(0, 0, 0, 0.1)",
            boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
          }}
        >
          {/* Dark mode glassmorphism */}
          <div 
            className="absolute inset-0 rounded-lg opacity-0 dark:opacity-100 transition-opacity pointer-events-none"
            style={{
              background: "rgba(30, 27, 46, 0.6)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
              // Use separate border properties instead of shorthand
              borderTopWidth: "1px",
              borderTopStyle: "solid",
              borderTopColor: "rgba(255, 255, 255, 0.1)",
              borderRightWidth: "1px",
              borderRightStyle: "solid",
              borderRightColor: "rgba(255, 255, 255, 0.1)",
              borderBottomWidth: "1px",
              borderBottomStyle: "solid",
              borderBottomColor: "rgba(255, 255, 255, 0.1)",
              borderLeftWidth: "1px",
              borderLeftStyle: "solid",
              borderLeftColor: "rgba(255, 255, 255, 0.1)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.2)",
            }}
          />
          
          <div className="relative p-3">
            <div className="flex items-center justify-between gap-3">
              {/* Selection checkbox and field name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {onSelect && (
                  <Checkbox
                    checked={isSelected}
                    disabled={isSelectionDisabled}
                    onCheckedChange={(checked) => {
                      if (!isSelectionDisabled) {
                        onSelect(field.id, checked === true);
                      }
                    }}
                    className={cn(
                      "h-6 w-6 rounded-lg bg-white/50 dark:bg-slate-800/50 border border-slate-400 dark:border-slate-500 data-[state=checked]:bg-primary hover:border-primary transition-all duration-200 shrink-0",
                      isSelectionDisabled 
                        ? "cursor-not-allowed opacity-50" 
                        : "cursor-pointer"
                    )}
                  />
                )}
                {isEditingName ? (
                  <Input
                    ref={nameInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleNameSave}
                    onKeyDown={handleNameKeyDown}
                    className="h-6 text-sm font-medium px-2 py-0 min-w-[100px] max-w-[200px]"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    className="font-medium text-sm truncate cursor-pointer hover:text-primary transition-colors px-1 -mx-1 rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingName(true);
                    }}
                    title="Click to edit field name"
                  >
                    {field.field_name}
                  </span>
                )}
                {/* AI-generated review badge */}
                {field.created_by === 'ai' && (
                  <Badge
                    variant="outline"
                    className="text-xs shrink-0 px-2 py-0.5 h-6 flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-400"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span className="font-medium">Review</span>
                  </Badge>
                )}
                <Popover open={isTypePopoverOpen} onOpenChange={setIsTypePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs shrink-0 px-2 py-0.5 h-6 flex items-center gap-1.5 transition-opacity",
                        canChangeType ? "cursor-pointer hover:opacity-80" : "cursor-not-allowed opacity-60"
                      )}
                      style={{ borderColor: typeColor, color: typeColor }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canChangeType) {
                          setIsTypePopoverOpen(true);
                        }
                      }}
                      title={canChangeType ? "Click to change field type" : "Group fields with children cannot change type"}
                    >
                      {getTypeBadgeIcon()}
                      <span className="font-medium capitalize">{getTypeLabel()}</span>
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent 
                    className={cn(
                      "w-56 p-0 border-0 shadow-xl",
                      // Glassmorphism 2.0
                      "bg-white/80 dark:bg-slate-900/80",
                      "backdrop-blur-xl backdrop-saturate-[180%]",
                      "border border-primary/20 dark:border-primary/30",
                      "shadow-[0_18px_45px_0_rgba(15,23,42,0.15),0_8px_20px_0_rgba(139,92,246,0.1),inset_0_1px_0_0_rgba(255,255,255,0.6)]",
                      "dark:shadow-[0_18px_45px_0_rgba(0,0,0,0.4),0_8px_20px_0_rgba(139,92,246,0.15),inset_0_1px_0_0_rgba(255,255,255,0.1)]"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 space-y-1.5">
                      <div className="text-xs font-semibold text-muted-foreground px-2 py-1 mb-1">
                        Select Field Type
                      </div>
                      <div className="text-xs text-muted-foreground px-2 py-1 mb-2 -mt-1">
                        Note: Use the full editor for choice and group types
                      </div>
                      {([
                        { type: 'string' as FieldType, label: 'text', icon: Type, color: TYPE_COLORS.string },
                        { type: 'number' as FieldType, label: 'number', icon: Hash, color: TYPE_COLORS.number },
                        { type: 'boolean' as FieldType, label: 'yes/no', icon: ToggleLeft, color: TYPE_COLORS.boolean },
                        { type: 'array' as FieldType, label: 'list', icon: List, color: TYPE_COLORS.array },
                        { type: 'object' as FieldType, label: 'group', icon: FolderTree, color: TYPE_COLORS.object },
                      ]).map(({ type, label, icon: IconComponent, color }) => {
                        // Don't allow changing to object/group if it's already a group (has children)
                        const isSelected = field.field_type === type && !(type === 'object' && isGroupType);
                        const isDisabled = type === 'object' && isGroupType;
                        
                        return (
                          <button
                            key={type}
                            onClick={() => !isDisabled && handleTypeChange(type)}
                            disabled={isDisabled}
                            className={cn(
                              "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 flex items-center gap-3 group",
                              !isDisabled && "hover:bg-primary/10 dark:hover:bg-primary/20 hover:shadow-sm hover:scale-[1.02]",
                              isDisabled && "opacity-50 cursor-not-allowed",
                              isSelected && cn(
                                "bg-primary/15 dark:bg-primary/25",
                                "border border-primary/30 dark:border-primary/40",
                                "shadow-sm shadow-primary/10"
                              )
                            )}
                          >
                            <div
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center transition-all",
                                "bg-white/60 dark:bg-slate-800/60",
                                "backdrop-blur-sm border",
                                isSelected 
                                  ? "border-primary/40 shadow-sm" 
                                  : "border-slate-200/60 dark:border-slate-700/60 group-hover:border-primary/30"
                              )}
                              style={isSelected ? { 
                                backgroundColor: `${color}15`,
                                borderColor: color 
                              } : {}}
                            >
                              {type === 'string' ? (
                                <span className="text-xs font-semibold" style={{ color }}>Abc</span>
                              ) : (
                                <IconComponent className="h-4 w-4" style={{ color }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground">{label}</div>
                            </div>
                            {isSelected && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                            {isDisabled && (
                              <span className="text-xs text-muted-foreground">(locked)</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Toggle indicator and actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle indicator - always visible */}
                <div
                  className={cn(
                    "flex items-center justify-center w-6 h-6 rounded transition-colors",
                    "text-muted-foreground hover:text-foreground",
                    isActionsExpanded && "text-primary"
                  )}
                  title={isActionsExpanded ? "Click to collapse" : "Click to expand options"}
                >
                  {isActionsExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>

                {/* Actions - shown when expanded */}
                {isActionsExpanded && (
                  <>
                    <IconButton
                      icon={Edit2}
                      size="sm"
                      variant="muted"
                      onClick={() => onEdit(field)}
                      aria-label="Edit field"
                    />
                    <IconButton
                      icon={Trash2}
                      size="sm"
                      variant="error"
                      onClick={() => setShowDeleteDialog(true)}
                      aria-label="Delete field"
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className={cn(
          "bg-white dark:bg-slate-900",
          "border border-border",
          "shadow-xl"
        )}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground font-semibold">Delete field?</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/90">
              Are you sure you want to delete the field &quot;{field.field_name}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 sm:gap-3">
            <SecondaryButton
              onClick={() => setShowDeleteDialog(false)}
              size="sm"
              className="min-w-[80px]"
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={handleDeleteConfirm}
              size="sm"
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground min-w-[80px]"
            >
              Delete
            </PrimaryButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * TODO: Implementation checklist
 *
 * [x] Create base card UI with field information
 * [x] Add type color-coding with border
 * [x] Implement hover effects and elevation
 * [x] Add required/optional badge
 * [x] Add edit and delete actions
 * [x] Implement delete confirmation dialog
 * [x] Add drag handle for reordering
 * [x] Add AI-created indicator (Sparkles icon)
 * [x] Add validation rule indicators
 * [x] Add error state visualization
 * [x] Implement animations with framer-motion
 * [ ] Integrate with dnd-kit for actual drag-and-drop
 * [ ] Add inline quick-edit mode (click field name to edit)
 * [ ] Show nested field hierarchy (indent child fields)
 * [ ] Add expand/collapse for object/array fields
 * [ ] Implement field duplication action
 * [ ] Add field path tooltip
 * [ ] Show position number for debugging
 * [ ] Add keyboard shortcuts (Delete key to remove selected)
 */
