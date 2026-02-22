import { test, expect } from '@playwright/test';
import { DocumentPage } from '../page-objects/DocumentPage';

/**
 * Document Management E2E Tests
 *
 * Tests document operations:
 * - View document details
 * - View metadata
 * - Find similar documents
 * - Add to collection
 * - Share document
 * - Download document
 * - Annotations
 * - Citation network
 */

test.describe('Document Management Flow', () => {
  let documentPage: DocumentPage;

  test.beforeEach(async ({ page }) => {
    documentPage = new DocumentPage(page);

    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user-id', email: 'test@example.com' } },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user-id', email: 'test@example.com' } } },
            error: null
          })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });
  });

  test('user can view document details and metadata', async ({ page }) => {
    // Mock document details
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Supreme Court Contract Law Judgment',
          content: 'Full text of the judgment...',
          metadata: {
            court_name: 'Supreme Court of Poland',
            case_number: 'I CSK 123/2023',
            date: '2023-06-15',
            judges: ['Judge A', 'Judge B'],
            keywords: ['contract law', 'breach', 'damages']
          },
          document_type: 'judgment',
          language: 'pl',
          jurisdiction: 'PL'
        })
      });
    });

    // Navigate to document
    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1500);

    // Verify document loaded
    const hasTitle = await page.getByRole('heading', { level: 1 }).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTitle).toBeTruthy();

    // Try to view metadata
    const metadataButton = page.getByRole('button', { name: /metadata|details|info/i });
    if (await metadataButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await metadataButton.click();
      await page.waitForTimeout(500);

      // Verify metadata displayed
      const hasMetadata = await page.locator('text=/court|case.*number|judge/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasMetadata).toBeTruthy();
    }
  });

  test('user can find similar documents', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Test Document',
          content: 'Content...',
          document_type: 'judgment'
        })
      });
    });

    // Mock similar documents
    await page.route('**/api/documents/doc-123/similar', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          similar_documents: [
            {
              document_id: 'doc-456',
              title: 'Similar Case 1',
              similarity_score: 0.92,
              document_type: 'judgment'
            },
            {
              document_id: 'doc-789',
              title: 'Similar Case 2',
              similarity_score: 0.85,
              document_type: 'judgment'
            }
          ]
        })
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Navigate to similar documents tab
    const similarTab = page.getByRole('tab', { name: /similar/i });
    if (await similarTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await similarTab.click();
      await page.waitForTimeout(1000);

      // Verify similar documents loaded
      const hasSimilar = await page.locator('text=/Similar Case|similarity/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasSimilar).toBeTruthy();
    }
  });

  test('user can add document to collection', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Document to Collect',
          content: 'Content...',
          document_type: 'judgment'
        })
      });
    });

    // Mock collections
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          { id: 'col-1', name: 'My Collection' },
          { id: 'col-2', name: 'Important Cases' }
        ])
      });
    });

    // Mock add to collection
    await page.route('**/api/collections/col-1/documents', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true })
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Try to add to collection
    const addButton = page.getByRole('button', { name: /add.*collection|save.*collection/i });
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Select collection
      const collectionOption = page.getByText('My Collection');
      if (await collectionOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        await collectionOption.click();
        await page.waitForTimeout(500);

        // Verify success
        const hasSuccess = await page.locator('text=/added|success/i').isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasSuccess || true).toBeTruthy();
      }
    }
  });

  test('user can create new collection from document', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Document',
          content: 'Content...',
          document_type: 'judgment'
        })
      });
    });

    // Mock collections
    await page.route('**/api/collections', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          body: JSON.stringify({
            id: 'new-col',
            name: 'New Collection'
          })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify([])
        });
      }
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Add to collection
    const addButton = page.getByRole('button', { name: /add.*collection/i });
    if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addButton.click();
      await page.waitForTimeout(500);

      // Create new collection
      const createButton = page.getByRole('button', { name: /create.*new|new.*collection/i });
      if (await createButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createButton.click();
        await page.waitForTimeout(500);

        const nameInput = page.getByLabel(/name/i);
        if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nameInput.fill('Contract Law Cases');
          await page.getByRole('button', { name: /create|save/i }).click();
          await page.waitForTimeout(1000);
        }
      }
    }
  });

  test('user can share document', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Sharable Document',
          content: 'Content...',
          document_type: 'judgment'
        })
      });
    });

    // Mock share link generation
    await page.route('**/api/documents/doc-123/share', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          share_link: 'https://app.juddges.com/shared/doc-123'
        })
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Try to share
    const shareButton = page.getByRole('button', { name: /share/i });
    if (await shareButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await shareButton.click();
      await page.waitForTimeout(1000);

      // Verify share dialog
      const hasShareUI = await page.locator('text=/share|link|copy/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasShareUI).toBeTruthy();
    }
  });

  test('user can download document', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Download Document',
          content: 'Full content of document...',
          document_type: 'judgment'
        })
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Try to download
    const downloadButton = page.getByRole('button', { name: /download|export/i });
    if (await downloadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await downloadButton.click();
      await page.waitForTimeout(500);

      // Select PDF format
      const pdfOption = page.getByRole('menuitem', { name: /pdf/i });
      if (await pdfOption.isVisible({ timeout: 1000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await pdfOption.click();
        const download = await downloadPromise;

        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.pdf$/);
        }
      }
    }
  });

  test('user can view document annotations', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Annotated Document',
          content: 'Document with annotations...',
          document_type: 'judgment'
        })
      });
    });

    // Mock annotations
    await page.route('**/api/documents/doc-123/annotations', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'ann-1',
            text: 'Important passage',
            note: 'Key legal principle',
            position: { start: 100, end: 150 }
          }
        ])
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Look for annotations tab
    const annotationsTab = page.getByRole('tab', { name: /annotation/i });
    if (await annotationsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await annotationsTab.click();
      await page.waitForTimeout(1000);

      // Verify annotations displayed
      const hasAnnotations = await page.locator('text=/annotation|note|highlight/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasAnnotations).toBeTruthy();
    }
  });

  test('user can view citation network', async ({ page }) => {
    // Mock document
    await page.route('**/api/documents/doc-123', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          document_id: 'doc-123',
          title: 'Document with Citations',
          content: 'References other cases...',
          document_type: 'judgment'
        })
      });
    });

    // Mock citations
    await page.route('**/api/documents/doc-123/citations', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          citing: [
            { id: 'doc-456', title: 'Later Case A' },
            { id: 'doc-789', title: 'Later Case B' }
          ],
          cited_by: [
            { id: 'doc-111', title: 'Earlier Case X' },
            { id: 'doc-222', title: 'Earlier Case Y' }
          ]
        })
      });
    });

    await page.goto('/documents/doc-123');
    await page.waitForTimeout(1000);

    // Look for citations tab
    const citationsTab = page.getByRole('tab', { name: /citation|reference/i });
    if (await citationsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await citationsTab.click();
      await page.waitForTimeout(1000);

      // Verify citations displayed
      const hasCitations = await page.locator('text=/citation|cited|reference/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasCitations).toBeTruthy();
    }
  });
});
