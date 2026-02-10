"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Edit, ChevronDown, ChevronRight } from "lucide-react";
import { ParsedField } from "@/lib/schema-utils";
import { useState } from "react";

interface SchemaFieldCardProps {
  /** The field to display */
  field: ParsedField;
  /** Nesting depth (for indentation) */
  depth?: number;
  /** Callback when edit button is clicked */
  onEdit?: (field: ParsedField) => void;
  /** Whether to show edit button */
  showEditButton?: boolean;
  /** Whether the card should be expanded by default */
  defaultExpanded?: boolean;
}

/**
 * Display a single schema field with visual styling and nested field support
 */
export function SchemaFieldCard({
  field,
  depth = 0,
  onEdit,
  showEditButton = false,
  defaultExpanded = true,
}: SchemaFieldCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded); // Configurable default state
  const hasNested = !!(field.properties && field.properties.length > 0);

  // Calculate left margin based on depth
  const marginLeft = depth > 0 ? `${depth * 20}px` : '0px';

  return (
    <Card
      className="mb-2 transition-shadow hover:shadow-sm"
      style={{ marginLeft }}
    >
      <CardHeader className="py-2 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            {/* Expand/collapse button for nested fields */}
            {hasNested && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Type badge with color */}
            <Badge
              variant="outline"
              className="text-xs font-mono"
              style={{
                backgroundColor: field.typeColor,
                color: 'white',
                borderColor: field.typeColor,
              }}
            >
              {field.type}
            </Badge>

            {/* Field name */}
            <h4 className="font-medium text-sm">{field.name}</h4>

            {/* Array item type indicator */}
            {field.type === 'array' && field.arrayItemType && (
              <Badge variant="secondary" className="text-xs">
                {field.arrayItemType}[]
              </Badge>
            )}
          </div>

          {/* Right side badges and actions */}
          <div className="flex gap-2 items-center">
            {/* Required badge */}
            {field.required && (
              <Badge variant="destructive" className="text-xs">
                required
              </Badge>
            )}

            {/* Enum indicator */}
            {field.enumValues && (
              <Badge variant="outline" className="text-xs">
                enum
              </Badge>
            )}

            {/* Edit button */}
            {showEditButton && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onEdit(field)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3">
        {/* Nested field count (when collapsed) - show first */}
        {hasNested && !isExpanded && (
          <div className="text-xs text-muted-foreground">
            {field.properties!.length} nested field{field.properties!.length !== 1 ? 's' : ''}
          </div>
        )}

        {/* Description - show truncated version when collapsed */}
        {field.description && !hasNested && (
          <p className="text-sm text-muted-foreground line-clamp-1">
            {field.description}
          </p>
        )}

        {/* Show expanded details only when explicitly expanded or when no nested fields */}
        {(isExpanded || !hasNested) && (
          <>
            {/* Full description when expanded */}
            {field.description && hasNested && (
              <p className="text-sm text-muted-foreground mb-2">
                {field.description}
              </p>
            )}

            {/* Validation rules */}
            {field.validationRules && field.validationRules.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-2">
                {field.validationRules.map((rule, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {rule.label}
                  </Badge>
                ))}
              </div>
            )}

            {/* Enum values */}
            {field.enumValues && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Values: </span>
                <span className="text-xs font-mono">
                  {field.enumValues.map(String).join(', ')}
                </span>
              </div>
            )}

            {/* Default value */}
            {field.defaultValue !== undefined && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Default: </span>
                <span className="text-xs font-mono">
                  {JSON.stringify(field.defaultValue)}
                </span>
              </div>
            )}

            {/* Nested fields */}
            {hasNested && isExpanded && (
              <div className="mt-3 space-y-2 border-l-2 border-muted pl-4">
                {field.properties!.map((nestedField, index) => (
                  <SchemaFieldCard
                    key={`${nestedField.name}-${index}`}
                    field={nestedField}
                    depth={0} // Reset depth for visual clarity within the card
                    onEdit={onEdit}
                    showEditButton={showEditButton}
                    defaultExpanded={defaultExpanded}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Alternative compact view for schema fields (list style)
 */
export function SchemaFieldListItem({
  field,
  onEdit,
  showEditButton = false,
}: Omit<SchemaFieldCardProps, 'depth' | 'defaultExpanded'>) {
  const hasNested = !!(field.properties && field.properties.length > 0);

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {/* Type badge */}
          <Badge
            variant="outline"
            className="text-xs font-mono w-20 justify-center"
            style={{
              backgroundColor: field.typeColor,
              color: 'white',
              borderColor: field.typeColor,
            }}
          >
            {field.type}
          </Badge>

          {/* Field name */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{field.name}</span>
              {field.required && (
                <Badge variant="destructive" className="text-xs">
                  required
                </Badge>
              )}
              {hasNested && (
                <Badge variant="secondary" className="text-xs">
                  {field.properties!.length} fields
                </Badge>
              )}
            </div>
            {field.description && (
              <p className="text-xs text-muted-foreground mt-1">
                {field.description}
              </p>
            )}
          </div>
        </div>

        {/* Edit button */}
        {showEditButton && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(field)}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Validation rules */}
      {field.validationRules && field.validationRules.length > 0 && (
        <div className="flex gap-1 flex-wrap mt-2 ml-24">
          {field.validationRules.map((rule, index) => (
            <Badge key={index} variant="outline" className="text-xs">
              {rule.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Display list of schema fields with accordion for nested structures
 */
export function SchemaFieldsAccordion({
  fields,
  onEdit,
  showEditButton = false,
  defaultExpanded = true,
}: {
  fields: ParsedField[];
  onEdit?: (field: ParsedField) => void;
  showEditButton?: boolean;
  defaultExpanded?: boolean;
}) {
  if (fields.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No fields defined in this schema
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {fields.map((field, index) => (
        <SchemaFieldCard
          key={`${field.name}-${index}`}
          field={field}
          onEdit={onEdit}
          showEditButton={showEditButton}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  );
}
