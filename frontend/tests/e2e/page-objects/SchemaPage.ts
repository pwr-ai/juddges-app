import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Schema Management & Extraction
 * Encapsulates selectors and actions for schema operations
 */
export class SchemaPage {
  readonly page: Page;

  // Schema list
  readonly createSchemaButton: Locator;
  readonly schemaItems: Locator;
  readonly emptyState: Locator;

  // Schema editor
  readonly schemaNameInput: Locator;
  readonly schemaDescriptionInput: Locator;
  readonly addFieldButton: Locator;
  readonly saveSchemaButton: Locator;

  // Field editor
  readonly fieldNameInput: Locator;
  readonly fieldTypeSelect: Locator;
  readonly fieldDescriptionInput: Locator;
  readonly fieldRequiredCheckbox: Locator;
  readonly saveFieldButton: Locator;
  readonly fieldItems: Locator;

  // Schema testing
  readonly testSchemaButton: Locator;
  readonly sampleTextArea: Locator;
  readonly runTestButton: Locator;
  readonly testResults: Locator;

  // Extraction
  readonly runExtractionButton: Locator;
  readonly selectDocumentDropdown: Locator;
  readonly startExtractionButton: Locator;
  readonly extractionStatus: Locator;
  readonly extractionResults: Locator;
  readonly exportButton: Locator;

  // AI generation
  readonly generateSchemaButton: Locator;
  readonly schemaPromptInput: Locator;
  readonly generateButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Schema list
    this.createSchemaButton = page.getByRole('button', { name: /create.*schema|new.*schema/i });
    this.schemaItems = page.getByTestId('schema-item');
    this.emptyState = page.locator('text=/no.*schemas|empty|create your first/i');

    // Schema editor
    this.schemaNameInput = page.getByLabel(/schema.*name|name/i);
    this.schemaDescriptionInput = page.getByLabel(/description/i);
    this.addFieldButton = page.getByRole('button', { name: /add.*field/i });
    this.saveSchemaButton = page.getByRole('button', { name: /save.*schema/i });

    // Field editor
    this.fieldNameInput = page.getByLabel(/field.*name/i);
    this.fieldTypeSelect = page.getByLabel(/field.*type|type/i);
    this.fieldDescriptionInput = page.getByLabel(/field.*description/i);
    this.fieldRequiredCheckbox = page.getByLabel(/required/i);
    this.saveFieldButton = page.getByRole('button', { name: /save.*field/i });
    this.fieldItems = page.getByTestId('field-item');

    // Schema testing
    this.testSchemaButton = page.getByRole('button', { name: /test.*schema/i });
    this.sampleTextArea = page.getByLabel(/sample.*text/i);
    this.runTestButton = page.getByRole('button', { name: /run.*test/i });
    this.testResults = page.getByTestId('test-results');

    // Extraction
    this.runExtractionButton = page.getByRole('button', { name: /run.*extraction|extract/i });
    this.selectDocumentDropdown = page.getByLabel(/select.*document|document/i);
    this.startExtractionButton = page.getByRole('button', { name: /start.*extraction|extract/i });
    this.extractionStatus = page.getByTestId('extraction-status');
    this.extractionResults = page.getByTestId('extraction-results');
    this.exportButton = page.getByRole('button', { name: /export/i });

    // AI generation
    this.generateSchemaButton = page.getByRole('button', { name: /generate.*schema|ai.*generate/i });
    this.schemaPromptInput = page.getByLabel(/prompt|describe/i);
    this.generateButton = page.getByRole('button', { name: /generate/i });
  }

  async goto() {
    await this.page.goto('/schemas');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async createSchema(name: string, description?: string) {
    await this.createSchemaButton.click();
    await this.schemaNameInput.fill(name);

    if (description) {
      await this.schemaDescriptionInput.fill(description);
    }
  }

  async addField(name: string, type: string, description?: string, required?: boolean) {
    await this.addFieldButton.click();
    await this.fieldNameInput.fill(name);
    await this.fieldTypeSelect.selectOption(type);

    if (description) {
      await this.fieldDescriptionInput.fill(description);
    }

    if (required) {
      await this.fieldRequiredCheckbox.check();
    }

    await this.saveFieldButton.click();
  }

  async saveSchema() {
    await this.saveSchemaButton.click();
  }

  async testSchema(sampleText: string) {
    await this.testSchemaButton.click();
    await this.sampleTextArea.fill(sampleText);
    await this.runTestButton.click();
  }

  async runExtraction(documentId?: string) {
    await this.runExtractionButton.click();

    if (documentId) {
      await this.selectDocumentDropdown.click();
      await this.page.getByRole('option').first().click();
    }

    await this.startExtractionButton.click();
  }

  async generateSchemaWithAI(prompt: string) {
    await this.generateSchemaButton.click();
    await this.schemaPromptInput.fill(prompt);
    await this.generateButton.click();
  }

  async exportResults(format: 'json' | 'csv' | 'xlsx') {
    await this.exportButton.click();
    await this.page.getByRole('menuitem', { name: new RegExp(format, 'i') }).click();
  }

  async getFieldCount(): Promise<number> {
    return await this.fieldItems.count();
  }

  async verifyTestResults() {
    await expect(this.testResults).toBeVisible();
  }

  async verifyExtractionComplete() {
    await expect(this.extractionStatus).toContainText(/complete|success/i);
  }
}
