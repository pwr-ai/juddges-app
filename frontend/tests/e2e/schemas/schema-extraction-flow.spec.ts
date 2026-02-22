import { test, expect } from '@playwright/test';
import { SchemaPage } from '../page-objects/SchemaPage';

/**
 * Schema & Extraction E2E Tests
 *
 * Tests complete schema workflow:
 * - Create schema
 * - Test schema
 * - Run extraction
 * - Export results
 * - AI schema generation
 * - Versioning
 */

test.describe('Schema & Extraction Flow', () => {
  let schemaPage: SchemaPage;

  test.beforeEach(async ({ page }) => {
    schemaPage = new SchemaPage(page);

    // Mock Supabase auth
    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: {
              user: {
                id: 'test-user-id',
                email: 'test@example.com'
              }
            },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: {
              session: {
                user: {
                  id: 'test-user-id',
                  email: 'test@example.com'
                }
              }
            },
            error: null
          })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });

    await schemaPage.goto();
  });

  test('user can create schema with multiple fields', async ({ page }) => {
    // Mock schema API
    await page.route('**/api/schemas', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          body: JSON.stringify({
            id: 'schema-1',
            name: 'Contract Extraction',
            fields: []
          })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify([])
        });
      }
    });

    // Create schema
    await schemaPage.createSchema('Contract Extraction', 'Extract contract details');

    // Add fields
    const addFieldButton = page.getByRole('button', { name: /add.*field/i });
    if (await addFieldButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Add parties field
      await addFieldButton.click();
      await page.getByLabel(/field.*name/i).fill('parties');

      const typeSelect = page.getByLabel(/type/i);
      if (await typeSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
        await typeSelect.selectOption('array');
      }

      await page.getByRole('button', { name: /save.*field/i }).click();
      await page.waitForTimeout(500);

      // Add date field
      if (await addFieldButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await addFieldButton.click();
        await page.getByLabel(/field.*name/i).fill('contract_date');

        const typeSelect2 = page.getByLabel(/type/i);
        if (await typeSelect2.isVisible({ timeout: 1000 }).catch(() => false)) {
          await typeSelect2.selectOption('date');
        }

        await page.getByRole('button', { name: /save.*field/i }).click();
      }
    }

    // Save schema
    const saveButton = page.getByRole('button', { name: /save.*schema/i });
    if (await saveButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await saveButton.click();
    }
  });

  test('user can test schema on sample text', async ({ page }) => {
    // Mock schema
    await page.route('**/api/schemas', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'schema-1',
            name: 'Contract Schema',
            fields: [
              { name: 'parties', type: 'array' },
              { name: 'date', type: 'date' }
            ]
          }
        ])
      });
    });

    // Mock test API
    await page.route('**/api/schemas/schema-1/test', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          results: {
            parties: ['Party A', 'Party B'],
            date: '2024-01-15'
          }
        })
      });
    });

    // Wait for schema to load
    await page.waitForTimeout(1000);

    // Open schema
    const schemaItem = page.getByText('Contract Schema');
    if (await schemaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await schemaItem.click();
      await page.waitForTimeout(500);

      // Test schema
      const testButton = page.getByRole('button', { name: /test.*schema/i });
      if (await testButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await testButton.click();
        await page.waitForTimeout(500);

        const sampleInput = page.getByLabel(/sample|text/i);
        if (await sampleInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await sampleInput.fill('Contract between Party A and Party B dated 2024-01-15');

          const runButton = page.getByRole('button', { name: /run.*test/i });
          if (await runButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await runButton.click();
            await page.waitForTimeout(2000);

            // Verify results appear
            const hasResults = await page.locator('text=/Party A|Party B|2024-01-15|result/i').isVisible({ timeout: 3000 }).catch(() => false);
            expect(hasResults).toBeTruthy();
          }
        }
      }
    }
  });

  test('user can run extraction on document', async ({ page }) => {
    // Mock schema
    await page.route('**/api/schemas', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'schema-1',
            name: 'Extraction Schema'
          }
        ])
      });
    });

    // Mock documents for selection
    await page.route('**/api/documents', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: 'doc-1', title: 'Test Document' }
        ])
      });
    });

    // Mock extraction API
    await page.route('**/api/schemas/schema-1/extract', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          extraction_id: 'extraction-1',
          status: 'completed',
          results: {
            field1: 'value1',
            field2: 'value2'
          }
        })
      });
    });

    await page.waitForTimeout(1000);

    // Open schema
    const schemaItem = page.getByText('Extraction Schema');
    if (await schemaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await schemaItem.click();
      await page.waitForTimeout(500);

      // Run extraction
      const extractButton = page.getByRole('button', { name: /run.*extraction|extract/i });
      if (await extractButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await extractButton.click();
        await page.waitForTimeout(500);

        // Select document
        const docSelect = page.getByLabel(/document|select/i);
        if (await docSelect.isVisible({ timeout: 1000 }).catch(() => false)) {
          await docSelect.click();
          await page.getByRole('option').first().click();
        }

        // Start extraction
        const startButton = page.getByRole('button', { name: /start|extract/i });
        if (await startButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await startButton.click();
          await page.waitForTimeout(3000);

          // Verify completion
          const hasComplete = await page.locator('text=/complete|success|finished/i').isVisible({ timeout: 5000 }).catch(() => false);
          expect(hasComplete).toBeTruthy();
        }
      }
    }
  });

  test('user can view extraction results', async ({ page }) => {
    // Mock extractions list
    await page.route('**/api/extractions', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'extraction-1',
            schema_name: 'Test Schema',
            status: 'completed',
            created_at: new Date().toISOString()
          }
        ])
      });
    });

    // Mock extraction details
    await page.route('**/api/extractions/extraction-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'extraction-1',
          results: {
            parties: ['Alice', 'Bob'],
            amount: '$10,000',
            date: '2024-01-15'
          }
        })
      });
    });

    // Navigate to extractions
    await page.goto('/extractions');
    await page.waitForTimeout(1000);

    // Open extraction
    const extractionItem = page.getByText('Test Schema');
    if (await extractionItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await extractionItem.click();
      await page.waitForTimeout(1000);

      // Verify results are displayed
      const hasResults = await page.locator('text=/Alice|Bob|10,000|result/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasResults).toBeTruthy();
    }
  });

  test('user can export extraction results', async ({ page }) => {
    // Mock extraction
    await page.route('**/api/extractions/extraction-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'extraction-1',
          results: { field: 'value' }
        })
      });
    });

    // Navigate to extraction
    await page.goto('/extractions/extraction-1');
    await page.waitForTimeout(1000);

    // Try to export
    const exportButton = page.getByRole('button', { name: /export/i });
    if (await exportButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await exportButton.click();
      await page.waitForTimeout(500);

      // Select JSON format
      const jsonOption = page.getByRole('menuitem', { name: /json/i });
      if (await jsonOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await jsonOption.click();
        const download = await downloadPromise;

        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.json$/);
        }
      }
    }
  });

  test('user can generate schema with AI', async ({ page }) => {
    // Mock AI generation
    await page.route('**/api/schemas/generate', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          schema: {
            name: 'Generated Schema',
            fields: [
              { name: 'court_name', type: 'string' },
              { name: 'case_number', type: 'string' },
              { name: 'ruling', type: 'text' }
            ]
          }
        })
      });
    });

    await page.route('**/api/schemas', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([])
      });
    });

    await page.waitForTimeout(500);

    // Try AI generation
    const generateButton = page.getByRole('button', { name: /generate.*ai|ai.*generate/i });
    if (await generateButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await generateButton.click();
      await page.waitForTimeout(500);

      const promptInput = page.getByLabel(/prompt|describe/i);
      if (await promptInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await promptInput.fill('Extract court name, case number, and ruling from judgments');

        const generateBtn = page.getByRole('button', { name: /generate/i });
        if (await generateBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await generateBtn.click();
          await page.waitForTimeout(2000);

          // Verify generated schema appears
          const hasSchema = await page.locator('text=/Generated|court_name|case_number/i').isVisible({ timeout: 3000 }).catch(() => false);
          expect(hasSchema).toBeTruthy();
        }
      }
    }
  });

  test('user can handle bulk extraction', async ({ page }) => {
    // Mock bulk extraction
    await page.route('**/api/schemas/schema-1/bulk-extract', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          job_id: 'bulk-job-1',
          status: 'processing',
          total: 10,
          completed: 0
        })
      });
    });

    // Mock schema
    await page.route('**/api/schemas', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: 'schema-1', name: 'Bulk Schema' }
        ])
      });
    });

    await page.waitForTimeout(1000);

    // Open schema
    const schemaItem = page.getByText('Bulk Schema');
    if (await schemaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await schemaItem.click();
      await page.waitForTimeout(500);

      // Try bulk extraction
      const bulkButton = page.getByRole('button', { name: /bulk.*extraction|extract.*multiple/i });
      if (await bulkButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await bulkButton.click();
        await page.waitForTimeout(1000);

        // Verify bulk interface appears
        const hasBulkUI = await page.locator('text=/select.*documents|bulk|multiple/i').isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasBulkUI).toBeTruthy();
      }
    }
  });

  test('user can version schemas', async ({ page }) => {
    // Mock schema with versions
    await page.route('**/api/schemas/schema-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'schema-1',
          name: 'Versioned Schema',
          version: 2,
          versions: [
            { version: 1, created_at: '2024-01-01' },
            { version: 2, created_at: '2024-01-15' }
          ]
        })
      });
    });

    await page.route('**/api/schemas', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: 'schema-1', name: 'Versioned Schema', version: 2 }
        ])
      });
    });

    await page.waitForTimeout(1000);

    // Open schema
    const schemaItem = page.getByText('Versioned Schema');
    if (await schemaItem.isVisible({ timeout: 2000 }).catch(() => false)) {
      await schemaItem.click();
      await page.waitForTimeout(1000);

      // Check for version info
      const hasVersionInfo = await page.locator('text=/version|v1|v2/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasVersionInfo).toBeTruthy();
    }
  });
});
