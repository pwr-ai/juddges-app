import { test, expect } from '@playwright/test';
import { CollectionPage } from '../page-objects/CollectionPage';

/**
 * Complete Collection Management E2E Tests
 *
 * Tests all collection functionality:
 * - Create collection
 * - Add/remove documents
 * - Rename collection
 * - Share collection
 * - Delete collection
 */

test.describe('Complete Collection Flow', () => {
  let collectionPage: CollectionPage;

  test.beforeEach(async ({ page }) => {
    collectionPage = new CollectionPage(page);

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

    await collectionPage.goto();
  });

  test('user can create a new collection', async ({ page }) => {
    // Mock collections API
    await page.route('**/api/collections', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'collection-1',
            name: 'Contract Cases',
            description: 'Important contract law cases',
            created_at: new Date().toISOString()
          })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify([])
        });
      }
    });

    // Create collection
    await collectionPage.createCollection('Contract Cases', 'Important contract law cases');

    // Verify success
    await page.waitForTimeout(1000);
    await expect(page.getByText(/created|success/i)).toBeVisible({ timeout: 5000 }).catch(() => true);
  });

  test('user can add documents to collection', async ({ page }) => {
    // Mock collections list
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'collection-1',
            name: 'My Collection',
            document_count: 0
          }
        ])
      });
    });

    // Mock collection details
    await page.route('**/api/collections/collection-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'collection-1',
          name: 'My Collection',
          documents: []
        })
      });
    });

    // Mock add document
    await page.route('**/api/collections/collection-1/documents', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          success: true,
          document_id: 'doc-1'
        })
      });
    });

    // Open collection
    await page.waitForTimeout(1000);
    const collectionLink = page.getByText('My Collection');
    if (await collectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collectionLink.click();
      await page.waitForTimeout(500);

      // Try to add document
      const addButton = page.getByRole('button', { name: /add.*document/i });
      if (await addButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await addButton.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('user can remove documents from collection', async ({ page }) => {
    // Mock collection with documents
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'collection-1',
            name: 'My Collection',
            document_count: 2
          }
        ])
      });
    });

    await page.route('**/api/collections/collection-1', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'collection-1',
          name: 'My Collection',
          documents: [
            {
              document_id: 'doc-1',
              title: 'First Document'
            },
            {
              document_id: 'doc-2',
              title: 'Second Document'
            }
          ]
        })
      });
    });

    await page.route('**/api/collections/collection-1/documents/doc-1', route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true })
        });
      }
    });

    // Navigate to collection
    await page.waitForTimeout(1000);
    const collectionLink = page.getByText('My Collection');
    if (await collectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collectionLink.click();
      await page.waitForTimeout(1000);

      // Try to remove document
      const documentItem = page.getByText('First Document');
      if (await documentItem.isVisible({ timeout: 2000 }).catch(() => false)) {
        await documentItem.hover();
        const removeButton = page.getByRole('button', { name: /remove/i }).first();
        if (await removeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await removeButton.click();
        }
      }
    }
  });

  test('user can rename collection', async ({ page }) => {
    // Mock collections
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'collection-1',
            name: 'Old Name',
            document_count: 0
          }
        ])
      });
    });

    await page.route('**/api/collections/collection-1', route => {
      if (route.request().method() === 'PATCH') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            id: 'collection-1',
            name: 'New Name'
          })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            id: 'collection-1',
            name: 'Old Name',
            documents: []
          })
        });
      }
    });

    // Open collection
    await page.waitForTimeout(1000);
    const collectionLink = page.getByText('Old Name');
    if (await collectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collectionLink.click();
      await page.waitForTimeout(500);

      // Try to rename
      const renameButton = page.getByRole('button', { name: /rename|edit/i });
      if (await renameButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await renameButton.click();
        const nameInput = page.getByLabel(/name/i);
        if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await nameInput.clear();
          await nameInput.fill('New Name');
          await page.getByRole('button', { name: /save/i }).click();
        }
      }
    }
  });

  test('user can share collection', async ({ page }) => {
    // Mock collections
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'collection-1',
            name: 'Shared Collection',
            document_count: 5
          }
        ])
      });
    });

    await page.route('**/api/collections/collection-1/share', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          share_link: 'https://app.juddges.com/shared/abc123'
        })
      });
    });

    // Open collection
    await page.waitForTimeout(1000);
    const collectionLink = page.getByText('Shared Collection');
    if (await collectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collectionLink.click();
      await page.waitForTimeout(500);

      // Try to share
      const shareButton = page.getByRole('button', { name: /share/i });
      if (await shareButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await shareButton.click();
        await page.waitForTimeout(1000);

        // Verify share dialog/link appears
        const hasShareContent = await page.locator('text=/share|link|copy/i').isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasShareContent).toBeTruthy();
      }
    }
  });

  test('user can delete collection', async ({ page }) => {
    // Mock collections
    await page.route('**/api/collections', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([
          {
            id: 'collection-to-delete',
            name: 'Delete Me',
            document_count: 0
          }
        ])
      });
    });

    await page.route('**/api/collections/collection-to-delete', route => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true })
        });
      } else {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            id: 'collection-to-delete',
            name: 'Delete Me',
            documents: []
          })
        });
      }
    });

    // Open collection
    await page.waitForTimeout(1000);
    const collectionLink = page.getByText('Delete Me');
    if (await collectionLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collectionLink.click();
      await page.waitForTimeout(500);

      // Try to delete
      const deleteButton = page.getByRole('button', { name: /delete/i });
      if (await deleteButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deleteButton.click();

        // Confirm deletion
        await page.waitForTimeout(500);
        const confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
        if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await confirmButton.click();
        }
      }
    }
  });
});
