/**
 * Extraction Data Viewer Component
 * Main component for displaying extraction results with proper formatting
 */

"use client";

import React, { useState } from "react";
import { SectionHeader, DocumentFieldCard, ItemHeader } from "@/lib/styles/components";
import { groupExtractionData, detectValueType, detectLanguageFromData, getFieldLayoutFormat, formatFieldValue, getBooleanLabel, getFieldLabel, formatSectionAsPlainText, formatSectionAsTable, FieldGroup, isArrayOfObjects } from "@/utils/extraction-data-utils";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { ExtractionFieldRenderer } from "./ExtractionFieldRenderer";
import { ExtractionArrayRenderer } from "./ExtractionArrayRenderer";
import { ExtractionObjectRenderer } from "./ExtractionObjectRenderer";
import { ExtractionTableView } from "./ExtractionTableView";
import { cn } from "@/lib/utils";
import { Grid3x3, List } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ExtractionDataViewerProps {
  /**
   * The extracted data object (for single document view)
   */
  data?: Record<string, any>;
  /**
   * Array of extraction results (for table view)
   */
  results?: Array<{
    document_id: string;
    document_title?: string;
    extracted_data: Record<string, any>;
    status: string;
  }>;
  /**
   * Schema definition (optional, for table view)
   */
  schema?: {
    properties: Record<string, any>;
  };
  /**
   * View mode - 'document' shows structured sections, 'table' shows flattened table
   */
  viewMode?: 'document' | 'table';
  /**
   * Optional className
   */
  className?: string;
  /**
   * Optional language ('pl' or 'en'). If not provided, will be detected from data.
   */
  language?: 'pl' | 'en';
  /**
   * Global layout format ('grid' or 'list') - controls how simple fields are displayed
   */
  globalLayout?: 'grid' | 'list';
  /**
   * Whether to hide copy buttons
   * @default false
   */
  hideCopyButtons?: boolean;
}

/**
 * Extraction Data Viewer Component
 * 
 * Displays extraction results in a structured, readable format.
 * Automatically groups fields into logical sections and formats
 * different data types appropriately.
 * 
 * @example
 * ```tsx
 * <ExtractionDataViewer
 *   data={extractedData}
 *   viewMode="document"
 * />
 * ```
 */
export function ExtractionDataViewer({
  data,
  results,
  schema,
  viewMode = 'document',
  className,
  language,
  globalLayout: globalLayoutProp = 'grid',
  hideCopyButtons = false,
}: ExtractionDataViewerProps) {
  // Validate props: either data or results should be provided
  if (!data && !results) {
    return (
      <div className={className}>
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  // If viewMode is 'table', render table view with results
  if (viewMode === 'table') {
    if (!results || results.length === 0) {
      return (
        <div className={className}>
          <p className="text-muted-foreground">No results available for table view</p>
        </div>
      );
    }
    return (
      <div className={className}>
        <ExtractionTableView results={results} schema={schema} />
      </div>
    );
  }

  // Document view requires data
  if (!data || typeof data !== 'object') {
    return (
      <div className={className}>
        <p className="text-muted-foreground">No data available</p>
      </div>
    );
  }

  // Detect language if not provided
  const detectedLanguage = language || detectLanguageFromData(data);

  // Use globalLayout from props, or default to 'grid'
  const globalLayout = globalLayoutProp;

  // Group data into metadata and sections
  const { metadata, sections } = groupExtractionData(data);

  // Handler for copying section content
  const handleCopySection = async (section: FieldGroup) => {
    // Check if this section is displayed in grid view (has simple fields in grid)
    const hasSimpleFields = section.fields.some(f => 
      f.type === 'string' || f.type === 'number' || f.type === 'date' || f.type === 'boolean' || f.type === 'null' || f.type === 'array'
    );
    const isGridSection = hasSimpleFields && section.fields.length > 1 && globalLayout === 'grid';
    
    try {
      if (isGridSection) {
        // Use HTML table format for grid view (recognized by Word and Google Docs)
        const htmlTable = formatSectionAsTable(section, detectedLanguage);
        const plainText = formatSectionAsPlainText(section, detectedLanguage);
        
        // Try to use ClipboardItem API for rich HTML content
        if (typeof ClipboardItem !== 'undefined') {
          const clipboardItem = new ClipboardItem({
            'text/html': new Blob([htmlTable], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          });
          await navigator.clipboard.write([clipboardItem]);
        } else {
          // Fallback: use a temporary element to copy HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = htmlTable;
          tempDiv.style.position = 'fixed';
          tempDiv.style.left = '-9999px';
          document.body.appendChild(tempDiv);
          
          const range = document.createRange();
          range.selectNodeContents(tempDiv);
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('copy');
            selection.removeAllRanges();
          }
          
          document.body.removeChild(tempDiv);
        }
      } else {
        // Use plain text for list view and complex sections
        const textToCopy = formatSectionAsPlainText(section, detectedLanguage);
        await navigator.clipboard.writeText(textToCopy);
      }
      
      toast.success("Copied", {
        description: `Copied "${section.title}" section to clipboard`
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback to plain text
      const textToCopy = formatSectionAsPlainText(section, detectedLanguage);
      await navigator.clipboard.writeText(textToCopy);
      toast.success("Copied", {
        description: `Copied "${section.title}" section to clipboard (as text)`
      });
    }
  };

  // Document view - subsection headers only for nested (objects) and aggregated (arrays) fields
  return (
    <div className={className}>
      <div className="space-y-6">
        {sections.map((section) => {
          // Check if this section has simple fields that can be displayed in grid/list format
          const hasSimpleFields = section.fields.some(f => 
            f.type === 'string' || f.type === 'number' || f.type === 'date' || f.type === 'boolean' || f.type === 'null' || f.type === 'array'
          );
          
          // For sections with simple fields, use global layout
          if (hasSimpleFields && section.fields.length > 1) {
            // Use compact list format when global layout is list
            if (globalLayout === 'list') {
              return (
                <div key={section.title} className="space-y-4">
                  <div className={cn("flex items-center mb-5", hideCopyButtons ? "justify-start" : "justify-between")}>
                    <SectionHeader title={section.title} showBorder={false} className="mb-0" />
                    {!hideCopyButtons && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopySection(section)}
                        className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        title="Copy section"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <DocumentFieldCard className="w-full">
                  <div className="space-y-5">
                    {section.fields.map((field) => {
                      const fieldLabel = field.description || getFieldLabel(field.key);
                      const fieldType = field.type;
                      
                      // For arrays, render inline in list format
                      if (fieldType === 'array') {
                        const arrayValue = field.value;
                        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
                          // Check if it's an array of objects (should use full renderer)
                          if (isArrayOfObjects(arrayValue)) {
                            return (
                              <div key={field.key} className="space-y-2">
                                <ItemHeader title={fieldLabel} as="h6" />
                                <ExtractionArrayRenderer
                                  fieldKey={field.key}
                                  value={arrayValue}
                                  label={undefined}
                                  showHeader={false}
                                  language={detectedLanguage}
                                />
                              </div>
                            );
                          }
                          
                          // For primitive arrays, render inline as comma-separated list
                          const formattedItems = arrayValue.map((item: any) => {
                            const itemType = detectValueType(item);
                            if (itemType === 'date') {
                              try {
                                return new Intl.DateTimeFormat('pl-PL', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric',
                                }).format(new Date(item));
                              } catch {
                                return String(item);
                              }
                            }
                            if (itemType === 'number') {
                              return new Intl.NumberFormat('pl-PL').format(item);
                            }
                            if (itemType === 'boolean') {
                              return getBooleanLabel(item, detectedLanguage);
                            }
                            return String(item);
                          });
                          
                          return (
                            <div key={field.key} className="flex gap-5 items-start py-1">
                              <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px]">
                                {fieldLabel}:
                              </dt>
                              <dd className="text-sm text-slate-900 dark:text-slate-100 flex-1 break-words leading-relaxed">
                                {formattedItems.join(', ')}
                              </dd>
                            </div>
                          );
                        }
                        
                        // Empty array
                        return (
                          <div key={field.key} className="flex gap-5 items-start py-1">
                            <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px]">
                              {fieldLabel}:
                            </dt>
                            <dd className="text-sm text-slate-500 dark:text-slate-400 flex-1 italic">
                              —
                            </dd>
                          </div>
                        );
                      }
                      
                      // For simple types, use compact list format
                      let displayValue: React.ReactNode;
                      
                      if (fieldType === 'boolean') {
                        displayValue = (
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            field.value
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                          )}>
                            {getBooleanLabel(field.value, detectedLanguage)}
                          </span>
                        );
                      } else {
                        displayValue = formatFieldValue(field.value, fieldType);
                      }
                      
                      return (
                        <div key={field.key} className="flex gap-5 items-start py-1">
                          <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px]">
                            {fieldLabel}:
                          </dt>
                          <dd className="text-sm text-slate-900 dark:text-slate-100 flex-1 break-words leading-relaxed">
                            {displayValue}
                          </dd>
                        </div>
                      );
                    })}
                  </div>
                  </DocumentFieldCard>
                </div>
              );
            }
            
            // Use grid format when global layout is grid (but list in print)
            return (
              <div key={section.title} className="space-y-4 print:space-y-6" data-grid-section="true">
                <div className={cn("flex items-center print:block", hideCopyButtons ? "justify-start" : "justify-between")}>
                  <SectionHeader title={section.title} showBorder={false} className="mb-0" />
                  {!hideCopyButtons && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopySection(section)}
                      className="h-8 w-8 p-0 print:hidden"
                      title="Copy section"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* Regular grid view - hidden in print */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 print:hidden">
                {section.fields.map((field) => {
                  // Render arrays in the metadata section
                  if (field.type === 'array') {
                    return (
                      <ExtractionArrayRenderer
                        key={field.key}
                        fieldKey={field.key}
                        value={field.value}
                        label={field.description || undefined}
                        showHeader={true}
                        language={detectedLanguage}
                      />
                    );
                  }
                  // Simple types
                  return (
                    <ExtractionFieldRenderer
                      key={field.key}
                      fieldKey={field.key}
                      value={field.value}
                      label={field.description || undefined}
                      language={detectedLanguage}
                    />
                  );
                })}
                </div>
                {/* Print list view - always use list format in print */}
                <div className="hidden print:block">
                  <DocumentFieldCard className="w-full print:!p-0 print:!bg-transparent print:!border-0">
                    <div className="space-y-4">
                      {section.fields.map((field) => {
                        const fieldLabel = field.description || getFieldLabel(field.key);
                        const fieldType = field.type;
                        
                        // For arrays, render inline in list format
                        if (fieldType === 'array') {
                          const arrayValue = field.value;
                          if (Array.isArray(arrayValue) && arrayValue.length > 0) {
                            // Check if it's an array of objects (should use full renderer)
                            if (isArrayOfObjects(arrayValue)) {
                              return (
                                <div key={field.key} className="space-y-2">
                                  <ItemHeader title={fieldLabel} className="print:!text-black print:!font-bold print:!mb-2" as="h6" />
                                  <ExtractionArrayRenderer
                                    fieldKey={field.key}
                                    value={arrayValue}
                                    label={undefined}
                                    showHeader={false}
                                    language={detectedLanguage}
                                  />
                                </div>
                              );
                            }
                            
                            // For primitive arrays, render inline as comma-separated list
                            const formattedItems = arrayValue.map((item: any) => {
                              const itemType = detectValueType(item);
                              if (itemType === 'date') {
                                try {
                                  return new Intl.DateTimeFormat('pl-PL', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                  }).format(new Date(item));
                                } catch {
                                  return String(item);
                                }
                              }
                              if (itemType === 'number') {
                                return new Intl.NumberFormat('pl-PL').format(item);
                              }
                              if (itemType === 'boolean') {
                                return getBooleanLabel(item, detectedLanguage);
                              }
                              return String(item);
                            });
                            
                            return (
                              <div key={field.key} className="flex gap-5 items-start py-1 print:!block print:!py-2">
                                <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px] print:!text-black print:!font-bold print:!min-w-0 print:!mb-1">{fieldLabel}:</dt>
                                <dd className="text-sm text-slate-900 dark:text-slate-100 flex-1 break-words leading-relaxed print:!text-black print:!ml-0">
                                  {formattedItems.join(', ')}
                                </dd>
                              </div>
                            );
                          }
                          
                          // Empty array
                          return (
                            <div key={field.key} className="flex gap-5 items-start py-1 print:!block print:!py-2">
                              <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px] print:!text-black print:!font-bold print:!min-w-0 print:!mb-1">{fieldLabel}:</dt>
                              <dd className="text-sm text-slate-500 dark:text-slate-400 flex-1 italic print:!text-black print:!ml-0">—</dd>
                            </div>
                          );
                        }
                        
                        // For simple types, use compact list format
                        let displayValue: React.ReactNode;
                        
                        if (fieldType === 'boolean') {
                          displayValue = getBooleanLabel(field.value, detectedLanguage);
                        } else {
                          displayValue = formatFieldValue(field.value, fieldType);
                        }
                        
                        return (
                          <div key={field.key} className="flex gap-5 items-start py-1 print:!block print:!py-2">
                            <dt className="text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0 min-w-[160px] print:!text-black print:!font-bold print:!min-w-0 print:!mb-1">{fieldLabel}:</dt>
                            <dd className="text-sm text-slate-900 dark:text-slate-100 flex-1 break-words leading-relaxed print:!text-black print:!ml-0">{displayValue}</dd>
                          </div>
                        );
                      })}
                    </div>
                  </DocumentFieldCard>
                </div>
              </div>
            );
          }
          
          // Complex fields (arrays and objects) - add subsection header
          return (
            <div key={section.title} className="space-y-4">
              <div className={cn("flex items-center", hideCopyButtons ? "justify-start" : "justify-between")}>
                <SectionHeader title={section.title} showBorder={false} className="mb-0" />
                {!hideCopyButtons && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopySection(section)}
                    className="h-8 w-8 p-0"
                    title="Copy section"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {section.fields.map((field) => {
                const fieldType = field.type;
                
                if (fieldType === 'array') {
                  return (
                    <ExtractionArrayRenderer
                      key={field.key}
                      fieldKey={field.key}
                      value={field.value}
                      label={field.description || undefined}
                      showHeader={false}
                      language={detectedLanguage}
                    />
                  );
                }
                
                if (fieldType === 'object') {
                  return (
                    <ExtractionObjectRenderer
                      key={field.key}
                      fieldKey={field.key}
                      value={field.value}
                      label={field.description || undefined}
                      showHeader={false}
                      language={detectedLanguage}
                      globalLayout={globalLayout}
                    />
                  );
                }
                
                return (
                  <ExtractionFieldRenderer
                    key={field.key}
                    fieldKey={field.key}
                    value={field.value}
                    label={field.description || undefined}
                    language={detectedLanguage}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

