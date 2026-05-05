/**
 * End-to-End tests for Schema Editor
 *
 * Tests complete schema creation workflow, AI chat + visual editor sync,
 * and save/load schema functionality using Playwright.
 */

import { test, expect, Page } from '@playwright/test';

// Test constants
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3006';
const SCHEMA_CHAT_URL = `${BASE_URL}/schema-chat`;

// Test timeouts
const TIMEOUT = {
  SHORT: 5000,
  MEDIUM: 10000,
  LONG: 30000,
};

/**
 * Helper function to login (if authentication is required)
 */
async function login(page: Page) {
  // This is a placeholder - adjust based on actual authentication flow
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'testpassword');
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: TIMEOUT.MEDIUM });
}

/**
 * Helper function to navigate to schema chat
 */
async function navigateToSchemaChat(page: Page) {
  await page.goto(SCHEMA_CHAT_URL);
  await page.waitForLoadState('networkidle');
}

/**
 * Helper function to wait for AI response
 */
async function waitForAIResponse(page: Page) {
  // Wait for loading indicator to appear and disappear
  await page.waitForSelector('[data-testid="ai-loading"]', {
    state: 'visible',
    timeout: TIMEOUT.SHORT,
  }).catch(() => {
    // Loading might be too fast to catch
  });

  await page.waitForSelector('[data-testid="ai-loading"]', {
    state: 'hidden',
    timeout: TIMEOUT.LONG,
  }).catch(() => {
    // Already hidden
  });
}

test.describe('Schema Editor E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Login if required
    // await login(page);

    // Navigate to schema chat
    await navigateToSchemaChat(page);
  });

  test.describe('Initial State and Layout', () => {
    test('should display split-pane layout with chat and canvas', async ({ page }) => {
      // Verify split-pane layout
      await expect(page.locator('[data-testid="chat-pane"]')).toBeVisible();
      await expect(page.locator('[data-testid="canvas-pane"]')).toBeVisible();

      // Verify approximate 40/60 split
      const chatPane = page.locator('[data-testid="chat-pane"]');
      const canvasPane = page.locator('[data-testid="canvas-pane"]');

      const chatBox = await chatPane.boundingBox();
      const canvasBox = await canvasPane.boundingBox();

      expect(chatBox).toBeTruthy();
      expect(canvasBox).toBeTruthy();

      if (chatBox && canvasBox) {
        const totalWidth = chatBox.width + canvasBox.width;
        const chatRatio = chatBox.width / totalWidth;

        // Allow some tolerance for the 40/60 split (35-45%)
        expect(chatRatio).toBeGreaterThan(0.35);
        expect(chatRatio).toBeLessThan(0.45);
      }
    });

    test('should display empty canvas initially', async ({ page }) => {
      const fieldList = page.locator('[data-testid="field-list"]');
      await expect(fieldList).toBeVisible();

      const fieldCards = await fieldList.locator('[data-testid^="field-card-"]').count();
      expect(fieldCards).toBe(0);
    });

    test('should display chat input and message history', async ({ page }) => {
      await expect(page.locator('[data-testid="chat-input"]')).toBeVisible();
      await expect(page.locator('[data-testid="message-list"]')).toBeVisible();
    });
  });

  test.describe('Complete Schema Creation Workflow', () => {
    test('should create schema through AI chat', async ({ page }) => {
      // Send message to AI
      const chatInput = page.locator('[data-testid="chat-input"]');
      await chatInput.fill('Create a schema for extracting company information with fields: company name, address, and registration number');
      await chatInput.press('Enter');

      // Wait for AI response
      await waitForAIResponse(page);

      // Verify fields appear in canvas
      await expect(page.locator('[data-testid^="field-card-"]').first()).toBeVisible({
        timeout: TIMEOUT.LONG,
      });

      // Count created fields
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBeGreaterThan(0);

      // Verify field details
      const firstField = page.locator('[data-testid^="field-card-"]').first();
      await expect(firstField.locator('[data-testid="field-name"]')).toBeVisible();
      await expect(firstField.locator('[data-testid="field-type"]')).toBeVisible();
    });

    test('should highlight AI-created fields', async ({ page }) => {
      // Create fields via AI
      await page.locator('[data-testid="chat-input"]').fill('Create a field called "email" of type string');
      await page.locator('[data-testid="chat-input"]').press('Enter');
      await waitForAIResponse(page);

      // Verify highlight class
      const aiField = page.locator('[data-testid^="field-card-"]').first();
      await expect(aiField).toHaveClass(/ai-created|highlighted/);

      // Wait for highlight to fade (3 seconds)
      await page.waitForTimeout(3500);

      // Verify highlight removed
      await expect(aiField).not.toHaveClass(/ai-created|highlighted/);
    });

    test('should handle multiple AI requests in sequence', async ({ page }) => {
      const chatInput = page.locator('[data-testid="chat-input"]');

      // First request
      await chatInput.fill('Add a field called "name" of type string');
      await chatInput.press('Enter');
      await waitForAIResponse(page);

      const firstCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(firstCount).toBeGreaterThan(0);

      // Second request
      await chatInput.fill('Add a field called "age" of type number');
      await chatInput.press('Enter');
      await waitForAIResponse(page);

      const secondCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(secondCount).toBeGreaterThan(firstCount);
    });
  });

  test.describe('Visual Editor CRUD Operations', () => {
    test('should add field manually via Add Field button', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-field-button"]');
      await addButton.click();

      // Verify field editor modal opens
      await expect(page.locator('[data-testid="field-editor-modal"]')).toBeVisible();

      // Fill in field details
      await page.locator('[data-testid="field-name-input"]').fill('manual_field');
      await page.locator('[data-testid="field-type-select"]').selectOption('string');
      await page.locator('[data-testid="field-description-input"]').fill('A manually created field');

      // Save field
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify modal closes
      await expect(page.locator('[data-testid="field-editor-modal"]')).not.toBeVisible();

      // Verify field appears in canvas
      await expect(page.locator('[data-testid^="field-card-"]')).toBeVisible();
      await expect(page.locator('[data-testid="field-name"]')).toContainText('manual_field');
    });

    test('should edit existing field', async ({ page }) => {
      // First, create a field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('original_name');
      await page.locator('[data-testid="save-field-button"]').click();

      // Click edit on the field
      await page.locator('[data-testid="edit-button"]').first().click();

      // Verify modal opens with existing data
      await expect(page.locator('[data-testid="field-editor-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="field-name-input"]')).toHaveValue('original_name');

      // Update field name
      await page.locator('[data-testid="field-name-input"]').fill('updated_name');
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify updated name in canvas
      await expect(page.locator('[data-testid="field-name"]')).toContainText('updated_name');
    });

    test('should delete field with confirmation', async ({ page }) => {
      // Create a field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('field_to_delete');
      await page.locator('[data-testid="save-field-button"]').click();

      // Click delete button
      await page.locator('[data-testid="delete-button"]').first().click();

      // Verify confirmation dialog
      await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();

      // Confirm deletion
      await page.locator('[data-testid="confirm-delete-button"]').click();

      // Verify field removed
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBe(0);
    });

    test('should cancel delete operation', async ({ page }) => {
      // Create a field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('keep_this_field');
      await page.locator('[data-testid="save-field-button"]').click();

      const initialCount = await page.locator('[data-testid^="field-card-"]').count();

      // Try to delete
      await page.locator('[data-testid="delete-button"]').first().click();
      await page.locator('[data-testid="cancel-delete-button"]').click();

      // Verify field still exists
      const finalCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(finalCount).toBe(initialCount);
    });
  });

  test.describe('AI Chat + Visual Editor Sync', () => {
    test('should sync AI-created fields to visual editor', async ({ page }) => {
      // Create field via AI
      await page.locator('[data-testid="chat-input"]').fill('Create a string field called "test_sync"');
      await page.locator('[data-testid="chat-input"]').press('Enter');
      await waitForAIResponse(page);

      // Verify field appears in canvas
      await expect(page.locator('[data-testid="field-name"]')).toContainText('test_sync');

      // Verify field is editable
      await page.locator('[data-testid="edit-button"]').first().click();
      await expect(page.locator('[data-testid="field-editor-modal"]')).toBeVisible();
    });

    test('should sync visual edits back to schema', async ({ page }) => {
      // Create field visually
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('visual_field');
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify schema metadata updates
      const fieldCount = page.locator('[data-testid="schema-field-count"]');
      await expect(fieldCount).toContainText('1');
    });

    test('should handle concurrent AI and manual edits', async ({ page }) => {
      // Start with AI-created field
      await page.locator('[data-testid="chat-input"]').fill('Create a field called "ai_field"');
      await page.locator('[data-testid="chat-input"]').press('Enter');
      await waitForAIResponse(page);

      // Add manual field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('manual_field');
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify both fields exist
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBe(2);
    });
  });

  test.describe('Drag and Drop Reordering', () => {
    test('should reorder fields via drag and drop', async ({ page }) => {
      // Create multiple fields
      for (let i = 0; i < 3; i++) {
        await page.locator('[data-testid="add-field-button"]').click();
        await page.locator('[data-testid="field-name-input"]').fill(`field_${i}`);
        await page.locator('[data-testid="save-field-button"]').click();
      }

      // Get initial order
      const firstField = page.locator('[data-testid^="field-card-"]').nth(0);
      const firstFieldName = await firstField.locator('[data-testid="field-name"]').textContent();

      // Drag first field to last position
      const lastField = page.locator('[data-testid^="field-card-"]').nth(2);
      await firstField.dragTo(lastField);

      // Verify order changed
      const newLastField = page.locator('[data-testid^="field-card-"]').nth(2);
      const newLastFieldName = await newLastField.locator('[data-testid="field-name"]').textContent();

      expect(newLastFieldName).toBe(firstFieldName);
    });
  });

  test.describe('Save and Load Schema', () => {
    test('should save schema successfully', async ({ page }) => {
      // Create fields
      await page.locator('[data-testid="chat-input"]').fill('Create fields for name and email');
      await page.locator('[data-testid="chat-input"]').press('Enter');
      await waitForAIResponse(page);

      // Fill in schema metadata
      await page.locator('[data-testid="schema-name-input"]').fill('Test Schema');
      await page.locator('[data-testid="schema-description-input"]').fill('A test schema');

      // Save schema
      await page.locator('[data-testid="save-schema-button"]').click();

      // Verify success message
      await expect(page.locator('[data-testid="success-toast"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-toast"]')).toContainText('Schema saved');
    });

    test('should show validation errors before saving', async ({ page }) => {
      // Try to save without fields
      await page.locator('[data-testid="save-schema-button"]').click();

      // Verify validation error
      await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="validation-error"]')).toContainText('at least one field');
    });

    test('should load existing schema', async ({ page }) => {
      // Assuming there's a saved schema, load it
      await page.goto(`${SCHEMA_CHAT_URL}?schema_id=test-schema-123`);
      await page.waitForLoadState('networkidle');

      // Verify schema loaded
      await expect(page.locator('[data-testid="schema-name-input"]')).not.toBeEmpty();

      // Verify fields loaded
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBeGreaterThan(0);
    });

    test('should handle auto-save with debouncing', async ({ page }) => {
      // Create a field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('auto_save_test');

      // Make rapid changes
      await page.locator('[data-testid="field-description-input"]').fill('First change');
      await page.waitForTimeout(100);
      await page.locator('[data-testid="field-description-input"]').fill('Second change');
      await page.waitForTimeout(100);
      await page.locator('[data-testid="field-description-input"]').fill('Final change');

      // Save
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify saving indicator appears
      await expect(page.locator('[data-testid="saving-indicator"]')).toBeVisible();

      // Wait for save to complete (debounced)
      await page.waitForTimeout(600);

      // Verify saved
      await expect(page.locator('[data-testid="saving-indicator"]')).not.toBeVisible();
    });
  });

  test.describe('Validation and Error Handling', () => {
    test('should validate field names', async ({ page }) => {
      await page.locator('[data-testid="add-field-button"]').click();

      // Try invalid field name
      await page.locator('[data-testid="field-name-input"]').fill('123invalid');
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify validation error
      await expect(page.locator('[data-testid="field-name-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="field-name-error"]')).toContainText('valid identifier');
    });

    test('should validate required fields', async ({ page }) => {
      await page.locator('[data-testid="add-field-button"]').click();

      // Leave field name empty
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify validation error
      await expect(page.locator('[data-testid="field-name-error"]')).toBeVisible();
    });

    test('should handle backend validation errors', async ({ page }) => {
      // Create invalid schema structure
      await page.locator('[data-testid="chat-input"]').fill('Create a field with type "invalid_type"');
      await page.locator('[data-testid="chat-input"]').press('Enter');
      await waitForAIResponse(page);

      // Try to save
      await page.locator('[data-testid="save-schema-button"]').click();

      // Verify backend error displayed
      await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
    });
  });

  test.describe('Keyboard Shortcuts', () => {
    test('should save schema with Ctrl+S', async ({ page }) => {
      // Create a field
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('keyboard_test');
      await page.locator('[data-testid="save-field-button"]').click();

      // Press Ctrl+S
      await page.keyboard.press('Control+s');

      // Verify save triggered
      await expect(page.locator('[data-testid="saving-indicator"]')).toBeVisible();
    });

    test('should close modal with Escape', async ({ page }) => {
      // Open field editor
      await page.locator('[data-testid="add-field-button"]').click();
      await expect(page.locator('[data-testid="field-editor-modal"]')).toBeVisible();

      // Press Escape
      await page.keyboard.press('Escape');

      // Verify modal closed
      await expect(page.locator('[data-testid="field-editor-modal"]')).not.toBeVisible();
    });
  });

  test.describe('Real-time Synchronization', () => {
    test('should receive real-time updates from other sessions', async ({ page, context }) => {
      // This test would require setting up multiple browser contexts
      // to simulate collaborative editing

      // Create second page/session
      const page2 = await context.newPage();
      await page2.goto(SCHEMA_CHAT_URL);

      // Add field in first session
      await page.locator('[data-testid="add-field-button"]').click();
      await page.locator('[data-testid="field-name-input"]').fill('realtime_field');
      await page.locator('[data-testid="save-field-button"]').click();

      // Verify it appears in second session
      await expect(page2.locator('[data-testid^="field-card-"]')).toBeVisible({
        timeout: TIMEOUT.MEDIUM,
      });

      await page2.close();
    });
  });

  test.describe('Accessibility', () => {
    test('should be keyboard navigable', async ({ page }) => {
      // Tab through interactive elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Verify focus is on an interactive element
      const focusedElement = await page.evaluate(() => {
        return document.activeElement?.tagName;
      });

      expect(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']).toContain(focusedElement);
    });

    test('should have proper ARIA labels', async ({ page }) => {
      const addButton = page.locator('[data-testid="add-field-button"]');
      const ariaLabel = await addButton.getAttribute('aria-label');

      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toContain('Add');
    });
  });

  test.describe('Performance', () => {
    test('should handle 50+ fields efficiently', async ({ page }) => {
      // Create many fields via API or direct DB insertion
      // Then verify rendering performance

      // For this test, we'd typically use a performance API
      const startTime = Date.now();

      // Navigate to schema with many fields
      await page.goto(`${SCHEMA_CHAT_URL}?schema_id=large-schema`);
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      // Should load within reasonable time
      expect(loadTime).toBeLessThan(5000);

      // Verify all fields rendered
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBeGreaterThanOrEqual(50);
    });

    test('should render field list without lag', async ({ page }) => {
      // Create multiple fields rapidly
      for (let i = 0; i < 20; i++) {
        await page.locator('[data-testid="add-field-button"]').click();
        await page.locator('[data-testid="field-name-input"]').fill(`field_${i}`);
        await page.locator('[data-testid="save-field-button"]').click();
      }

      // Verify all rendered
      const fieldCount = await page.locator('[data-testid^="field-card-"]').count();
      expect(fieldCount).toBe(20);
    });
  });
});
