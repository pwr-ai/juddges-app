import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Document Detail Page
 * Encapsulates selectors and actions for viewing document details
 */
export class DocumentPage {
  readonly page: Page;

  // Main elements
  readonly documentTitle: Locator;
  readonly documentContent: Locator;
  readonly documentMetadata: Locator;

  // Tabs
  readonly detailsTab: Locator;
  readonly similarTab: Locator;

  // Similar documents
  readonly similarDocuments: Locator;

  // Actions
  readonly backButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators
    this.documentTitle = page.getByRole('heading', { level: 1 });
    this.documentContent = page.locator('[data-testid="document-content"]').or(
      page.locator('.document-content')
    );
    this.documentMetadata = page.locator('[data-testid="document-metadata"]');

    // Tabs
    this.detailsTab = page.getByRole('tab', { name: /details/i });
    this.similarTab = page.getByRole('tab', { name: /similar/i });

    // Similar documents
    this.similarDocuments = page.getByTestId('similar-document');

    // Actions
    this.backButton = page.getByRole('button', { name: /back/i });
    this.saveButton = page.getByRole('button', { name: /save/i });
  }

  /**
   * Verify document page is displayed
   */
  async verifyDocumentPageDisplayed() {
    await expect(this.page).toHaveURL(/\/documents\//);
    await expect(this.documentTitle).toBeVisible();
  }

  /**
   * Verify document has title
   */
  async verifyDocumentTitle(titleText?: string) {
    if (titleText) {
      await expect(this.documentTitle).toContainText(titleText);
    } else {
      await expect(this.documentTitle).toBeVisible();
    }
  }

  /**
   * Switch to similar documents tab
   */
  async switchToSimilarTab() {
    await this.similarTab.click();
  }

  /**
   * Verify similar documents are displayed
   */
  async verifySimilarDocumentsDisplayed() {
    await expect(this.similarDocuments.first()).toBeVisible();
    const count = await this.similarDocuments.count();
    expect(count).toBeGreaterThan(0);
  }

  /**
   * Go back to previous page
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Save document
   */
  async saveDocument() {
    await this.saveButton.click();
  }

  /**
   * Click on a similar document
   */
  async clickSimilarDocument(index: number) {
    await this.similarDocuments.nth(index).click();
  }

  /**
   * Verify metadata is displayed
   */
  async verifyMetadataDisplayed() {
    await expect(this.documentMetadata).toBeVisible();
  }
}
