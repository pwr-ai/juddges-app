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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DropdownButton } from "@/lib/styles/components";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertCircle, Type, Hash, ToggleLeft, List, Calendar, ListChecks } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { VariantButton } from "@/lib/styles/components";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SchemaField, ValidationRules } from "@/hooks/schema-editor/types";
import type { FieldType } from "./types";

const INPUT_STYLE =
  "bg-parchment border border-rule text-ink placeholder:text-ink-soft/50 rounded-none focus-visible:ring-1 focus-visible:ring-ink shadow-none";

interface FieldEditorProps {
  field: SchemaField | null;
  open: boolean;
  onSave: (updates: Partial<SchemaField>) => void;
  onCancel: () => void;
}

export function FieldEditor({
  field,
  open,
  onSave,
  onCancel,
}: FieldEditorProps) {
  const [activeTab, setActiveTab] = useState<"basic" | "advanced">("basic");
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType | "enum" | "date">("string");
  const [description, setDescription] = useState("");
  const [example, setExample] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [defaultValue, setDefaultValue] = useState("");
  const [validationRules, setValidationRules] = useState<ValidationRules>({});
  const [showValidation, setShowValidation] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (field) {
      setFieldName(field.field_name);
      const hasEnumRules = field.validation_rules?.enum && Array.isArray(field.validation_rules.enum) && field.validation_rules.enum.length > 0;
      const hasDateFormat = field.validation_rules?.format === 'date';
      setFieldType(hasEnumRules ? "enum" : hasDateFormat ? "date" : field.field_type);
      setDescription(field.description || "");
      const exampleValue = field.validation_rules?.example;
      setExample(
        exampleValue !== undefined && exampleValue !== null
          ? typeof exampleValue === "string"
            ? exampleValue
            : JSON.stringify(exampleValue)
          : ""
      );
      setIsRequired(true);
      setDefaultValue((field as any).default_value || "");
      setValidationRules(field.validation_rules);
      setShowValidation(true);
      setActiveTab("basic");
    } else {
      setFieldName("");
      setFieldType("string");
      setDescription("");
      setExample("");
      setIsRequired(true);
      setDefaultValue("");
      setValidationRules({});
      setShowValidation(true);
      setActiveTab("basic");
    }
    setErrors({});
  }, [field, open]);

  const validateFieldName = (name: string): boolean => {
    if (!name.trim()) {
      setErrors((prev) => ({ ...prev, fieldName: "Field name is required" }));
      return false;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      setErrors((prev) => ({
        ...prev,
        fieldName:
          "Field names can only use letters, numbers and underscores, and can't start with a number — try `party_name` instead of spaces or symbols.",
      }));
      return false;
    }
    setErrors((prev) => {
      const { fieldName, ...rest } = prev;
      return rest;
    });
    return true;
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();

    const isValid = validateFieldName(fieldName);
    if (!isValid) {
      setActiveTab("basic");
      return;
    }

    if (fieldType === "enum") {
      if (!validationRules.enum || !Array.isArray(validationRules.enum) || validationRules.enum.length === 0) {
        setErrors((prev) => ({ ...prev, enumOptions: "At least one option is required for choice type" }));
        setActiveTab("basic");
        return;
      }
      setErrors((prev) => {
        const { enumOptions, ...rest } = prev;
        return rest;
      });
    }

    const actualFieldType: FieldType = fieldType === "enum" || fieldType === "date" ? "string" : fieldType;

    const finalValidationRules = { ...validationRules };
    if (fieldType === "enum") {
      if (!finalValidationRules.enum || !Array.isArray(finalValidationRules.enum)) {
        finalValidationRules.enum = [];
      }
    } else if (fieldType === "date") {
      finalValidationRules.format = "date";
    } else {
      if (finalValidationRules.format === "date") {
        const { format, ...rest } = finalValidationRules;
        Object.assign(finalValidationRules, rest);
      }
    }

    let finalDescription = description;
    const exampleMatch = description.match(/Example:\s*(.+)$/m);
    if (exampleMatch) {
      const exampleValue = exampleMatch[1].trim();
      try {
        const parsed = JSON.parse(exampleValue);
        finalValidationRules.example = parsed;
      } catch {
        finalValidationRules.example = exampleValue;
      }
      finalDescription = description.replace(/\n\nExample:.*$/m, "").trim();
    } else {
      const { example: _, ...rest } = finalValidationRules;
      Object.assign(finalValidationRules, rest);
    }

    const updates: Partial<SchemaField> = {
      field_name: fieldName,
      field_type: actualFieldType,
      description: finalDescription || undefined,
      is_required: true,
      validation_rules: finalValidationRules,
    };

    if (defaultValue) {
      (updates as any).default_value = defaultValue;
    }

    onSave(updates);
  };

  const updateValidationRule = (key: string, value: unknown) => {
    if (value === "" || value === null || value === undefined) {
      const { [key]: _, ...rest } = validationRules;
      setValidationRules(rest);
    } else {
      setValidationRules((prev) => ({ ...prev, [key]: value }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] bg-parchment border border-rule shadow-xl rounded-none p-6">
        <DialogHeader className="relative z-10">
          <DialogTitle className="flex items-center gap-2 font-display text-ink text-lg">
            {field ? `Edit Field: ${field.field_name}` : "Create New Field"}
            {field?.created_by === "ai" && (
              <Badge variant="secondary" className="text-xs rounded-none border border-rule bg-parchment-deep text-ink">
                <Sparkles className="h-3 w-3 mr-1" />
                AI-created
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-ink-soft">
            {field ? "Modify field properties and validation rules." : "Define a new field for your extraction schema."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "basic" | "advanced")} className="relative z-10">
            <TabsList className="mb-3 w-full bg-transparent border-b border-rule rounded-none p-0 h-auto gap-4 justify-start">
              <TabsTrigger
                value="basic"
                className="relative rounded-none px-2 py-2 text-xs font-mono uppercase tracking-wider text-ink-soft hover:text-ink data-[state=active]:text-ink data-[state=active]:border-b-2 data-[state=active]:border-ink data-[state=active]:bg-transparent shadow-none"
              >
                Basic
              </TabsTrigger>
              <TabsTrigger
                value="advanced"
                className="relative rounded-none px-2 py-2 text-xs font-mono uppercase tracking-wider text-ink-soft hover:text-ink data-[state=active]:text-ink data-[state=active]:border-b-2 data-[state=active]:border-ink data-[state=active]:bg-transparent shadow-none"
              >
                Advanced
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[50vh]">
              <div className="pr-4">
                <TabsContent value="basic" className="mt-0">
                  <div className="space-y-4 border border-rule bg-parchment p-4">
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="field-name" className="text-sm font-semibold text-ink">
                          Field Name <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="field-name"
                          value={fieldName}
                          onChange={(e) => {
                            setFieldName(e.target.value);
                            validateFieldName(e.target.value);
                          }}
                          onBlur={() => validateFieldName(fieldName)}
                          placeholder="e.g., party_name, tax_amount"
                          className={cn(
                            INPUT_STYLE,
                            errors.fieldName ? "border-destructive" : ""
                          )}
                        />
                        {errors.fieldName && (
                          <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span>{errors.fieldName}</span>
                          </div>
                        )}
                        <p className="text-xs text-ink-soft mt-1">
                          Use lowercase with underscores (snake_case)
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="field-type" className="text-sm font-semibold text-ink">
                          Field Type <span className="text-destructive">*</span>
                        </Label>
                        <DropdownButton
                          icon={(() => {
                            switch (fieldType) {
                              case "string":
                                return <Type className="h-4 w-4" />;
                              case "number":
                                return <Hash className="h-4 w-4" />;
                              case "boolean":
                                return <ToggleLeft className="h-4 w-4" />;
                              case "array":
                                return <List className="h-4 w-4" />;
                              case "enum":
                                return <ListChecks className="h-4 w-4" />;
                              case "date":
                                return <Calendar className="h-4 w-4" />;
                              default:
                                return <Type className="h-4 w-4" />;
                            }
                          })()}
                          label="Select field type"
                          value={fieldType}
                          options={[
                            { value: "string", label: "text" },
                            { value: "number", label: "number" },
                            { value: "boolean", label: "yes/no" },
                            { value: "array", label: "list" },
                            { value: "enum", label: "choice" },
                            { value: "date", label: "date" },
                          ]}
                          onChange={(value) => {
                            setFieldType(value as FieldType | "enum");
                            if (value === "enum" && (!validationRules.enum || !Array.isArray(validationRules.enum))) {
                              setValidationRules({ ...validationRules, enum: [] });
                            }
                          }}
                          align="start"
                          className="w-full"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="description" className="text-sm font-semibold text-ink">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Describe what this field represents..."
                          rows={3}
                          className={INPUT_STYLE}
                        />
                        <p className="text-xs text-ink-soft mt-1">
                          Help the AI understand what to extract
                        </p>
                      </div>

                      {fieldType === "string" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="example" className="text-sm font-semibold text-ink">Example</Label>
                          <Input
                            id="example"
                            value={example}
                            onChange={(e) => setExample(e.target.value)}
                            placeholder="e.g., John Doe, Company Name"
                            className={INPUT_STYLE}
                          />
                          <p className="text-xs text-ink-soft mt-1">
                            Example text value to help illustrate the expected format
                          </p>
                        </div>
                      )}
                      {fieldType === "array" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="example" className="text-sm font-semibold text-ink">Example</Label>
                          <Input
                            id="example"
                            value={example}
                            onChange={(e) => setExample(e.target.value)}
                            placeholder='e.g., ["item1", "item2"]'
                            className={INPUT_STYLE}
                          />
                          <p className="text-xs text-ink-soft mt-1">
                            Example list value to help illustrate the expected format (JSON array format)
                          </p>
                        </div>
                      )}

                      {fieldType === "enum" && (
                        <div className="space-y-1.5">
                          <Label htmlFor="enum-options" className="text-sm font-semibold text-ink">
                            Options <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id="enum-options"
                            value={
                              validationRules.enum
                                ? validationRules.enum.join(",")
                                : ""
                            }
                            onChange={(e) => {
                              const values = e.target.value
                                ? e.target.value.split(",").map((v) => v.trim()).filter((v) => v.length > 0)
                                : [];
                              if (values.length > 0 || e.target.value === "") {
                                updateValidationRule("enum", values.length > 0 ? values : undefined);
                              }
                              if (errors.enumOptions) {
                                setErrors((prev) => {
                                  const { enumOptions, ...rest } = prev;
                                  return rest;
                                });
                              }
                            }}
                            placeholder="Option 1, Option 2, Option 3"
                            className={cn(
                              INPUT_STYLE,
                              errors.enumOptions ? "border-destructive" : ""
                            )}
                          />
                          {errors.enumOptions && (
                            <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>{errors.enumOptions}</span>
                            </div>
                          )}
                          <p className="text-xs text-ink-soft mt-1">
                            Comma-separated values. Field will only accept these values.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="mt-0">
                  <div className="space-y-4">
                    <div className="space-y-3 border border-rule bg-parchment p-4">
                      <span className="font-mono text-xs uppercase tracking-wider text-ink-soft block">Field Options</span>
                      <div className="space-y-1.5">
                        <Label htmlFor="default-value" className="text-sm font-semibold text-ink">Default Value</Label>
                        <Input
                          id="default-value"
                          value={defaultValue}
                          onChange={(e) => setDefaultValue(e.target.value)}
                          placeholder="Optional default value"
                          className={INPUT_STYLE}
                        />
                        <p className="text-xs text-ink-soft mt-1">
                          Value to use if field is not found in the document
                        </p>
                      </div>
                    </div>

                    <fieldset className="border border-rule bg-parchment p-4 space-y-4">
                      <legend className="px-1.5 font-mono text-xs uppercase tracking-wider text-ink-soft">Validation Rules</legend>
                      <div className="flex items-center justify-between -mt-1">
                        <Label htmlFor="show-validation" className="text-xs text-ink-soft cursor-pointer">Enable validation rules</Label>
                        <Checkbox
                          id="show-validation"
                          checked={showValidation}
                          onCheckedChange={(checked) => setShowValidation(checked === true)}
                          className="h-4 w-4 rounded-none border border-rule data-[state=checked]:bg-pwr-red data-[state=checked]:text-parchment"
                        />
                      </div>

                      {showValidation && (
                        <div className="space-y-4 pt-2">
                          <Alert className="rounded-none border-rule bg-muted/40">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs text-ink-soft">
                              Validation rules help ensure data quality during extraction
                            </AlertDescription>
                          </Alert>

                          {(fieldType === "string" || fieldType === "array") && (
                            <>
                              <div className="space-y-1.5">
                                <Label htmlFor="pattern" className="text-sm font-semibold text-ink">Pattern (Regex)</Label>
                                <Input
                                  id="pattern"
                                  value={validationRules.pattern || ""}
                                  onChange={(e) =>
                                    updateValidationRule("pattern", e.target.value)
                                  }
                                  placeholder="^[A-Z0-9-]+$"
                                  className={INPUT_STYLE}
                                />
                                <p className="text-xs text-ink-soft mt-1">
                                  Regular expression for validation
                                </p>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <Label htmlFor="min-length" className="text-sm font-semibold text-ink">Min Length</Label>
                                  <Input
                                    id="min-length"
                                    type="number"
                                    value={validationRules.minLength || ""}
                                    onChange={(e) =>
                                      updateValidationRule(
                                        "minLength",
                                        e.target.value ? parseInt(e.target.value) : undefined
                                      )
                                    }
                                    placeholder="0"
                                    className={INPUT_STYLE}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label htmlFor="max-length" className="text-sm font-semibold text-ink">Max Length</Label>
                                  <Input
                                    id="max-length"
                                    type="number"
                                    value={validationRules.maxLength || ""}
                                    onChange={(e) =>
                                      updateValidationRule(
                                        "maxLength",
                                        e.target.value ? parseInt(e.target.value) : undefined
                                      )
                                    }
                                    placeholder="100"
                                    className={INPUT_STYLE}
                                  />
                                </div>
                              </div>
                            </>
                          )}

                          {fieldType === "number" && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label htmlFor="minimum" className="text-sm font-semibold text-ink">Minimum</Label>
                                <Input
                                  id="minimum"
                                  type="number"
                                  value={validationRules.minimum || ""}
                                  onChange={(e) =>
                                    updateValidationRule(
                                      "minimum",
                                      e.target.value ? parseFloat(e.target.value) : undefined
                                    )
                                  }
                                  placeholder="0"
                                  className={INPUT_STYLE}
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="maximum" className="text-sm font-semibold text-ink">Maximum</Label>
                                <Input
                                  id="maximum"
                                  type="number"
                                  value={validationRules.maximum || ""}
                                  onChange={(e) =>
                                    updateValidationRule(
                                      "maximum",
                                      e.target.value ? parseFloat(e.target.value) : undefined
                                    )
                                  }
                                  placeholder="1000"
                                  className={INPUT_STYLE}
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label htmlFor="enum" className="text-sm font-semibold text-ink">Enum Values</Label>
                            <Textarea
                              id="enum"
                              value={
                                validationRules.enum
                                  ? validationRules.enum.join("\n")
                                  : ""
                              }
                              onChange={(e) =>
                                updateValidationRule(
                                  "enum",
                                  e.target.value
                                    ? e.target.value.split("\n").filter((v) => v.trim())
                                    : undefined
                                )
                              }
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                              rows={4}
                              className={INPUT_STYLE}
                            />
                            <p className="text-xs text-ink-soft mt-1">
                              One value per line. Field will only accept these values.
                            </p>
                          </div>
                        </div>
                      )}
                    </fieldset>
                  </div>
                </TabsContent>
              </div>
            </ScrollArea>
          </Tabs>

          <div className="relative z-10 flex items-center justify-end gap-3 mt-3 pt-3 border-t border-rule">
            <VariantButton intent="secondary" type="button" onClick={onCancel} size="md">
              Cancel
            </VariantButton>
            <VariantButton intent="primary" type="submit" size="md">
              {field ? "Save Changes" : "Add Field"}
            </VariantButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
