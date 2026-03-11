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
import { Checkbox } from "@/lib/styles/components";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, AlertCircle, Type, Hash, ToggleLeft, List, Calendar, ListChecks } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PrimaryButton, SecondaryButton, AccentButton, BaseCard, LightCard, SectionHeader } from "@/lib/styles/components";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { SchemaField, ValidationRules } from "@/hooks/schema-editor/types";
import type { FieldType } from "./types";

/**
 * Props for the FieldEditor component
 */
interface FieldEditorProps {
 /** The field to edit (null for new field) */
 field: SchemaField | null;
 /** Whether the dialog is open */
 open: boolean;
 /** Callback when save is requested */
 onSave: (updates: Partial<SchemaField>) => void;
 /** Callback when cancel is requested */
 onCancel: () => void;
}

/**
 * FieldEditor - Tab-based field editing modal
 *
 * Basic Tab: Basic Information
 * - Field Name
 * - Field Type
 * - Description
 * - Required/Optional
 *
 * Advanced Tab: Advanced Options
 * - Default Value
 * - Validation Rules
 */
export function FieldEditor({
 field,
 open,
 onSave,
 onCancel,
}: FieldEditorProps) {
 // Tab state
 const [activeTab, setActiveTab] = useState<"basic"|"advanced">("basic");

 // Form state
 const [fieldName, setFieldName] = useState("");
 const [fieldType, setFieldType] = useState<FieldType |"enum"|"date">("string");
 const [description, setDescription] = useState("");
 const [example, setExample] = useState("");
 const [isRequired, setIsRequired] = useState(false);
 const [defaultValue, setDefaultValue] = useState("");

 // Validation rules state
 const [validationRules, setValidationRules] = useState<ValidationRules>({});
 const [showValidation, setShowValidation] = useState(true);

 // Validation error state
 const [errors, setErrors] = useState<Record<string, string>>({});

 // Initialize form when field changes
 useEffect(() => {
 if (field) {
 setFieldName(field.field_name);
 // If field has enum validation rules, treat it as enum type for display
 const hasEnumRules = field.validation_rules?.enum && Array.isArray(field.validation_rules.enum) && field.validation_rules.enum.length > 0;
 // If field has date format, treat it as date type for display
 const hasDateFormat = field.validation_rules?.format === 'date';
 setFieldType(hasEnumRules ? "enum": hasDateFormat ? "date": field.field_type);
 setDescription(field.description || "");
 // Extract example from validation_rules, handle different types
 const exampleValue = field.validation_rules?.example;
 setExample(
 exampleValue !== undefined && exampleValue !== null
 ? typeof exampleValue === "string"
 ? exampleValue
 : JSON.stringify(exampleValue)
 : ""
 );
 setIsRequired(true); // All fields are required
 setDefaultValue((field as any).default_value || "");
 setValidationRules(field.validation_rules);
 setShowValidation(true);
 setActiveTab("basic"); // Reset to basic tab when editing
 } else {
 // Reset for new field
 setFieldName("");
 setFieldType("string");
 setDescription("");
 setExample("");
 setIsRequired(true); // All fields are required
 setDefaultValue("");
 setValidationRules({});
 setShowValidation(true);
 setActiveTab("basic");
 }
 setErrors({});
 }, [field, open]);

 /**
 * Validate field name
 * Must be non-empty, alphanumeric with underscores, no spaces
 */
 const validateFieldName = (name: string): boolean => {
 if (!name.trim()) {
 setErrors((prev) => ({ ...prev, fieldName: "Field name is required"}));
 return false;
 }
 if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
 setErrors((prev) => ({
 ...prev,
 fieldName: "Field name must be alphanumeric with underscores, no spaces",
 }));
 return false;
 }
 setErrors((prev) => {
 const { fieldName, ...rest } = prev;
 return rest;
 });
 return true;
 };

 /**
 * Handle form submission
 */
 const handleSubmit = (e: React.FormEvent) => {
 e.preventDefault();

 // Validate field name before submitting
 const isValid = validateFieldName(fieldName);
 if (!isValid) {
 // Switch to basic tab if validation fails
 setActiveTab("basic");
 return;
 }

 // Validate enum options if field type is enum
 if (fieldType === "enum") {
 if (!validationRules.enum || !Array.isArray(validationRules.enum) || validationRules.enum.length === 0) {
 setErrors((prev) => ({ ...prev, enumOptions: "At least one option is required for choice type"}));
 setActiveTab("basic");
 return;
 }
 setErrors((prev) => {
 const { enumOptions, ...rest } = prev;
 return rest;
 });
 }

 // Map enum to string type (enum is stored as string with enum validation rules)
 // Map date to string type (date is stored as string with format:date)
 const actualFieldType: FieldType = fieldType === "enum"|| fieldType === "date"? "string": fieldType;

 // If enum type is selected, ensure enum validation rules are present
 // If date type is selected, ensure format:date is set
 const finalValidationRules = { ...validationRules };
 if (fieldType === "enum") {
 // If enum validation rules don't exist, initialize with empty array
 if (!finalValidationRules.enum || !Array.isArray(finalValidationRules.enum)) {
 finalValidationRules.enum = [];
 }
 } else if (fieldType === "date") {
 // Set format to date
 finalValidationRules.format ="date";
 } else {
 // Remove format if changing away from date
 if (finalValidationRules.format === "date") {
 const { format, ...rest } = finalValidationRules;
 Object.assign(finalValidationRules, rest);
 }
 }

 // Extract example from description if present (format: "Description text\n\nExample: value")
 let finalDescription = description;
 const exampleMatch = description.match(/Example:\s*(.+)$/m);
 if (exampleMatch) {
 const exampleValue = exampleMatch[1].trim();
 try {
 const parsed = JSON.parse(exampleValue);
 finalValidationRules.example = parsed;
 } catch {
 // Not valid JSON, store as string
 finalValidationRules.example = exampleValue;
 }
 // Remove example from description
 finalDescription = description.replace(/\n\nExample:.*$/m,"").trim();
 } else {
 // Remove example if not in description
 const { example: _, ...rest } = finalValidationRules;
 Object.assign(finalValidationRules, rest);
 }

 // Build updates object
 const updates: Partial<SchemaField> = {
 field_name: fieldName,
 field_type: actualFieldType,
 description: finalDescription || undefined,
 is_required: true, // All fields are required by default
 validation_rules: finalValidationRules,
 };

 // Add default_value if provided (not part of SchemaField type but may be stored)
 if (defaultValue) {
 (updates as any).default_value = defaultValue;
 }

 onSave(updates);
 };

 /**
 * Update validation rule
 */
 const updateValidationRule = (key: string, value: unknown) => {
 if (value === ""|| value === null || value === undefined) {
 // Remove rule if empty
 const { [key]: _, ...rest } = validationRules;
 setValidationRules(rest);
 } else {
 setValidationRules((prev) => ({ ...prev, [key]: value }));
 }
 };

 return (
 <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
 <DialogContent className={cn(
"max-w-2xl max-h-[90vh]",
"bg-white",
"border border-border",
"shadow-xl"
 )}>

 <DialogHeader className="relative z-10">
 <DialogTitle className="flex items-center gap-2">
 {field ? `Edit Field: ${field.field_name}` : "Create New Field"}
 {field?.created_by === "ai"&& (
 <Badge variant="secondary"className="text-xs">
 <Sparkles className="h-3 w-3 mr-1"/>
 AI-created
 </Badge>
 )}
 </DialogTitle>
 <DialogDescription>
 {field ? "Modify field properties and validation rules.": "Define a new field for your extraction schema."}
 </DialogDescription>
 </DialogHeader>

 <form onSubmit={handleSubmit}>
 <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as"basic"|"advanced")} className="relative z-10">
 <TabsList className={cn(
"mb-3 w-full",
"bg-white/40",
"backdrop-blur-xl backdrop-saturate-[180%]",
"border border-primary/20",
"rounded-xl",
"p-1",
"h-auto",
"gap-1",
"shadow-sm"
 )}>
 <TabsTrigger
 value="basic"
 className={cn(
"flex-1",
"relative",
"data-[state=active]:bg-white/90",
"data-[state=active]:backdrop-blur-md",
"data-[state=active]:shadow-lg",
"data-[state=active]:shadow-primary/10",
"data-[state=active]:text-foreground",
"data-[state=active]:ring-1 data-[state=active]:ring-white/30",
"data-[state=inactive]:bg-transparent",
"data-[state=inactive]:text-muted-foreground",
"data-[state=inactive]:hover:text-foreground",
"data-[state=inactive]:hover:bg-white/20",
"rounded-lg",
"px-4 py-2",
"font-medium",
"transition-all duration-200"
 )}
 >
 Basic
 </TabsTrigger>
 <TabsTrigger
 value="advanced"
 className={cn(
"flex-1",
"relative",
"data-[state=active]:bg-white/90",
"data-[state=active]:backdrop-blur-md",
"data-[state=active]:shadow-lg",
"data-[state=active]:shadow-primary/10",
"data-[state=active]:text-foreground",
"data-[state=active]:ring-1 data-[state=active]:ring-white/30",
"data-[state=inactive]:bg-transparent",
"data-[state=inactive]:text-muted-foreground",
"data-[state=inactive]:hover:text-foreground",
"data-[state=inactive]:hover:bg-white/20",
"rounded-lg",
"px-4 py-2",
"font-medium",
"transition-all duration-200"
 )}
 >
 Advanced
 </TabsTrigger>
 </TabsList>

 <ScrollArea className="h-[50vh]">
 <div className="pr-4">
 <TabsContent value="basic"className="mt-0">
 <BaseCard variant="light"className="p-3">
 <div className="space-y-3">
 {/* Field Name */}
 <div className="space-y-1.5">
 <Label htmlFor="field-name"className="text-sm font-semibold">
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
 errors.fieldName ? "border-destructive": "",
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm",
"rounded-lg"
 )}
 />
 {errors.fieldName && (
 <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1">
 <AlertCircle className="h-3.5 w-3.5"/>
 <span>{errors.fieldName}</span>
 </div>
 )}
 <p className="text-xs text-muted-foreground mt-1">
 Use lowercase with underscores (snake_case)
 </p>
 </div>

 {/* Field Type */}
 <div className="space-y-1.5">
 <Label htmlFor="field-type"className="text-sm font-semibold">
 Field Type <span className="text-destructive">*</span>
 </Label>
 <DropdownButton
 icon={(() => {
 switch (fieldType) {
 case"string":
 return <Type className="h-4 w-4"/>;
 case"number":
 return <Hash className="h-4 w-4"/>;
 case"boolean":
 return <ToggleLeft className="h-4 w-4"/>;
 case"array":
 return <List className="h-4 w-4"/>;
 case"enum":
 return <ListChecks className="h-4 w-4"/>;
 case"date":
 return <Calendar className="h-4 w-4"/>;
 default:
 return <Type className="h-4 w-4"/>;
 }
 })()}
 label="Select field type"
 value={fieldType}
 options={[
 { value: "string", label: "text"},
 { value: "number", label: "number"},
 { value: "boolean", label: "yes/no"},
 { value: "array", label: "list"},
 { value: "enum", label: "choice"},
 { value: "date", label: "date"},
 ]}
 onChange={(value) => {
 setFieldType(value as FieldType |"enum");
 // If enum is selected and no enum values exist, initialize empty array
 if (value === "enum"&& (!validationRules.enum || !Array.isArray(validationRules.enum))) {
 setValidationRules({ ...validationRules, enum: [] });
 }
 }}
 align="start"
 className="w-full"
 />
 </div>

 {/* Description */}
 <div className="space-y-1.5">
 <Label htmlFor="description"className="text-sm font-semibold">Description</Label>
 <Textarea
 id="description"
 value={description}
 onChange={(e) => setDescription(e.target.value)}
 placeholder="Describe what this field represents..."
 rows={3}
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm",
"rounded-lg"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 Help the AI understand what to extract
 </p>
 </div>

 {/* Example - Only for text and list types */}
 {fieldType === "string"&& (
 <div className="space-y-1.5">
 <Label htmlFor="example"className="text-sm font-semibold">Example</Label>
 <Input
 id="example"
 value={example}
 onChange={(e) => setExample(e.target.value)}
 placeholder="e.g., John Doe, Company Name"
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 Example text value to help illustrate the expected format
 </p>
 </div>
 )}
 {fieldType === "array"&& (
 <div className="space-y-1.5">
 <Label htmlFor="example"className="text-sm font-semibold">Example</Label>
 <Input
 id="example"
 value={example}
 onChange={(e) => setExample(e.target.value)}
 placeholder="e.g., [&quot;item1&quot;, &quot;item2&quot;]"
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 Example list value to help illustrate the expected format (JSON array format)
 </p>
 </div>
 )}

 {/* Options - Only for choice (enum) type */}
 {fieldType === "enum"&& (
 <div className="space-y-1.5">
 <Label htmlFor="enum-options"className="text-sm font-semibold">
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
 // Clear error when user types
 if (errors.enumOptions) {
 setErrors((prev) => {
 const { enumOptions, ...rest } = prev;
 return rest;
 });
 }
 }}
 placeholder="Option 1, Option 2, Option 3"
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm",
 errors.enumOptions ? "border-destructive": ""
 )}
 />
 {errors.enumOptions && (
 <div className="flex items-center gap-1.5 text-xs text-destructive font-medium mt-1">
 <AlertCircle className="h-3.5 w-3.5"/>
 <span>{errors.enumOptions}</span>
 </div>
 )}
 <p className="text-xs text-muted-foreground mt-1">
 Comma-separated values. Field will only accept these values.
 </p>
 </div>
 )}
 </div>
 </BaseCard>
 </TabsContent>

 <TabsContent value="advanced"className="mt-0">
 <div className="space-y-3">
 {/* Field Options Section */}
 <BaseCard variant="light"className="p-3">
 <Label className="text-sm font-semibold mb-3 block">Field Options</Label>
 <div className="space-y-3">
 {/* Default Value */}
 <div className="space-y-1.5">
 <Label htmlFor="default-value"className="text-sm font-semibold">Default Value</Label>
 <Input
 id="default-value"
 value={defaultValue}
 onChange={(e) => setDefaultValue(e.target.value)}
 placeholder="Optional default value"
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 Value to use if field is not found in the document
 </p>
 </div>
 </div>
 </BaseCard>

 {/* Validation Rules */}
 <BaseCard variant="light"className="p-4">
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <Label className="text-sm font-semibold mb-0">Add Validation Rules</Label>
 <Checkbox
 id="show-validation"
 checked={showValidation}
 onCheckedChange={(checked) => setShowValidation(checked === true)}
 />
 </div>

 {showValidation && (
 <div className="space-y-4 pt-2">
 <Alert>
 <AlertCircle className="h-4 w-4"/>
 <AlertDescription className="text-xs">
 Validation rules help ensure data quality during extraction
 </AlertDescription>
 </Alert>

 {/* String-specific rules */}
 {(fieldType === "string"|| fieldType === "array") && (
 <>
 <div className="space-y-1.5">
 <Label htmlFor="pattern"className="text-sm font-semibold">Pattern (Regex)</Label>
 <Input
 id="pattern"
 value={validationRules.pattern || ""}
 onChange={(e) =>
 updateValidationRule("pattern", e.target.value)
 }
 placeholder="^[A-Z0-9-]+$"
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 Regular expression for validation
 </p>
 </div>

 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="min-length"className="text-sm font-semibold">Min Length</Label>
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
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="max-length"className="text-sm font-semibold">Max Length</Label>
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
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 </div>
 </div>
 </>
 )}

 {/* Number-specific rules */}
 {fieldType === "number"&& (
 <div className="grid grid-cols-2 gap-3">
 <div className="space-y-1.5">
 <Label htmlFor="minimum"className="text-sm font-semibold">Minimum</Label>
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
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 </div>
 <div className="space-y-1.5">
 <Label htmlFor="maximum"className="text-sm font-semibold">Maximum</Label>
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
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 </div>
 </div>
 )}

 {/* Enum values */}
 <div className="space-y-1.5">
 <Label htmlFor="enum"className="text-sm font-semibold">Enum Values</Label>
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
 className={cn(
 // Glassmorphism 2.0
"bg-white/60",
"backdrop-blur-md backdrop-saturate-[180%]",
"border-primary/20",
"shadow-sm"
 )}
 />
 <p className="text-xs text-muted-foreground mt-1">
 One value per line. Field will only accept these values.
 </p>
 </div>
 </div>
 )}
 </div>
 </BaseCard>
 </div>
 </TabsContent>
 </div>
 </ScrollArea>
 </Tabs>

 {/* Footer with save button */}
 <div className="relative z-10 flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border/50">
 <SecondaryButton type="button"onClick={onCancel} size="md">
 Cancel
 </SecondaryButton>
 <PrimaryButton type="submit"size="md">
 {field ? "Save Changes": "Add Field"}
 </PrimaryButton>
 </div>
 </form>
 </DialogContent>
 </Dialog>
 );
}
