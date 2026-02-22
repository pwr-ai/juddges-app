/**
 * Test Data Generators and Utilities
 *
 * Provides reusable functions for generating mock data in E2E tests
 */

export interface MockDocument {
  document_id: string;
  title: string;
  content: string;
  document_type: string;
  language: string;
  date: string;
  court_name?: string;
  case_number?: string;
  jurisdiction?: string;
  keywords?: string[];
}

export interface MockSearchResults {
  documents: MockDocument[];
  chunks: any[];
  question: string;
  total?: number;
  page?: number;
  per_page?: number;
}

export interface MockChatResponse {
  output: {
    text: string;
    document_ids: string[];
    sources?: Array<{
      id: string;
      title: string;
      snippet?: string;
    }>;
  };
  metadata: {
    run_id: string;
    chat_id?: string;
  };
}

/**
 * Generate a mock document with Polish legal content
 */
export function generatePolishDocument(id: string, overrides: Partial<MockDocument> = {}): MockDocument {
  return {
    document_id: id,
    title: `Wyrok Sądu Najwyższego w sprawie ${id}`,
    content: 'Sąd Najwyższy w składzie... Uzasadnienie: W wyniku rozpoznania kasacji...',
    document_type: 'judgment',
    language: 'pl',
    date: '2024-01-15',
    court_name: 'Sąd Najwyższy',
    case_number: `I CSK ${Math.floor(Math.random() * 1000)}/2024`,
    jurisdiction: 'PL',
    keywords: ['prawo cywilne', 'umowa', 'odpowiedzialność'],
    ...overrides
  };
}

/**
 * Generate a mock UK judgment document
 */
export function generateUKDocument(id: string, overrides: Partial<MockDocument> = {}): MockDocument {
  return {
    document_id: id,
    title: `[${new Date().getFullYear()}] EWHC ${Math.floor(Math.random() * 1000)} (Ch)`,
    content: 'THE HIGH COURT OF JUSTICE. CHANCERY DIVISION. Before: The Honourable Mr Justice...',
    document_type: 'judgment',
    language: 'en',
    date: '2024-01-15',
    court_name: 'High Court of Justice',
    case_number: `[2024] EWHC ${Math.floor(Math.random() * 1000)}`,
    jurisdiction: 'UK',
    keywords: ['contract law', 'breach', 'damages'],
    ...overrides
  };
}

/**
 * Generate mock search results
 */
export function generateSearchResults(
  count: number,
  options: {
    language?: 'pl' | 'en';
    query?: string;
    includePagination?: boolean;
  } = {}
): MockSearchResults {
  const { language = 'pl', query = 'test query', includePagination = false } = options;

  const documents = Array.from({ length: count }, (_, i) => {
    return language === 'pl'
      ? generatePolishDocument(`doc-${i}`)
      : generateUKDocument(`doc-${i}`);
  });

  const result: MockSearchResults = {
    documents,
    chunks: [],
    question: query
  };

  if (includePagination) {
    result.total = count * 5; // Simulate more results
    result.page = 1;
    result.per_page = count;
  }

  return result;
}

/**
 * Generate mock chat response
 */
export function generateChatResponse(
  text: string,
  options: {
    includeSources?: boolean;
    chatId?: string;
  } = {}
): MockChatResponse {
  const { includeSources = false, chatId } = options;

  const response: MockChatResponse = {
    output: {
      text,
      document_ids: includeSources ? ['doc-1', 'doc-2'] : []
    },
    metadata: {
      run_id: `run-${Date.now()}`,
      ...(chatId && { chat_id: chatId })
    }
  };

  if (includeSources) {
    response.output.sources = [
      {
        id: 'doc-1',
        title: 'Source Document 1',
        snippet: 'Relevant excerpt from document...'
      },
      {
        id: 'doc-2',
        title: 'Source Document 2',
        snippet: 'Another relevant passage...'
      }
    ];
  }

  return response;
}

/**
 * Generate mock collection
 */
export function generateCollection(id: string, documentCount: number = 0) {
  return {
    id,
    name: `Test Collection ${id}`,
    description: 'A test collection for E2E tests',
    document_count: documentCount,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

/**
 * Generate mock schema
 */
export function generateSchema(id: string, fieldCount: number = 3) {
  const fields = Array.from({ length: fieldCount }, (_, i) => ({
    name: `field_${i}`,
    type: ['string', 'number', 'date', 'array'][i % 4],
    description: `Description for field ${i}`,
    required: i === 0
  }));

  return {
    id,
    name: `Test Schema ${id}`,
    description: 'A test schema for extraction',
    fields,
    version: 1,
    created_at: new Date().toISOString()
  };
}

/**
 * Generate mock extraction results
 */
export function generateExtractionResults(schemaFields: string[]) {
  const results: Record<string, any> = {};

  schemaFields.forEach((field, i) => {
    switch (field) {
      case 'parties':
        results[field] = ['Party A', 'Party B'];
        break;
      case 'date':
      case 'contract_date':
        results[field] = '2024-01-15';
        break;
      case 'amount':
      case 'value':
        results[field] = '$10,000';
        break;
      case 'court_name':
        results[field] = 'Supreme Court';
        break;
      case 'case_number':
        results[field] = 'I CSK 123/2024';
        break;
      default:
        results[field] = `Value for ${field}`;
    }
  });

  return results;
}

/**
 * Generate large dataset for performance testing
 */
export function generateLargeDataset(size: number): MockSearchResults {
  const documents = Array.from({ length: size }, (_, i) => {
    const language = i % 2 === 0 ? 'pl' : 'en';
    return language === 'pl'
      ? generatePolishDocument(`large-doc-${i}`)
      : generateUKDocument(`large-doc-${i}`);
  });

  return {
    documents,
    chunks: [],
    question: 'performance test query',
    total: size,
    page: 1,
    per_page: 100
  };
}

/**
 * Delay helper for simulating API latency
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate random legal text in Polish
 */
export function generatePolishLegalText(paragraphs: number = 3): string {
  const templates = [
    'Sąd Najwyższy po rozpoznaniu kasacji od wyroku...',
    'W uzasadnieniu Sąd wskazał, że roszczenie jest uzasadnione...',
    'Powód wniósł o zasądzenie od pozwanego kwoty...',
    'Sąd uznał, że przedmiotowa umowa zawiera klauzule abuzywne...',
    'W ocenie Sądu, działanie pozwanego było sprzeczne z zasadami współżycia społecznego...'
  ];

  return Array.from({ length: paragraphs }, (_, i) =>
    templates[i % templates.length]
  ).join('\n\n');
}

/**
 * Generate random legal text in English
 */
export function generateEnglishLegalText(paragraphs: number = 3): string {
  const templates = [
    'The Court finds that the defendant breached the contract...',
    'In reaching this conclusion, the Court considered the following factors...',
    'The plaintiff seeks damages in the amount of...',
    'This Court has jurisdiction pursuant to...',
    'The defendant argues that the claim is time-barred, however...'
  ];

  return Array.from({ length: paragraphs }, (_, i) =>
    templates[i % templates.length]
  ).join('\n\n');
}
