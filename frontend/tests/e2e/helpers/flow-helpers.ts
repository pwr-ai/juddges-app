/**
 * Flow Helpers for Critical E2E Tests
 *
 * Provides centralized mock setup, test data, and step assertions
 * for the critical user flow: login -> search -> view document -> chat.
 */

import { Page, expect } from '@playwright/test';

// ─── Consistent test data for the critical flow ──────────────────────────────

export const CRITICAL_FLOW_TEST_DATA = {
  user: {
    id: 'critical-flow-user-001',
    email: 'critical-flow@example.com',
    password: 'TestPassword123!',
    name: 'Critical Flow Test User',
  },

  search: {
    query: 'consumer protection Swiss franc mortgage',
    resultCount: 3,
  },

  document: {
    document_id: 'crit-doc-001',
    title: 'Consumer Protection in Swiss Franc Mortgages',
    content:
      'The Supreme Court held that conversion clauses in Swiss franc denominated mortgage contracts constitute unfair contractual terms under EU Directive 93/13/EEC on unfair terms in consumer contracts. The borrower is entitled to restitution of overpaid amounts.',
    document_type: 'judgment' as const,
    language: 'pl',
    date: '2024-03-10',
    court_name: 'Supreme Court of Poland',
    case_number: 'I CSK 542/2024',
    jurisdiction: 'PL',
    keywords: ['consumer protection', 'Swiss franc', 'mortgage', 'unfair terms'],
  },

  chat: {
    userMessage: 'What are the key rulings on Swiss franc mortgage consumer protection?',
    assistantResponse:
      'Based on recent Supreme Court rulings, conversion clauses in Swiss franc mortgages have been consistently held to be unfair contractual terms under EU Directive 93/13/EEC. Key findings include: (1) borrowers are entitled to full restitution, (2) banks cannot substitute voided clauses with statutory provisions, and (3) the contract may be declared void in its entirety if the unfair terms cannot be severed.',
    runId: 'crit-flow-run-001',
  },
} as const;

// Pre-built mock responses derived from test data
const MOCK_SEARCH_RESPONSE = {
  documents: [
    {
      document_id: CRITICAL_FLOW_TEST_DATA.document.document_id,
      title: CRITICAL_FLOW_TEST_DATA.document.title,
      content: CRITICAL_FLOW_TEST_DATA.document.content,
      document_type: CRITICAL_FLOW_TEST_DATA.document.document_type,
      language: CRITICAL_FLOW_TEST_DATA.document.language,
      date: CRITICAL_FLOW_TEST_DATA.document.date,
      court_name: CRITICAL_FLOW_TEST_DATA.document.court_name,
      case_number: CRITICAL_FLOW_TEST_DATA.document.case_number,
    },
    {
      document_id: 'crit-doc-002',
      title: 'Mortgage Lending Practices Review',
      content: 'Analysis of lending practices in foreign currency denominated loans...',
      document_type: 'judgment',
      language: 'pl',
      date: '2024-02-20',
      court_name: 'Court of Appeal Warsaw',
      case_number: 'VI ACa 312/2024',
    },
    {
      document_id: 'crit-doc-003',
      title: 'EU Consumer Credit Directive Application',
      content: 'The court examined the application of EU consumer credit directive...',
      document_type: 'judgment',
      language: 'en',
      date: '2024-01-15',
      court_name: 'High Court of Justice',
      case_number: '[2024] EWHC 105',
    },
  ],
  chunks: [
    {
      document_id: CRITICAL_FLOW_TEST_DATA.document.document_id,
      content: 'Conversion clauses constitute unfair contractual terms...',
      score: 0.96,
      metadata: {},
    },
  ],
  question: CRITICAL_FLOW_TEST_DATA.search.query,
  total: 3,
};

const MOCK_DOCUMENT_RESPONSE = {
  id: CRITICAL_FLOW_TEST_DATA.document.document_id,
  ...CRITICAL_FLOW_TEST_DATA.document,
};

const MOCK_CHAT_RESPONSE = {
  output: {
    text: CRITICAL_FLOW_TEST_DATA.chat.assistantResponse,
    document_ids: [CRITICAL_FLOW_TEST_DATA.document.document_id],
  },
  metadata: {
    run_id: CRITICAL_FLOW_TEST_DATA.chat.runId,
  },
};

// ─── Mock setup ──────────────────────────────────────────────────────────────

/**
 * Register all route mocks needed for the critical flow.
 * Must be called before navigating to any page.
 */
export async function setupCriticalFlowMocks(page: Page): Promise<void> {
  // Mock Supabase auth — inject a mock client for authenticated state
  await page.addInitScript((userData) => {
    const mockUser = {
      id: userData.id,
      email: userData.email,
      user_metadata: { name: userData.name },
      created_at: new Date().toISOString(),
    };

    // window extension for test mocking
    window.mockSupabaseClient = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: mockUser }, error: null }),
        getSession: () =>
          Promise.resolve({
            data: {
              session: {
                user: mockUser,
                access_token: 'mock-critical-flow-token',
                refresh_token: 'mock-refresh-token',
                expires_at: Date.now() + 3600000,
              },
            },
            error: null,
          }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
      },
    };
  }, CRITICAL_FLOW_TEST_DATA.user);

  // Mock Supabase token endpoint for login form submission
  await page.route('**/auth/v1/token**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-critical-flow-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: CRITICAL_FLOW_TEST_DATA.user.id,
          email: CRITICAL_FLOW_TEST_DATA.user.email,
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  // Mock search API
  await page.route('**/api/documents/search', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESPONSE),
    });
  });

  // Mock document detail API for the primary document
  await page.route(
    `**/api/documents/${CRITICAL_FLOW_TEST_DATA.document.document_id}`,
    (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_DOCUMENT_RESPONSE),
      });
    }
  );

  // Mock chat API
  await page.route('**/api/chat/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_CHAT_RESPONSE),
    });
  });

  // Mock chat history (empty for fresh user)
  await page.route('**/api/chats/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

// ─── Step assertions ─────────────────────────────────────────────────────────

export type FlowStep = 'login' | 'search' | 'document' | 'chat';

/**
 * Assert that the user is at the expected step of the critical flow.
 * Provides clear error messages indicating which journey step failed.
 */
export async function assertUserAtStep(page: Page, step: FlowStep): Promise<void> {
  switch (step) {
    case 'login':
      await expect(page, 'Step [login]: expected URL to contain /auth/login').toHaveURL(
        /\/auth\/login/
      );
      break;

    case 'search':
      await expect(page, 'Step [search]: expected URL to contain /search').toHaveURL(/\/search/);
      await expect(
        page.getByRole('textbox', { name: /search/i }),
        'Step [search]: search input should be visible and ready'
      ).toBeVisible();
      break;

    case 'document':
      await expect(page, 'Step [document]: expected URL to contain /documents/').toHaveURL(
        /\/documents\//
      );
      await expect(
        page.getByRole('heading', { level: 1 }),
        'Step [document]: document title heading should be visible'
      ).toBeVisible();
      break;

    case 'chat':
      await expect(page, 'Step [chat]: expected URL to contain /chat').toHaveURL(/\/chat/);
      await expect(
        page
          .getByRole('textbox', { name: /message|question|chat/i })
          .or(page.locator('textarea[placeholder*="message"], textarea[placeholder*="question"]')),
        'Step [chat]: chat input should be visible and ready'
      ).toBeVisible();
      break;
  }
}
