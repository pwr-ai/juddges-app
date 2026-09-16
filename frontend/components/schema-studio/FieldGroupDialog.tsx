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
import { VariantButton, DropdownButton } from "@/lib/styles/components";
import { getFieldTypeLabel } from "@/lib/schema-utils";
import { cn } from "@/lib/utils";
import type { SchemaField } from "@/hooks/schema-editor/types";

let _groupFieldKeyCounter = 0;
const newGroupFieldKey = () => `gf-${++_groupFieldKeyCounter}`;

const INPUT_STYLE = "rounded-none border border-rule bg-parchment text-ink focus:border-ink focus-visible:ring-0";

interface GroupField {
 _key: string;
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
 _key: newGroupFieldKey(),
 name: f.field_name,
 type: hasEnumRules ? "string": hasDateFormat ? "date": f.field_type,
 description: f.description || "",
 enumValues: hasEnumRules ? (f.validation_rules.enum as string[]).join(",") : "",
 isChoice: hasEnumRules
 };
 })
 : [{ _key: newGroupFieldKey(), name: "", type: "string", description: "", enumValues: "", isChoice: false }]
 );
 setFieldGroupPhase(1);
 } else {
 // Creating new group
 setFieldGroupName("");
 setFieldGroupDescription("");
 setGroupFields([{ _key: newGroupFieldKey(), name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
 setFieldGroupPhase(1);
 }
 }
 }, [open, selectedField, fields]);

 const handleFieldGroupNextPhase = () => {
 if (!fieldGroupName.trim()) return;
 setFieldGroupPhase(2);
 };

 const handleAddGroupField = () => {
 setGroupFields([...groupFields, { _key: newGroupFieldKey(), name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
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
 setGroupFields([{ _key: newGroupFieldKey(), name: "", type: "string", description: "", enumValues: "", isChoice: false }]);
 setFieldGroupPhase(1);
 };

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] bg-parchment border border-rule">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <FolderTree className="h-5 w-5 text-ink" />
            {selectedField && selectedField.field_type === "object" ? "Edit Field Group" : "Create Field Group"}
          </DialogTitle>
          <DialogDescription className="text-ink-soft">
            {fieldGroupPhase === 1
              ? "Step 1: Define the group name and description."
              : "Step 2: Add fields to this group."}
          </DialogDescription>
        </DialogHeader>

        {/* Phase indicator */}
        <div className="flex items-center justify-center gap-4 mb-3 border-b border-rule pb-3 font-mono text-xs uppercase tracking-wider">
          <div className={cn(
            "flex items-center gap-2",
            fieldGroupPhase === 1 ? "text-ink font-semibold" : "text-ink-soft"
          )}>
            <span className={cn(
              "w-5 h-5 flex items-center justify-center text-xs border",
              fieldGroupPhase === 1
                ? "border-pwr-red bg-pwr-red text-white"
                : "border-rule text-ink-soft"
            )}>1</span>
            Group Info
          </div>
          <ChevronRight className="h-3.5 w-3.5 text-ink-soft" />
          <div className={cn(
            "flex items-center gap-2",
            fieldGroupPhase === 2 ? "text-ink font-semibold" : "text-ink-soft"
          )}>
            <span className={cn(
              "w-5 h-5 flex items-center justify-center text-xs border",
              fieldGroupPhase === 2
                ? "border-pwr-red bg-pwr-red text-white"
                : "border-rule text-ink-soft"
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
                  <Label htmlFor="field-group-name" className="text-ink text-sm font-semibold">
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
                    className={INPUT_STYLE}
                    autoFocus
                  />
                  <p className="text-xs text-ink-soft">
                    Use lowercase with underscores (snake_case)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="field-group-description" className="text-ink text-sm font-semibold">Description (Optional)</Label>
                  <Textarea
                    id="field-group-description"
                    value={fieldGroupDescription}
                    onChange={(e) => setFieldGroupDescription(e.target.value)}
                    placeholder="Describe what this group represents..."
                    rows={2}
                    className={INPUT_STYLE}
                  />
                </div>
              </>
            ) : (
              /* Phase 2: Add Fields */
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-ink text-sm font-semibold">Add Fields to Group</Label>
                    <VariantButton
                      intent="secondary"
                      onClick={handleAddGroupField}
                      size="sm"
                      icon={Plus}
                    >
                      Add Field
                    </VariantButton>
                  </div>

                  {/* Tree view of added fields */}
                  {groupFields.length > 0 && (
                    <div className="space-y-2 border border-rule p-3 bg-muted/20">
                      <Label className="font-mono text-xs uppercase tracking-wider text-ink-soft">Added Fields ({groupFields.length})</Label>
                      <div className="space-y-1.5">
                        {groupFields.map((field, index) => (
                          <div
                            key={field._key}
                            className="flex items-center justify-between p-2 border border-rule bg-parchment text-ink"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <FolderTree className="h-3.5 w-3.5 text-ink-soft flex-shrink-0" />
                              <span className="font-medium text-sm truncate">{field.name || `Field ${index + 1}`}</span>
                              <span className="text-xs text-ink-soft">•</span>
                              <span className="font-mono text-xs text-ink-soft truncate">
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
                        key={field._key}
                        className="border border-rule p-3 bg-parchment space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <Label className="text-xs text-ink">
                                  Field Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                  value={field.name}
                                  onChange={(e) => handleUpdateGroupField(index, { name: e.target.value })}
                                  placeholder="field_name"
                                  className={cn(
                                    "h-8 text-xs",
                                    INPUT_STYLE,
                                    !field.name.trim() && "border-destructive/50"
                                  )}
                                />
                              </div>
                              <div className="w-32">
                                <Label className="text-xs text-ink">Type</Label>
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
                              <Label className="text-xs text-ink">Description (Optional)</Label>
                              <Input
                                value={field.description}
                                onChange={(e) => handleUpdateGroupField(index, { description: e.target.value })}
                                placeholder="Field description..."
                                className={cn("h-8 text-xs", INPUT_STYLE)}
                              />
                            </div>
                            {(field.isChoice || (field.type === "string" && field.enumValues && field.enumValues.trim())) && (
                              <div>
                                <Label className="text-xs text-ink">Enum Values (Optional, comma-separated)</Label>
                                <Input
                                  value={field.enumValues || ""}
                                  onChange={(e) => handleUpdateGroupField(index, { enumValues: e.target.value })}
                                  placeholder="value1, value2, value3"
                                  className={cn("h-8 text-xs", INPUT_STYLE)}
                                />
                              </div>
                            )}
                          </div>
                          {groupFields.length > 1 && (
                            <VariantButton
                              intent="icon"
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
        <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-rule">
 {fieldGroupPhase === 1 ? (
 <>
 <VariantButton intent="secondary"
 onClick={() => onOpenChange(false)}
 size="sm"
 >
 Cancel
 </VariantButton>
 <VariantButton intent="primary"
 onClick={handleFieldGroupNextPhase}
 size="sm"
 disabled={!fieldGroupName.trim()}
 >
 Continue
 </VariantButton>
 </>
 ) : (
 <>
 <VariantButton intent="secondary"
 onClick={() => setFieldGroupPhase(1)}
 size="sm"
 >
 Back
 </VariantButton>
 <VariantButton intent="secondary"
 onClick={() => onOpenChange(false)}
 size="sm"
 >
 Cancel
 </VariantButton>
 <VariantButton intent="primary"
 onClick={handleCreateFieldGroup}
 size="sm"
 disabled={!fieldGroupName.trim() || groupFields.some(f => !f.name.trim())}
 >
 {selectedField && selectedField.field_type === "object"? "Save Changes": "Create Group"}
 </VariantButton>
 </>
 )}
 </div>
 </DialogContent>
 </Dialog>
 );
}
