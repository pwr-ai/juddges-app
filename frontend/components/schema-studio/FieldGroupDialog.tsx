"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderTree, ChevronRight, X, Type, Plus } from "lucide-react";
import { PrimaryButton, SecondaryButton as SecondaryButtonStyled, DropdownButton, IconButton } from "@/lib/styles/components";
import { getFieldTypeLabel } from "@/lib/schema-utils";
import { cn } from "@/lib/utils";
import type { SchemaField } from "@/hooks/schema-editor/types";

interface GroupField {
  name: string;
  type: string;
  description: string;
  enumValues: string;
  isChoice?: boolean;
}

interface FieldGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  selectedField: SchemaField | null;
  fields: SchemaField[];
  onSave: (data: {
    name: string;
    description: string;
    groupFields: GroupField[];
  }) => void;
}

export function FieldGroupDialog({
  open,
  onOpenChange,
  sessionId,
  selectedField,
  fields,
  onSave,
}: FieldGroupDialogProps) {
  const [fieldGroupPhase, setFieldGroupPhase] = useState<1 | 2>(1);
  const [fieldGroupName, setFieldGroupName] = useState("");
  const [fieldGroupDescription, setFieldGroupDescription] = useState("");
  const [groupFields, setGroupFields] = useState<GroupField[]>([]);

  // Initialize form when dialog opens or selectedField changes
  useEffect(() => {
    if (open) {
      if (selectedField && selectedField.field_type === "object") {
        // Editing existing group
        setFieldGroupName(selectedField.field_name);
        setFieldGroupDescription(selectedField.description || "");
        
        // Load nested fields into groupFields
        const nestedFields = fields.filter(f => f.parent_field_id === selectedField.id);
        setGroupFields(
          nestedFields.length > 0
            ? nestedFields.map(f => {
                const hasEnumRules = f.validation_rules?.enum && Array.isArray(f.validation_rules.enum) && f.validation_rules.enum.length > 0;
                const hasDateFormat = f.validation_rules?.format === 'date';
                return {
                  name: f.field_name,
                  type: hasEnumRules ? "string" : hasDateFormat ? "date" : f.field_type,
                  description: f.description || "",
                  enumValues: hasEnumRules ? (f.validation_rules.enum as string[]).join(", ") : "",
                  isChoice: hasEnumRules
                };
              })
            : [{ name: "", type: "string", description: "", enumValues: "", isChoice: false }]
        );
        setFieldGroupPhase(1);
      } else {
        // Creating new group
        setFieldGroupName("");
        setFieldGroupDescription("");
        setGroupFields([{ name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
        setFieldGroupPhase(1);
      }
    }
  }, [open, selectedField, fields]);

  const handleFieldGroupNextPhase = () => {
    if (!fieldGroupName.trim()) return;
    setFieldGroupPhase(2);
  };

  const handleAddGroupField = () => {
    setGroupFields([...groupFields, { name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
  };

  const handleRemoveGroupField = (index: number) => {
    setGroupFields(groupFields.filter((_, i) => i !== index));
  };

  const handleUpdateGroupField = (index: number, updates: Partial<GroupField>) => {
    setGroupFields(groupFields.map((field, i) => i === index ? { ...field, ...updates } : field));
  };

  const handleCreateFieldGroup = () => {
    if (!fieldGroupName.trim()) return;
    
    onSave({
      name: fieldGroupName.trim(),
      description: fieldGroupDescription.trim(),
      groupFields: groupFields,
    });

    // Close dialog and reset form
    onOpenChange(false);
    setFieldGroupName("");
    setFieldGroupDescription("");
    setGroupFields([{ name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
    setFieldGroupPhase(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-w-2xl max-h-[90vh]",
        "bg-white dark:bg-slate-900",
        "border border-border",
        "shadow-xl"
      )}>
        
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5 text-primary" />
            {selectedField && selectedField.field_type === "object" ? "Edit Field Group" : "Create Field Group"}
          </DialogTitle>
          <DialogDescription>
            {fieldGroupPhase === 1
              ? "Step 1: Define the group name and description."
              : "Step 2: Add fields to this group."}
          </DialogDescription>
        </DialogHeader>

        {/* Phase indicator */}
        <div className={cn(
          "flex items-center justify-center gap-2 mb-3",
          "bg-white/40 dark:bg-slate-900/40",
          "backdrop-blur-xl backdrop-saturate-[180%]",
          "border border-primary/20 dark:border-primary/30",
          "rounded-xl",
          "p-1",
          "shadow-sm"
        )}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            "relative",
            fieldGroupPhase === 1
              ? "bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg shadow-primary/10 text-foreground ring-1 ring-white/30 dark:ring-white/10"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/20 dark:hover:bg-slate-800/20"
          )}>
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center font-semibold",
              fieldGroupPhase === 1 
                ? "bg-primary/20 text-primary" 
                : "bg-muted text-muted-foreground"
            )}>1</span>
            Group Info
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
            "relative",
            fieldGroupPhase === 2
              ? "bg-white/90 dark:bg-slate-800/90 backdrop-blur-md shadow-lg shadow-primary/10 text-foreground ring-1 ring-white/30 dark:ring-white/10"
              : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/20 dark:hover:bg-slate-800/20"
          )}>
            <span className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center font-semibold",
              fieldGroupPhase === 2 
                ? "bg-primary/20 text-primary" 
                : "bg-muted text-muted-foreground"
            )}>2</span>
            Add Fields
          </div>
        </div>

        <ScrollArea className="max-h-[50vh] pr-4">
          <div className="space-y-4 py-4">
            {fieldGroupPhase === 1 ? (
              /* Phase 1: Group Information */
              <>
                <div className="space-y-2">
                  <Label htmlFor="field-group-name">
                    Group Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="field-group-name"
                    value={fieldGroupName}
                    onChange={(e) => setFieldGroupName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && fieldGroupName.trim()) {
                        handleFieldGroupNextPhase();
                      } else if (e.key === "Escape") {
                        onOpenChange(false);
                      }
                    }}
                    placeholder="e.g., address, party_info"
                    className={cn(
                      "bg-white/60 dark:bg-slate-900/60",
                      "backdrop-blur-md backdrop-saturate-[180%]",
                      "border-primary/20 dark:border-primary/30",
                      "shadow-sm",
                      "rounded-lg"
                    )}
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Use lowercase with underscores (snake_case)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="field-group-description">Description (Optional)</Label>
                  <Textarea
                    id="field-group-description"
                    value={fieldGroupDescription}
                    onChange={(e) => setFieldGroupDescription(e.target.value)}
                    placeholder="Describe what this group represents..."
                    rows={2}
                    className={cn(
                      "bg-white/60 dark:bg-slate-900/60",
                      "backdrop-blur-md backdrop-saturate-[180%]",
                      "border-primary/20 dark:border-primary/30",
                      "shadow-sm",
                      "rounded-lg"
                    )}
                  />
                </div>
              </>
            ) : (
              /* Phase 2: Add Fields */
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Add Fields to Group</Label>
                    <SecondaryButtonStyled
                      onClick={handleAddGroupField}
                      size="sm"
                      icon={Plus}
                    >
                      Add Field
                    </SecondaryButtonStyled>
                  </div>

                  {/* Tree view of added fields */}
                  {groupFields.length > 0 && (
                    <div className="space-y-2 border rounded-lg p-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
                      <Label className="text-xs text-muted-foreground">Added Fields ({groupFields.length})</Label>
                      <div className="space-y-1.5">
                        {groupFields.map((field, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 rounded-md bg-white/60 dark:bg-slate-800/60 border border-primary/10 hover:border-primary/20 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FolderTree className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                              <span className="font-medium text-sm truncate">{field.name || `Field ${index + 1}`}</span>
                              <span className="text-xs text-muted-foreground">•</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {(() => {
                                  if (field.isChoice || (field.type === "string" && field.enumValues && field.enumValues.trim())) {
                                    return "choice";
                                  }
                                  return getFieldTypeLabel(field.type);
                                })()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Field forms */}
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                    {groupFields.map((field, index) => (
                      <div
                        key={index}
                        className="border rounded-lg p-3 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Label className="text-xs">
                                  Field Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  value={field.name}
                                  onChange={(e) => handleUpdateGroupField(index, { name: e.target.value })}
                                  placeholder="field_name"
                                  className={cn(
                                    "h-8 text-xs",
                                    "bg-white/60 dark:bg-slate-900/60",
                                    "backdrop-blur-md backdrop-saturate-[180%]",
                                    "border-primary/20 dark:border-primary/30",
                                    "shadow-sm",
                                    "rounded-lg",
                                    !field.name.trim() && "border-destructive/50"
                                  )}
                                />
                              </div>
                              <div className="w-32">
                                <Label className="text-xs">Type</Label>
                                <DropdownButton
                                  icon={<Type className="h-3.5 w-3.5" />}
                                  label={(() => {
                                    // Map stored type back to display type
                                    if (field.type === "string" && field.enumValues) {
                                      return "choice";
                                    }
                                    if (field.type === "string") {
                                      return getFieldTypeLabel("string");
                                    }
                                    return getFieldTypeLabel(field.type);
                                  })()}
                                  value={(() => {
                                    // Map stored type to display value
                                    if (field.isChoice || (field.type === "string" && field.enumValues && field.enumValues.trim())) {
                                      return "enum";
                                    }
                                    if (field.type === "string") {
                                      return "string";
                                    }
                                    return field.type;
                                  })()}
                                  options={[
                                    { value: "string", label: "text" },
                                    { value: "number", label: "number" },
                                    { value: "boolean", label: "yes/no" },
                                    { value: "array", label: "list" },
                                    { value: "date", label: "date" },
                                    { value: "enum", label: "choice" },
                                  ]}
                                  onChange={(value) => {
                                    const actualType = value === "date" ? "string" : (value === "enum" ? "string" : value);
                                    handleUpdateGroupField(index, { 
                                      type: actualType,
                                      enumValues: value === "enum" ? (field.enumValues || "") : "",
                                      isChoice: value === "enum"
                                    });
                                  }}
                                  align="start"
                                  className="h-8 text-xs"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">Description (Optional)</Label>
                              <Input
                                value={field.description}
                                onChange={(e) => handleUpdateGroupField(index, { description: e.target.value })}
                                placeholder="Field description..."
                                className={cn(
                                  "h-8 text-xs",
                                  "bg-white/60 dark:bg-slate-900/60",
                                  "backdrop-blur-md backdrop-saturate-[180%]",
                                  "border-primary/20 dark:border-primary/30",
                                  "shadow-sm",
                                  "rounded-lg"
                                )}
                              />
                            </div>
                            {(field.isChoice || (field.type === "string" && field.enumValues && field.enumValues.trim())) && (
                              <div>
                                <Label className="text-xs">Enum Values (Optional, comma-separated)</Label>
                                <Input
                                  value={field.enumValues || ""}
                                  onChange={(e) => handleUpdateGroupField(index, { enumValues: e.target.value })}
                                  placeholder="value1, value2, value3"
                                  className={cn(
                                    "h-8 text-xs",
                                    "bg-white/60 dark:bg-slate-900/60",
                                    "backdrop-blur-md backdrop-saturate-[180%]",
                                    "border-primary/20 dark:border-primary/30",
                                    "shadow-sm",
                                    "rounded-lg"
                                  )}
                                />
                              </div>
                            )}
                          </div>
                          {groupFields.length > 1 && (
                            <IconButton
                              icon={X}
                              size="sm"
                              variant="error"
                              onClick={() => handleRemoveGroupField(index)}
                              aria-label="Remove field"
                              className="mt-6"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-border/50">
          {fieldGroupPhase === 1 ? (
            <>
              <SecondaryButtonStyled
                onClick={() => onOpenChange(false)}
                size="sm"
              >
                Cancel
              </SecondaryButtonStyled>
              <PrimaryButton
                onClick={handleFieldGroupNextPhase}
                size="sm"
                disabled={!fieldGroupName.trim()}
              >
                Continue
              </PrimaryButton>
            </>
          ) : (
            <>
              <SecondaryButtonStyled
                onClick={() => setFieldGroupPhase(1)}
                size="sm"
              >
                Back
              </SecondaryButtonStyled>
              <SecondaryButtonStyled
                onClick={() => onOpenChange(false)}
                size="sm"
              >
                Cancel
              </SecondaryButtonStyled>
              <PrimaryButton
                onClick={handleCreateFieldGroup}
                size="sm"
                disabled={!fieldGroupName.trim() || groupFields.some(f => !f.name.trim())}
              >
                {selectedField && selectedField.field_type === "object" ? "Save Changes" : "Create Group"}
              </PrimaryButton>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

