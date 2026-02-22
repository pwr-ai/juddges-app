import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Collections Management
 * Encapsulates selectors and actions for collection operations
 */
export class CollectionPage {
  readonly page: Page;

  // Main elements
  readonly createCollectionButton: Locator;
  readonly collectionNameInput: Locator;
  readonly collectionDescriptionInput: Locator;
  readonly saveCollectionButton: Locator;

  // Collection list
  readonly collectionsContainer: Locator;
  readonly collectionItems: Locator;
  readonly emptyState: Locator;

  // Collection details
  readonly collectionTitle: Locator;
  readonly addDocumentButton: Locator;
  readonly shareButton: Locator;
  readonly deleteButton: Locator;
  readonly renameButton: Locator;

  // Documents in collection
  readonly documentList: Locator;
  readonly documentItems: Locator;
  readonly removeDocumentButton: Locator;

  // Dialogs
  readonly confirmDialog: Locator;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.createCollectionButton = page.getByRole('button', { name: /create.*collection|new.*collection/i });
    this.collectionNameInput = page.getByLabel(/name|title/i);
    this.collectionDescriptionInput = page.getByLabel(/description/i);
    this.saveCollectionButton = page.getByRole('button', { name: /save|create/i });

    // Collection list
    this.collectionsContainer = page.getByTestId('collections-container');
    this.collectionItems = page.getByTestId('collection-item');
    this.emptyState = page.locator('text=/no.*collections|empty|create your first/i');

    // Collection details
    this.collectionTitle = page.getByRole('heading', { level: 1 });
    this.addDocumentButton = page.getByRole('button', { name: /add.*document/i });
    this.shareButton = page.getByRole('button', { name: /share/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.renameButton = page.getByRole('button', { name: /rename|edit/i });

    // Documents
    this.documentList = page.getByTestId('collection-documents');
    this.documentItems = page.getByTestId('document-item');
    this.removeDocumentButton = page.getByRole('button', { name: /remove/i });

    // Dialogs
    this.confirmDialog = page.getByRole('dialog');
    this.confirmButton = page.getByRole('button', { name: /confirm|yes|delete/i });
    this.cancelButton = page.getByRole('button', { name: /cancel|no/i });
  }

  async goto() {
    await this.page.goto('/collections');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async createCollection(name: string, description?: string) {
    await this.createCollectionButton.click();
    await this.collectionNameInput.fill(name);

    if (description) {
      await this.collectionDescriptionInput.fill(description);
    }

    await this.saveCollectionButton.click();
  }

  async openCollection(name: string) {
    await this.page.getByText(name).click();
  }

  async getCollectionCount(): Promise<number> {
    return await this.collectionItems.count();
  }

  async getDocumentCount(): Promise<number> {
    return await this.documentItems.count();
  }

  async addDocumentToCollection(documentId: string) {
    await this.addDocumentButton.click();
    await this.page.getByTestId(`document-${documentId}`).click();
  }

  async removeDocumentFromCollection(index: number) {
    await this.documentItems.nth(index).hover();
    await this.removeDocumentButton.first().click();
  }

  async renameCollection(newName: string) {
    await this.renameButton.click();
    await this.collectionNameInput.clear();
    await this.collectionNameInput.fill(newName);
    await this.saveCollectionButton.click();
  }

  async deleteCollection() {
    await this.deleteButton.click();
    await this.confirmButton.click();
  }

  async shareCollection() {
    await this.shareButton.click();
  }

  async verifyCollectionCreated(name: string) {
    await expect(this.page.getByText(name)).toBeVisible();
  }

  async verifyEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }
}
