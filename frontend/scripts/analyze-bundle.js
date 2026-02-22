#!/usr/bin/env node
/**
 * Bundle size analyzer for Next.js application.
 * 
 * Analyzes production build to ensure bundle sizes are within acceptable limits.
 * 
 * Usage:
 *   node scripts/analyze-bundle.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const MAX_PAGE_SIZE = 300 * 1024; // 300 KB per page
const MAX_TOTAL_JS = 1024 * 1024; // 1 MB total JS
const MAX_FIRST_LOAD_JS = 250 * 1024; // 250 KB first load

console.log('=' .repeat(60));
console.log('Next.js Bundle Size Analysis');
console.log('=' .repeat(60));

console.log('\nBuilding production bundle...');
try {
  execSync('npm run build', { stdio: 'inherit' });
} catch (error) {
  console.error('\n❌ Build failed');
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('Analyzing bundle sizes...');
console.log('=' .repeat(60) + '\n');

// Read build manifest
const manifestPath = path.join(process.cwd(), '.next/build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('❌ Build manifest not found');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Calculate sizes
let totalSize = 0;
const pages = {};

for (const [page, files] of Object.entries(manifest.pages)) {
  let pageSize = 0;
  
  for (const file of files) {
    const filePath = path.join(process.cwd(), '.next', file);
    if (fs.existsSync(filePath)) {
      const size = fs.statSync(filePath).size;
      pageSize += size;
    }
  }
  
  pages[page] = pageSize;
  totalSize += pageSize;
}

// Sort pages by size
const sortedPages = Object.entries(pages).sort((a, b) => b[1] - a[1]);

// Display results
console.log('Top 10 Largest Pages:\n');
for (const [page, size] of sortedPages.slice(0, 10)) {
  const sizeKB = (size / 1024).toFixed(2);
  const status = size > MAX_PAGE_SIZE ? '⚠️ ' : '✅';
  console.log(`  ${status} ${sizeKB.padStart(8)} KB - ${page}`);
}

console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('=' .repeat(60));
console.log(`Total Bundle Size: ${(totalSize / 1024).toFixed(2)} KB`);
console.log(`Average Page Size: ${(totalSize / sortedPages.length / 1024).toFixed(2)} KB`);
console.log(`Largest Page: ${(sortedPages[0][1] / 1024).toFixed(2)} KB (${sortedPages[0][0]})`);
console.log(`Smallest Page: ${(sortedPages[sortedPages.length - 1][1] / 1024).toFixed(2)} KB (${sortedPages[sortedPages.length - 1][0]})`);

// Check for issues
const issues = [];

// Check individual page sizes
const largePages = sortedPages.filter(([_, size]) => size > MAX_PAGE_SIZE);
if (largePages.length > 0) {
  issues.push({
    type: 'Large Pages',
    count: largePages.length,
    pages: largePages.map(([page, size]) => `${page} (${(size / 1024).toFixed(2)} KB)`)
  });
}

// Report issues
if (issues.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  Issues Detected');
  console.log('=' .repeat(60));
  
  for (const issue of issues) {
    console.log(`\n${issue.type}: ${issue.count}`);
    for (const page of issue.pages.slice(0, 5)) {
      console.log(`  - ${page}`);
    }
    if (issue.pages.length > 5) {
      console.log(`  ... and ${issue.pages.length - 5} more`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Recommendations:');
  console.log('=' .repeat(60));
  console.log('1. Use dynamic imports for large components');
  console.log('2. Split large pages into smaller chunks');
  console.log('3. Remove unused dependencies');
  console.log('4. Consider code splitting strategies');
  console.log('=' .repeat(60) + '\n');
  
  process.exit(1);
} else {
  console.log('\n✅ All pages within size limits');
  console.log('=' .repeat(60) + '\n');
}
