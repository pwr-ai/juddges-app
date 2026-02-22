import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Search Page
 * Encapsulates selectors and actions for the search interface
 */
export class SearchPage {
  readonly page: Page;

  // Main elements
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly backButton: Locator;

  // Language toggles
  readonly polishLanguageToggle: Locator;
  readonly ukLanguageToggle: Locator;

  // Results
  readonly resultsContainer: Locator;
  readonly resultItems: Locator;
  readonly resultsCount: Locator;

  // Filters
  readonly filterSidebar: Locator;
  readonly resetFiltersButton: Locator;

  // Empty states
  readonly emptyStateMessage: Locator;
  readonly errorMessage: Locator;

  // Example queries
  readonly exampleQueriesSection: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators using semantic selectors
    this.searchInput = page.getByRole('textbox', { name: /search/i });
    this.searchButton = page.getByRole('button', { name: /^search$/i });
    this.backButton = page.getByRole('button', { name: /back/i });

    // Language toggles - using text content
    this.polishLanguageToggle = page.locator('text=🇵🇱');
    this.ukLanguageToggle = page.locator('text=🇬🇧');

    // Results elements
    this.resultsContainer = page.locator('[data-search-results]');
    this.resultItems = page.getByTestId('search-result-item');
    this.resultsCount = page.locator('text=/Found|results/i');

    // Filters
    this.filterSidebar = page.locator('aside, .filter-sidebar');
    this.resetFiltersButton = page.getByRole('button', { name: /reset.*filter/i });

    // Empty states
    this.emptyStateMessage = page.locator('text=/no.*results|no.*found|empty/i');
    this.errorMessage = page.locator('text=/error|failed|something went wrong/i');

    // Example queries
    this.exampleQueriesSection = page.locator('.example-queries, [class*="example"]');
  }

  /**
   * Navigate to search page
   */
  async goto() {
    await this.page.goto('/search');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Perform a search with given query
   */
  async search(query: string, options?: { language?: 'pl' | 'uk'; waitForResults?: boolean }) {
    // Fill search query
    await this.searchInput.fill(query);

    // Select language if specified
    if (options?.language === 'pl') {
      await this.polishLanguageToggle.click();
    } else if (options?.language === 'uk') {
      await this.ukLanguageToggle.click();
    }

    // Click search button
    await this.searchButton.click();

    // Wait for results if requested
    if (options?.waitForResults !== false) {
      await this.waitForSearchResults();
    }
  }

  /**
   * Wait for search results to appear
   */
  async waitForSearchResults(timeout = 10000) {
    await expect(this.resultsCount).toBeVisible({ timeout });
  }

  /**
   * Get number of visible result items
   */
  async getResultCount(): Promise<number> {
    return await this.resultItems.count();
  }

  /**
   * Click on a result item by index
   */
  async clickResult(index: number) {
    await this.resultItems.nth(index).click();
  }

  /**
   * Verify search results are displayed
   */
  async verifyResultsDisplayed() {
    await expect(this.resultsContainer).toBeVisible();
    await expect(this.resultItems.first()).toBeVisible();
  }

  /**
   * Verify empty state is displayed
   */
  async verifyEmptyState() {
    await expect(this.emptyStateMessage).toBeVisible();
  }

  /**
   * Verify error state is displayed
   */
  async verifyErrorState() {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Click on an example query
   */
  async clickExampleQuery(text: string) {
    await this.page.locator(`text=${text}`).first().click();
  }

  /**
   * Apply a filter by name
   */
  async applyFilter(filterName: string) {
    const filterCheckbox = this.filterSidebar.getByRole('checkbox', { name: new RegExp(filterName, 'i') });
    await filterCheckbox.click();
  }

  /**
   * Reset all filters
   */
  async resetFilters() {
    await this.resetFiltersButton.click();
  }

  /**
   * Go back to search home
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Verify page is in expanded (pre-search) mode
   */
  async verifyExpandedMode() {
    await expect(this.page.locator('text=Search 3M+ legal documents')).toBeVisible();
    await expect(this.searchInput).toBeVisible();
  }

  /**
   * Verify page is in results mode
   */
  async verifyResultsMode() {
    await expect(this.resultsContainer).toBeVisible();
    await expect(this.backButton).toBeVisible();
  }
}
