#!/usr/bin/env node
/**
 * Lighthouse CI performance testing.
 * 
 * Runs Lighthouse audits on key pages and checks against performance budgets.
 * 
 * Usage:
 *   node scripts/lighthouse-ci.js
 */

const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

// Performance budgets
const BUDGETS = {
  performance: 85,
  accessibility: 90,
  bestPractices: 85,
  seo: 90,
  pwa: 70,
};

// Pages to test
const PAGES = [
  { name: 'Home', url: 'http://localhost:3006' },
  { name: 'Search', url: 'http://localhost:3006/search' },
  { name: 'Chat', url: 'http://localhost:3006/chat' },
];

async function runLighthouse(url) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  
  const options = {
    logLevel: 'error',
    output: 'json',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
    port: chrome.port,
  };
  
  const runnerResult = await lighthouse(url, options);
  
  await chrome.kill();
  
  return runnerResult.lhr;
}

async function main() {
  console.log('=' .repeat(60));
  console.log('Lighthouse CI Performance Testing');
  console.log('=' .repeat(60));
  
  const results = [];
  let hasFailed = false;
  
  for (const page of PAGES) {
    console.log(`\nTesting: ${page.name} (${page.url})`);
    
    try {
      const result = await runLighthouse(page.url);
      
      const scores = {
        performance: Math.round(result.categories.performance.score * 100),
        accessibility: Math.round(result.categories.accessibility.score * 100),
        bestPractices: Math.round(result.categories['best-practices'].score * 100),
        seo: Math.round(result.categories.seo.score * 100),
        pwa: Math.round(result.categories.pwa.score * 100),
      };
      
      console.log('\nScores:');
      for (const [category, score] of Object.entries(scores)) {
        const budget = BUDGETS[category];
        const status = score >= budget ? '✅' : '❌';
        console.log(`  ${status} ${category}: ${score} (target: ${budget})`);
        
        if (score < budget) {
          hasFailed = true;
        }
      }
      
      results.push({ page: page.name, scores });
      
    } catch (error) {
      console.error(`❌ Failed to test ${page.name}: ${error.message}`);
      hasFailed = true;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('=' .repeat(60));
  
  for (const result of results) {
    console.log(`\n${result.page}:`);
    for (const [category, score] of Object.entries(result.scores)) {
      console.log(`  ${category}: ${score}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  
  if (hasFailed) {
    console.log('❌ Some pages failed to meet performance budgets');
    process.exit(1);
  } else {
    console.log('✅ All pages meet performance budgets');
  }
}

main().catch(err => {
  console.error('Error running Lighthouse CI:', err);
  process.exit(1);
});
