#!/usr/bin/env node

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/**
 * Script to validate that all API calls use plural form for document types
 * This helps ensure consistency across the frontend codebase
 */

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const SEARCH_PATTERNS = {
  // Patterns that should NOT exist (singular forms in wrong context)
  forbidden: [
    // Only flag API request/response objects and interfaces, not internal data structures
    /documentType[\s]*:(?!.*\/\/ For backward compatibility)/,   // TypeScript property should be documentTypes (unless marked for compatibility)
    // Add more patterns as needed
  ],
  // Allow list for legitimate singular usage
  allowed: [
    /document_type[\s]*:.*string/, // Type definitions are OK
    /document_type[\s]*=/, // Property access is OK
    /document_type\./, // Property access is OK
    /\.document_type/, // Property access is OK
    /document_type:.*properties\.document_type/, // Weaviate mapping is OK
    /documentType[\s]*:\s*DocumentType\b/, // Single document/example values are OK
    /documentType[\s]*\??:\s*string(?:\s*\|\s*null)?\b/, // DTO fields for one document are OK
    /documentType[\s]*:\s*documentType\b/, // Object literals forwarding one document field are OK
    /documentType[\s]*:\s*['"][a-z_]+['"]/, // String-literal singular values for a single node/document are OK
    /\/\/ For backward compatibility/, // Explicit backward compatibility comments are OK
  ]
};

function checkFile(filePath, content) {
  const errors = [];
  const warnings = [];
  
  const lines = content.split('\n');
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Check if line should be allowed (has legitimate singular usage)
    const isAllowed = SEARCH_PATTERNS.allowed.some(pattern => pattern.test(line));
    
    if (!isAllowed) {
      // Check for forbidden patterns
      SEARCH_PATTERNS.forbidden.forEach(pattern => {
        if (pattern.test(line)) {
          errors.push({
            file: path.relative(FRONTEND_ROOT, filePath),
            line: lineNum,
            content: line.trim(),
            issue: 'Uses singular form - should be plural'
          });
        }
      });
    }
  });
  
  return { errors, warnings };
}

function walkDirectory(dir, extensions = ['.ts', '.tsx', '.js', '.jsx']) {
  let results = [];
  
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .next directories
        if (['node_modules', '.next', 'dist', 'build'].includes(file)) {
          continue;
        }
        results = results.concat(walkDirectory(filePath, extensions));
      } else if (extensions.some(ext => file.endsWith(ext))) {
        results.push(filePath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return results;
}

function validateDocumentTypes() {
  console.log('🔍 Validating document types consistency...\n');
  
  const files = walkDirectory(FRONTEND_ROOT);
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const { errors, warnings } = checkFile(filePath, content);
      
      if (errors.length > 0 || warnings.length > 0) {
        console.log(`📁 ${path.relative(FRONTEND_ROOT, filePath)}`);
        
        errors.forEach(error => {
          console.log(`  ❌ Line ${error.line}: ${error.issue}`);
          console.log(`     ${error.content}`);
          totalErrors++;
        });
        
        warnings.forEach(warning => {
          console.log(`  ⚠️  Line ${warning.line}: ${warning.issue}`);
          console.log(`     ${warning.content}`);
          totalWarnings++;
        });
        
        console.log('');
      }
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error.message);
    }
  }
  
  console.log('📊 Summary:');
  console.log(`   Total files checked: ${files.length}`);
  console.log(`   Errors found: ${totalErrors}`);
  console.log(`   Warnings: ${totalWarnings}`);
  
  if (totalErrors > 0) {
    console.log('\n❌ Validation failed. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ Document types validation passed!');
  }
}

// NOTE: The legacy `validateDocumentTypeEnum` check enforced existence of
// `JUDGMENT`, `TAX_INTERPRETATION`, `ERROR` members on a `DocumentType` enum.
// As of the 2026-05-09 search-judgment-only refactor (see
// `docs/superpowers/specs/2026-05-09-search-judgment-only-blazing-fast.md`)
// search is judgment-only and the enum was removed entirely, so the check is
// no longer applicable.

if (require.main === module) {
  validateDocumentTypes();
}
