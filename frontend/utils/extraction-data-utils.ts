/**
 * Utility functions for processing and formatting extraction data
 */

export interface FieldGroup {
  title: string;
  fields: Array<{
    key: string;
    value: any;
    type: string;
    description?: string;
  }>;
}

/**
 * Detects the type of a value
 */
export function detectValueType(value: any): 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'null' {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') {
    // Try to detect if it's a date string
    if (/^\d{4}-\d{2}-\d{2}/.test(value) && !isNaN(Date.parse(value))) {
      return 'date';
    }
    return 'string';
  }
  return 'string';
}

/**
 * Formats a value based on its type
 */
export function formatFieldValue(value: any, type?: string): string {
  if (value === null || value === undefined) return '—';
  
  const detectedType = type || detectValueType(value);
  
  switch (detectedType) {
    case 'number':
      // Format numbers with thousand separators
      return new Intl.NumberFormat('pl-PL', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
    
    case 'boolean':
      return value ? 'Yes' : 'No';
    
    case 'date':
      try {
        const date = new Date(value);
        return new Intl.DateTimeFormat('pl-PL', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }).format(date);
      } catch {
        return String(value);
      }
    
    case 'array':
      return `Array (${value.length} items)`;
    
    case 'object':
      return 'Object';
    
    default:
      return String(value);
  }
}

/**
 * Formats currency values
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: 'PLN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Formats percentage values
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Groups extraction data into logical sections
 */
export function groupExtractionData(
  data: Record<string, any>
): {
  metadata: Record<string, any>;
  sections: FieldGroup[];
} {
  // Metadata fields that should be separated
  const metadataFields = [
    'document_id',
    'collection_id',
    'status',
    'created_at',
    'updated_at',
    'started_at',
    'completed_at',
    'error_message',
  ];
  
  const metadata: Record<string, any> = {};
  const extracted: Record<string, any> = {};
  
  // Separate metadata from extracted data
  Object.entries(data).forEach(([key, value]) => {
    if (metadataFields.includes(key)) {
      metadata[key] = value;
    } else {
      extracted[key] = value;
    }
  });
  
  // Group extracted fields into sections
  const sections = groupFieldsByCategory(extracted);
  
  return { metadata, sections };
}

/**
 * Groups fields by type - simple fields (strings, numbers, dates, booleans) and short arrays
 * in document information, complex fields (arrays, objects) as separate sections
 */
function groupFieldsByCategory(data: Record<string, any>): FieldGroup[] {
  const simpleFields: Array<{ key: string; value: any; type: string }> = [];
  const complexFields: Array<{ key: string; value: any; type: string }> = [];
  
  Object.entries(data).forEach(([key, value]) => {
    const fieldType = detectValueType(value);
    const field = { key, value, type: fieldType };
    
    // Group simple types together
    if (fieldType === 'string' || fieldType === 'number' || fieldType === 'date' || fieldType === 'boolean' || fieldType === 'null') {
      simpleFields.push(field);
    } else if (fieldType === 'array') {
      // Check if it's a short array with short text items (like dates)
      if (Array.isArray(value) && value.length > 0 && value.length <= 5) {
        // Check if all items are short strings (max 10 characters)
        const allItemsShort = value.every((item: any) => {
          if (typeof item === 'string') {
            return item.length <= 10;
          }
          // Also allow dates and numbers
          return typeof item === 'number' || detectValueType(item) === 'date';
        });
        
        if (allItemsShort) {
          simpleFields.push(field);
        } else {
          complexFields.push(field);
        }
      } else {
        complexFields.push(field);
      }
    } else {
      // Complex types (objects) get their own sections
      complexFields.push(field);
    }
  });
  
  const sections: FieldGroup[] = [];
  
  // Add document information section with simple fields
  if (simpleFields.length > 0) {
    sections.push({
      title: 'Document Information',
      fields: simpleFields,
    });
  }
  
  // Add each complex field as its own section
  complexFields.forEach((field) => {
    sections.push({
      title: getFieldLabel(field.key),
      fields: [field],
    });
  });
  
  return sections;
}

/**
 * Checks if an array contains objects (vs. primitives)
 */
export function isArrayOfObjects(arr: any[]): boolean {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return typeof arr[0] === 'object' && arr[0] !== null && !Array.isArray(arr[0]);
}

/**
 * Gets field label from key (converts snake_case to Title Case)
 */
export function getFieldLabel(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Checks if an object has alphabet-labeled keys (single letters a-z, A-Z)
 * Used to render such objects in a more compact format
 */
export function isAlphabetLabeledObject(obj: Record<string, any>): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return false;
  }
  
  // Check if all keys are single letters (a-z or A-Z)
  const allSingleLetters = keys.every(key => /^[a-zA-Z]$/.test(key));
  
  // Also check if all values are simple types (string, number, boolean, date)
  const allSimpleValues = keys.every(key => {
    const val = obj[key];
    const type = detectValueType(val);
    return type === 'string' || type === 'number' || type === 'boolean' || type === 'date' || type === 'null';
  });
  
  return allSingleLetters && allSimpleValues && keys.length >= 2;
}

/**
 * Determines the best layout format for a group of fields
 * Returns 'grid' as default, or 'list' for single field
 */
export function getFieldLayoutFormat(fieldCount: number, preferList: boolean = false): 'grid' | 'list' {
  if (preferList || fieldCount === 1) {
    return 'list';
  }
  
  // Default to grid view
  return 'grid';
}

/**
 * Detects language from extracted data by analyzing content
 * Returns 'pl' for Polish, 'en' for English, defaults to 'pl'
 */
export function detectLanguageFromData(data: Record<string, any>): 'pl' | 'en' {
  if (!data || typeof data !== 'object') {
    return 'pl'; // Default to Polish
  }

  // Common Polish words/patterns that indicate Polish content
  const polishIndicators = [
    'ustawy', 'ustawa', 'art.', 'ust.', 'pkt', 'lit.', 'rozporządzenia',
    'podatku', 'podatek', 'podatkowy', 'podatkowa', 'podatkowe',
    'wnioskodawcy', 'wnioskodawca', 'wniosek',
    'interpretacji', 'interpretacja', 'stanowisko',
    'prawidłowe', 'nieprawidłowe', 'prawidłowy', 'prawidłowa',
    'tak', 'nie', 'czy', 'który', 'która', 'które',
    'zgodnie', 'zgodny', 'zgodna', 'zgodne',
    'sąd', 'sądu', 'sądem',
    'wyrok', 'wyroku', 'wyrokiem',
  ];

  // Common English words/patterns that indicate English content
  const englishIndicators = [
    'section', 'sections', 'act', 'acts', 'regulation', 'regulations',
    'tax', 'taxes', 'taxpayer', 'taxpayers', 'taxation',
    'applicant', 'application', 'request',
    'interpretation', 'interpretations', 'position',
    'correct', 'incorrect', 'valid', 'invalid',
    'yes', 'no', 'whether', 'which', 'that',
    'according', 'accordance', 'pursuant',
    'court', 'courts', 'judgment', 'judgments',
  ];

  // Collect all string values from the data
  const allStrings: string[] = [];
  
  function collectStrings(obj: any, depth = 0): void {
    if (depth > 5) return; // Prevent infinite recursion
    
    if (typeof obj === 'string') {
      allStrings.push(obj.toLowerCase());
    } else if (Array.isArray(obj)) {
      obj.forEach(item => collectStrings(item, depth + 1));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach(value => collectStrings(value, depth + 1));
    }
  }

  collectStrings(data);

  // Count matches for each language
  let polishMatches = 0;
  let englishMatches = 0;

  const text = allStrings.join(' ');

  polishIndicators.forEach(indicator => {
    const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      polishMatches += matches.length;
    }
  });

  englishIndicators.forEach(indicator => {
    const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      englishMatches += matches.length;
    }
  });

  // If we have clear indicators, use them
  if (polishMatches > 0 && polishMatches > englishMatches * 2) {
    return 'pl';
  }
  
  if (englishMatches > 0 && englishMatches > polishMatches * 2) {
    return 'en';
  }

  // Default to Polish if uncertain
  return 'pl';
}

/**
 * Gets boolean labels based on language
 */
export function getBooleanLabel(value: boolean, language: 'pl' | 'en' = 'pl'): string {
  if (language === 'en') {
    return value ? 'Yes' : 'No';
  }
  return value ? 'Tak' : 'Nie';
}

/**
 * Formats a section (FieldGroup) as human-readable plain text
 * Used for copying entire sections to clipboard
 */
export function formatSectionAsPlainText(
  section: FieldGroup,
  language: 'pl' | 'en' = 'pl',
  indent: number = 0
): string {
  const indentStr = '  '.repeat(indent);
  const lines: string[] = [];
  
  // Add section title
  lines.push(`${indentStr}${section.title}`);
  lines.push(`${indentStr}${'='.repeat(section.title.length)}`);
  lines.push('');
  
  // Format each field
  section.fields.forEach((field) => {
    const fieldLabel = field.description || getFieldLabel(field.key);
    const fieldType = field.type;
    const fieldValue = field.value;
    
    // Format based on type
    if (fieldType === 'null' || fieldValue === null || fieldValue === undefined) {
      lines.push(`${indentStr}${fieldLabel}: —`);
    } else if (fieldType === 'boolean') {
      lines.push(`${indentStr}${fieldLabel}: ${getBooleanLabel(fieldValue, language)}`);
    } else if (fieldType === 'string') {
      // Preserve line breaks in strings
      const stringValue = String(fieldValue);
      if (stringValue.includes('\n')) {
        lines.push(`${indentStr}${fieldLabel}:`);
        stringValue.split('\n').forEach(line => {
          lines.push(`${indentStr}  ${line}`);
        });
      } else {
        lines.push(`${indentStr}${fieldLabel}: ${stringValue}`);
      }
    } else if (fieldType === 'number') {
      lines.push(`${indentStr}${fieldLabel}: ${formatFieldValue(fieldValue, 'number')}`);
    } else if (fieldType === 'date') {
      lines.push(`${indentStr}${fieldLabel}: ${formatFieldValue(fieldValue, 'date')}`);
    } else if (fieldType === 'array') {
      lines.push(`${indentStr}${fieldLabel}:`);
      if (Array.isArray(fieldValue) && fieldValue.length > 0) {
        // Check if it's an array of objects
        if (isArrayOfObjects(fieldValue)) {
          // Format as table-like structure
          fieldValue.forEach((item, index) => {
            lines.push(`${indentStr}  ${index + 1}.`);
            Object.entries(item).forEach(([key, val]) => {
              const itemLabel = getFieldLabel(key);
              const itemType = detectValueType(val);
              let itemValue: string;
              
              if (itemType === 'boolean') {
                itemValue = getBooleanLabel(val as boolean, language);
              } else if (itemType === 'date') {
                itemValue = formatFieldValue(val, 'date');
              } else if (itemType === 'number') {
                itemValue = formatFieldValue(val, 'number');
              } else if (itemType === 'array') {
                if (Array.isArray(val) && val.length > 0) {
                  const formattedItems = val.map((v: any) => {
                    const vType = detectValueType(v);
                    if (vType === 'boolean') return getBooleanLabel(v, language);
                    if (vType === 'date') return formatFieldValue(v, 'date');
                    if (vType === 'number') return formatFieldValue(v, 'number');
                    return String(v);
                  });
                  itemValue = formattedItems.join(', ');
                } else {
                  itemValue = '—';
                }
              } else {
                itemValue = String(val || '—');
              }
              
              lines.push(`${indentStr}    ${itemLabel}: ${itemValue}`);
            });
            if (index < fieldValue.length - 1) {
              lines.push('');
            }
          });
        } else {
          // Format as simple list
          fieldValue.forEach((item: any) => {
            const itemType = detectValueType(item);
            let itemValue: string;
            
            if (itemType === 'boolean') {
              itemValue = getBooleanLabel(item, language);
            } else if (itemType === 'date') {
              itemValue = formatFieldValue(item, 'date');
            } else if (itemType === 'number') {
              itemValue = formatFieldValue(item, 'number');
            } else {
              itemValue = String(item);
            }
            
            lines.push(`${indentStr}  • ${itemValue}`);
          });
        }
      } else {
        lines.push(`${indentStr}  (no items)`);
      }
    } else if (fieldType === 'object') {
      lines.push(`${indentStr}${fieldLabel}:`);
      // Recursively format nested object
      if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
        Object.entries(fieldValue).forEach(([key, val]) => {
          const nestedLabel = getFieldLabel(key);
          const nestedType = detectValueType(val);
          
          if (nestedType === 'object' && !Array.isArray(val)) {
            // Nested object - create a sub-section
            const nestedSection: FieldGroup = {
              title: nestedLabel,
              fields: [{ key, value: val, type: nestedType }],
            };
            lines.push(formatSectionAsPlainText(nestedSection, language, indent + 1));
          } else {
            // Simple nested field
            let nestedValue: string;
            if (nestedType === 'boolean') {
              nestedValue = getBooleanLabel(val as boolean, language);
            } else if (nestedType === 'date') {
              nestedValue = formatFieldValue(val, 'date');
            } else if (nestedType === 'number') {
              nestedValue = formatFieldValue(val, 'number');
            } else if (nestedType === 'array') {
              if (Array.isArray(val) && val.length > 0) {
                const formattedItems = val.map((v: any) => {
                  const vType = detectValueType(v);
                  if (vType === 'boolean') return getBooleanLabel(v, language);
                  if (vType === 'date') return formatFieldValue(v, 'date');
                  if (vType === 'number') return formatFieldValue(v, 'number');
                  return String(v);
                });
                nestedValue = formattedItems.join(', ');
              } else {
                nestedValue = '—';
              }
            } else {
              nestedValue = String(val || '—');
            }
            lines.push(`${indentStr}  ${nestedLabel}: ${nestedValue}`);
          }
        });
      }
    } else {
      lines.push(`${indentStr}${fieldLabel}: ${String(fieldValue)}`);
    }
    
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Formats a section (FieldGroup) as a 2x2 HTML table
 * Used for copying grid view sections to clipboard - recognized by Word and Google Docs
 */
export function formatSectionAsTable(
  section: FieldGroup,
  language: 'pl' | 'en' = 'pl'
): string {
  // For grid view, format as 2 columns: Label | Value
  // Calculate how many rows we need (ceil of fields.length / 2)
  const rows: Array<[string, string, string, string]> = [];
  
  for (let i = 0; i < section.fields.length; i += 2) {
    const field1 = section.fields[i];
    const field2 = section.fields[i + 1];
    
    const label1 = field1 ? escapeHtml(field1.description || getFieldLabel(field1.key)) : '';
    const value1 = field1 ? escapeHtml(formatFieldValueForTable(field1.value, field1.type, language)) : '';
    
    const label2 = field2 ? escapeHtml(field2.description || getFieldLabel(field2.key)) : '';
    const value2 = field2 ? escapeHtml(formatFieldValueForTable(field2.value, field2.type, language)) : '';
    
    rows.push([label1, value1, label2, value2]);
  }
  
  // Build HTML table with improved typography
  const tableStyle = `
    border-collapse: collapse;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    width: 100%;
    border: 1px solid #d1d5db;
  `.trim().replace(/\s+/g, ' ');
  
  const headerStyle = `
    background-color: #f3f4f6;
    font-weight: 600;
    font-size: 10pt;
    text-align: left;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    color: #374151;
  `.trim().replace(/\s+/g, ' ');
  
  const cellStyle = `
    padding: 8px 12px;
    border: 1px solid #e5e7eb;
    vertical-align: top;
    color: #111827;
  `.trim().replace(/\s+/g, ' ');
  
  const labelCellStyle = `
    ${cellStyle}
    font-weight: 500;
    background-color: #f9fafb;
    color: #4b5563;
  `.trim().replace(/\s+/g, ' ');
  
  let html = `<table style="${tableStyle}">\n`;
  html += `  <thead>\n`;
  html += `    <tr>\n`;
  html += `      <th style="${headerStyle}">Label</th>\n`;
  html += `      <th style="${headerStyle}">Value</th>\n`;
  html += `      <th style="${headerStyle}">Label</th>\n`;
  html += `      <th style="${headerStyle}">Value</th>\n`;
  html += `    </tr>\n`;
  html += `  </thead>\n`;
  html += `  <tbody>\n`;
  
  rows.forEach(row => {
    html += `    <tr>\n`;
    html += `      <td style="${labelCellStyle}">${row[0]}</td>\n`;
    html += `      <td style="${cellStyle}">${row[1]}</td>\n`;
    html += `      <td style="${labelCellStyle}">${row[2]}</td>\n`;
    html += `      <td style="${cellStyle}">${row[3]}</td>\n`;
    html += `    </tr>\n`;
  });
  
  html += `  </tbody>\n`;
  html += `</table>`;
  
  return html;
}

/**
 * Escapes HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Helper function to format field values for table display
 */
function formatFieldValueForTable(value: any, type: string, language: 'pl' | 'en'): string {
  if (value === null || value === undefined) {
    return '—';
  }
  
  switch (type) {
    case 'boolean':
      return getBooleanLabel(value, language);
    case 'number':
      return formatFieldValue(value, 'number');
    case 'date':
      return formatFieldValue(value, 'date');
    case 'string':
      // Replace newlines with spaces for table cells
      return String(value).replace(/\n/g, ' ').trim();
    case 'array':
      if (Array.isArray(value) && value.length > 0) {
        if (isArrayOfObjects(value)) {
          // For arrays of objects, show count
          return `${value.length} items`;
        } else {
          // For primitive arrays, join with commas
          const formattedItems = value.map((item: any) => {
            const itemType = detectValueType(item);
            if (itemType === 'boolean') return getBooleanLabel(item, language);
            if (itemType === 'date') return formatFieldValue(item, 'date');
            if (itemType === 'number') return formatFieldValue(item, 'number');
            return String(item);
          });
          return formattedItems.join(', ');
        }
      }
      return '—';
    case 'object':
      return 'Complex data';
    default:
      return String(value).replace(/\n/g, ' ').trim();
  }
}

