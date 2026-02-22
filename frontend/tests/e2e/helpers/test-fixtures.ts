import { test as base, Page } from '@playwright/test';
import { SearchPage } from '../page-objects/SearchPage';
import { ChatPage } from '../page-objects/ChatPage';
import { DocumentPage } from '../page-objects/DocumentPage';
import { AuthPage } from '../page-objects/AuthPage';
import { setupMockAuth } from './auth-helpers';

/**
 * Custom test fixtures for Juddges E2E tests
 * Provides pre-configured page objects and common setup
 */

type JuddgesFixtures = {
  searchPage: SearchPage;
  chatPage: ChatPage;
  documentPage: DocumentPage;
  authPage: AuthPage;
  authenticatedPage: Page;
};

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<JuddgesFixtures>({
  // Search page object
  searchPage: async ({ page }, use) => {
    const searchPage = new SearchPage(page);
    await use(searchPage);
  },

  // Chat page object
  chatPage: async ({ page }, use) => {
    const chatPage = new ChatPage(page);
    await use(chatPage);
  },

  // Document page object
  documentPage: async ({ page }, use) => {
    const documentPage = new DocumentPage(page);
    await use(documentPage);
  },

  // Auth page object
  authPage: async ({ page }, use) => {
    const authPage = new AuthPage(page);
    await use(authPage);
  },

  // Authenticated page - page with mock auth already set up
  authenticatedPage: async ({ page }, use) => {
    await setupMockAuth(page);
    await use(page);
  }
});

export { expect } from '@playwright/test';
