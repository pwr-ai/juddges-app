/**
 * Collection management E2E tests.
 *
 * Covers the four CRUD flows on the collections UI:
 *   1. Create — index page dialog.
 *   2. Edit  — detail page, Pencil button → form → Save Changes.
 *   3. Add judgments (documents) — detail page, "Add Documents" dialog.
 *   4. Delete — index page card delete button → confirm dialog → "Collection deleted" toast.
 *
 * Strategy:
 *   - Real Supabase login via `authenticatedPage` fixture so server-side
 *     `/api/collections*` routes pass auth on the Next.js side.
 *   - The FastAPI backend is mocked at the Next.js API-route boundary using
 *     `page.route('**\/api/collections*')` so tests do not require a running
 *     backend or applied Supabase migrations.
 *   - Each test asserts the request body sent to the API route AND a visible
 *     UI outcome (toast, list update, navigation), so a regression on either
 *     side fails the test.
 *
 * Why mock at the Next.js route boundary (not the FastAPI URL)? Browser-side
 * fetches from the React client go to `/api/collections*` (the Next API
 * route). The route then proxies to FastAPI server-side, but Playwright can
 * only intercept requests originating in the browser. Mocking `/api/...` is
 * deterministic and matches what the React code actually calls.
 */

import { test, expect } from '../helpers/auth-fixture';
import type { Route } from '@playwright/test';

const COLLECTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

interface MockCollection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  documents?: string[];
  document_count?: number;
}

function makeCollection(overrides: Partial<MockCollection> = {}): MockCollection {
  const now = '2026-05-09T12:00:00Z';
  return {
    id: COLLECTION_ID,
    user_id: USER_ID,
    name: 'Crime',
    description: 'Important contract law cases',
    created_at: now,
    updated_at: now,
    documents: [],
    document_count: 0,
    ...overrides,
  };
}

test.describe('Collections — create', () => {
  test('user can create a new collection from the index page', async ({ authenticatedPage: page }) => {
    let postBody: { name?: string; description?: string } | null = null;
    const initialList: MockCollection[] = [];
    let listAfterCreate: MockCollection[] | null = null;

    await page.route('**/api/collections', async (route: Route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postBody = JSON.parse(route.request().postData() || '{}');
        const created = makeCollection({
          name: postBody?.name ?? '',
          description: postBody?.description ?? null,
        });
        listAfterCreate = [{ ...created, documents: [], document_count: 0 }];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(created),
        });
        return;
      }
      // GET — return current list (empty until POST has been processed).
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(listAfterCreate ?? initialList),
      });
    });

    await page.goto('/collections');
    await page.getByRole('button', { name: /new collection/i }).click();

    const nameInput = page.getByLabel(/collection name/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Crime');
    await page.getByLabel(/description/i).fill('Important contract law cases');

    await page.getByRole('button', { name: /^create collection$/i }).click();

    await expect.poll(() => postBody).not.toBeNull();
    const captured = postBody as { name?: string; description?: string } | null;
    expect(captured).toEqual({
      name: 'Crime',
      description: 'Important contract law cases',
    });

    // Dialog closes and the new collection appears in the list.
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Crime')).toBeVisible();
  });

  test('shows toast with backend error message when create fails', async ({ authenticatedPage: page }) => {
    const detail =
      "Database error: Could not find the table 'public.collections' in the schema cache";

    await page.route('**/api/collections', async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: detail }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/collections');
    await page.getByRole('button', { name: /new collection/i }).click();
    await page.getByLabel(/collection name/i).fill('Crime');
    await page.getByRole('button', { name: /^create collection$/i }).click();

    // Sonner renders toasts in a region; we just check the message text shows up.
    await expect(page.getByText(detail)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Collections — edit', () => {
  test('user can edit a collection name and description', async ({ authenticatedPage: page }) => {
    let putBody: { name?: string; description?: string } | null = null;
    const collection = makeCollection({ name: 'Old Name', description: 'Old description' });

    await page.route(`**/api/collections/${COLLECTION_ID}*`, async (route: Route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        putBody = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...collection,
            name: putBody?.name ?? collection.name,
            description: putBody?.description ?? collection.description,
          }),
        });
        return;
      }
      // GET
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(collection),
      });
    });

    await page.goto(`/collections/${COLLECTION_ID}`);

    await page.getByRole('button', { name: /edit collection/i }).click();
    const nameField = page.getByLabel(/collection name/i);
    await expect(nameField).toHaveValue('Old Name');

    await nameField.fill('New Name');
    await page.getByLabel(/description/i).fill('New description');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect.poll(() => putBody).not.toBeNull();
    const capturedPut = putBody as { name?: string; description?: string } | null;
    expect(capturedPut?.name).toBe('New Name');
    expect(capturedPut?.description).toBe('New description');

    await expect(page.getByText(/collection updated successfully/i)).toBeVisible();
  });
});

test.describe('Collections — add judgments', () => {
  test('user can add a single judgment to a collection', async ({ authenticatedPage: page }) => {
    const collection = makeCollection({ name: 'Crime', documents: [], document_count: 0 });
    let addBody: { document_id?: string; document_ids?: string[] } | null = null;

    await page.route(`**/api/collections/${COLLECTION_ID}/documents`, async (route: Route) => {
      addBody = JSON.parse(route.request().postData() || '{}');
      collection.documents = [addBody?.document_id ?? ''];
      collection.document_count = 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route(`**/api/collections/${COLLECTION_ID}*`, async (route: Route) => {
      if (route.request().url().includes('/documents')) return; // handled above
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(collection),
      });
    });

    await page.goto(`/collections/${COLLECTION_ID}`);

    await page.getByRole('button', { name: /add documents/i }).first().click();
    const idsField = page.getByLabel(/document ids/i);
    await idsField.fill('II FSK 1234/21');

    await page.getByRole('button', { name: /^add documents$/i }).last().click();

    await expect.poll(() => addBody).not.toBeNull();
    const capturedAdd = addBody as { document_id?: string } | null;
    expect(capturedAdd?.document_id).toBe('II FSK 1234/21');
    await expect(page.getByText(/document added to collection successfully/i)).toBeVisible();
  });

  test('user can batch-add multiple judgments', async ({ authenticatedPage: page }) => {
    const collection = makeCollection({ name: 'Crime', documents: [], document_count: 0 });
    let batchBody: { document_ids?: string[] } | null = null;

    await page.route(`**/api/collections/${COLLECTION_ID}/documents`, async (route: Route) => {
      batchBody = JSON.parse(route.request().postData() || '{}');
      const ids = batchBody?.document_ids ?? [];
      collection.documents = ids;
      collection.document_count = ids.length;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'ok',
          added: ids,
          failed: [],
          total_requested: ids.length,
        }),
      });
    });

    await page.route(`**/api/collections/${COLLECTION_ID}*`, async (route: Route) => {
      if (route.request().url().includes('/documents')) return;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(collection),
      });
    });

    await page.goto(`/collections/${COLLECTION_ID}`);
    await page.getByRole('button', { name: /add documents/i }).first().click();
    await page.getByLabel(/document ids/i).fill('II FSK 1234/21\nII FSK 5678/22\nII FSK 9012/23');
    await page.getByRole('button', { name: /^add documents$/i }).last().click();

    await expect.poll(() => batchBody).not.toBeNull();
    const capturedBatch = batchBody as { document_ids?: string[] } | null;
    expect(capturedBatch?.document_ids).toHaveLength(3);
    expect(capturedBatch?.document_ids).toEqual(
      expect.arrayContaining(['II FSK 1234/21', 'II FSK 5678/22', 'II FSK 9012/23']),
    );
    await expect(page.getByText(/added 3 documents to collection/i)).toBeVisible();
  });
});

test.describe('Collections — delete', () => {
  test('user can delete a collection from the index page', async ({ authenticatedPage: page }) => {
    const collection = makeCollection({ name: 'Delete Me' });
    let deleteRequested = false;
    const list: MockCollection[] = [{ ...collection, documents: [], document_count: 0 }];

    await page.route(`**/api/collections/${COLLECTION_ID}*`, async (route: Route) => {
      if (route.request().method() === 'DELETE') {
        deleteRequested = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Collection deleted successfully' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(collection),
      });
    });

    await page.route('**/api/collections', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(list),
      });
    });

    await page.goto('/collections');
    const card = page.getByText('Delete Me');
    await expect(card).toBeVisible();

    // The action buttons reveal on hover (opacity transition); hover the card first.
    await card.hover();
    await page.getByRole('button', { name: /delete collection/i }).click();

    // Confirm in the DeleteConfirmationDialog.
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: /^delete$/i }).click();

    await expect(page.getByText(/collection deleted/i)).toBeVisible();

    // The actual DELETE call fires when the toast is dismissed (5s). Wait for it.
    await expect.poll(() => deleteRequested, { timeout: 8_000 }).toBe(true);
  });
});
