import { Page, Route } from '@playwright/test';

/**
 * API mocking helpers for E2E tests
 * Provides reusable mock responses for common API calls
 */

export interface MockDocument {
  document_id: string;
  title: string;
  content: string;
  document_type: 'judgment';
  language?: string;
  date?: string;
  court_name?: string;
  case_number?: string;
  jurisdiction?: string;
  keywords?: string[];
}

export interface MockSearchResponse {
  documents: MockDocument[];
  chunks?: Array<{
    document_id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  question: string;
  total?: number;
}

export interface MockChatResponse {
  output: {
    text: string;
    document_ids?: string[];
    sources?: Array<{ id: string; title: string }>;
  };
  metadata: {
    run_id: string;
    chat_id?: string;
  };
}

/**
 * Mock successful search response
 */
export async function mockSearchSuccess(page: Page, response: MockSearchResponse) {
  await page.route('**/api/documents/search', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/**
 * Mock search with multiple result pages
 */
export async function mockSearchPaginated(page: Page, allDocuments: MockDocument[], pageSize = 10) {
  await page.route('**/api/documents/search', async route => {
    const url = new URL(route.request().url());
    const page_num = parseInt(url.searchParams.get('page') || '1');
    const size = parseInt(url.searchParams.get('size') || pageSize.toString());

    const start = (page_num - 1) * size;
    const end = start + size;
    const pageDocuments = allDocuments.slice(start, end);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: pageDocuments,
        chunks: [],
        question: 'test query',
        total: allDocuments.length,
        page: page_num,
        page_size: size
      })
    });
  });
}

/**
 * Mock search error
 */
export async function mockSearchError(page: Page, errorMessage = 'Search service unavailable') {
  await page.route('**/api/documents/search', route => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: errorMessage })
    });
  });
}

/**
 * Mock empty search results
 */
export async function mockSearchEmpty(page: Page, query = 'no results') {
  await page.route('**/api/documents/search', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [],
        chunks: [],
        question: query,
        total: 0
      })
    });
  });
}

/**
 * Mock successful chat response
 */
export async function mockChatSuccess(page: Page, response: MockChatResponse) {
  await page.route('**/api/chat/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/**
 * Mock chat with dynamic responses
 */
export async function mockChatDynamic(page: Page, responseGenerator: (question: string, messageCount: number) => MockChatResponse) {
  let messageCount = 0;

  await page.route('**/api/chat/**', async route => {
    const request = route.request();
    const body = await request.postDataJSON();
    messageCount++;

    const question = body.input?.question || body.question || 'question';
    const response = responseGenerator(question, messageCount);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/**
 * Mock chat error
 */
export async function mockChatError(page: Page, errorMessage = 'AI service unavailable') {
  await page.route('**/api/chat/**', route => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: errorMessage })
    });
  });
}

/**
 * Mock document details
 */
export async function mockDocumentDetails(page: Page, documentId: string, document: MockDocument & { metadata?: Record<string, unknown> }) {
  await page.route(`**/api/documents/${documentId}`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(document)
    });
  });
}

/**
 * Mock similar documents
 */
export async function mockSimilarDocuments(page: Page, documentId: string, similarDocs: MockDocument[]) {
  await page.route(`**/api/documents/${documentId}/similar`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        similar_documents: similarDocs.map(doc => ({
          ...doc,
          similarity_score: 0.9
        }))
      })
    });
  });
}

/**
 * Mock chat history
 */
export async function mockChatHistory(page: Page, chats: Array<{ id: string; title: string; firstMessage: string; created_at: string }>) {
  await page.route('**/api/chats/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(chats)
    });
  });
}

/**
 * Create sample judgment documents for testing
 */
export function createMockJudgments(count: number): MockDocument[] {
  return Array.from({ length: count }, (_, i) => ({
    document_id: `judgment-${i + 1}`,
    title: `Legal Judgment Case ${i + 1}`,
    content: `This is the content of legal judgment ${i + 1}. It contains detailed analysis of the case...`,
    document_type: 'judgment' as const,
    language: i % 2 === 0 ? 'pl' : 'en',
    date: `2023-${String(i % 12 + 1).padStart(2, '0')}-15`,
    court_name: i % 2 === 0 ? 'Supreme Court' : 'Court of Appeal',
    case_number: `I CSK ${100 + i}/2023`,
    jurisdiction: i % 2 === 0 ? 'PL' : 'UK',
    keywords: ['legal', 'judgment', `case-${i + 1}`]
  }));
}

/**
 * Wait for API call and verify request
 */
export async function waitForApiCall(page: Page, urlPattern: string): Promise<Route> {
  return await page.waitForRequest(request => {
    return request.url().includes(urlPattern);
  }).then(request => request as unknown as Route);
}
