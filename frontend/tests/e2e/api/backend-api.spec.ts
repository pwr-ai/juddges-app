import { test, expect } from '@playwright/test';

test.describe('Backend API Integration', () => {
  const API_BASE = process.env.API_BASE_URL || 'http://localhost:8004';
  const API_KEY = process.env.BACKEND_API_KEY || '1234567890';

  test.beforeEach(async () => {
    // Set base API configuration
    test.setTimeout(30000); // 30 second timeout for API tests
  });

  test.describe('Chat API', () => {
    test('should handle chat API correctly', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          input: {
            question: "What are Swiss franc loan regulations in Poland? ",
            max_documents: 5,
            score_threshold: 0.5,
            chat_history: []
          },
          config: {},
          kwargs: {}
        }
      });

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('output');
      expect(data.output).toHaveProperty('text');
      expect(typeof data.output.text).toBe('string');
      expect(data.output.text.length).toBeGreaterThan(0);

      // Verify metadata
      if (data.metadata) {
        expect(data.metadata).toHaveProperty('run_id');
      }
    });

    test('should handle chat with history', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          input: {
            question: "Can you elaborate on the previous ruling? ",
            max_documents: 3,
            score_threshold: 0.6,
            chat_history: [
              {
                role: "user",
                content: "What are Swiss franc loan regulations? "
              },
              {
                role: "assistant",
                content: "Swiss franc loans are regulated under consumer protection laws..."
              }
            ]
          },
          config: {},
          kwargs: {}
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.output.text).toBeDefined();
    });

    test('should handle invalid chat requests', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          input: {
            // Missing required question field
            max_documents: 5
          }
        }
      });

      // Should return an error for invalid request
      expect([400, 422, 500]).toContain(response.status());
    });

    test('should reject unauthorized chat requests', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key'
        },
        data: {
          input: {
            question: "Test question",
            max_documents: 5
          }
        }
      });

      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('Search API', () => {
    test('should handle document search correctly', async ({ request }) => {
      const response = await request.post(`${API_BASE}/documents/search`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          query: "Swiss franc loans consumer protection",
          max_documents: 10,
          languages: ["pl"],
          mode: "rabbit"
        }
      });

      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data).toHaveProperty('documents');
      expect(data).toHaveProperty('chunks');
      expect(data).toHaveProperty('question');

      expect(Array.isArray(data.documents)).toBeTruthy();
      expect(Array.isArray(data.chunks)).toBeTruthy();
      expect(typeof data.question).toBe('string');

      // Verify document structure if documents exist
      if (data.documents.length > 0) {
        const doc = data.documents[0];
        expect(doc).toHaveProperty('document_id');
        expect(doc).toHaveProperty('title');
        expect(doc).toHaveProperty('document_type');
      }
    });

    test('should handle search with different parameters', async ({ request }) => {
      const response = await request.post(`${API_BASE}/documents/search`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          query: "copyright infringement legal precedent",
          max_documents: 5,
          languages: ["pl", "uk"],
          mode: "thinking"
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.documents).toBeDefined();
      expect(data.chunks).toBeDefined();
    });

    test('should handle empty search query', async ({ request }) => {
      const response = await request.post(`${API_BASE}/documents/search`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          query: "",
          max_documents: 10
        }
      });

      // Should handle empty query gracefully
      expect([200, 400, 422]).toContain(response.status());
    });

    test('should reject unauthorized search requests', async ({ request }) => {
      const response = await request.post(`${API_BASE}/documents/search`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'invalid-key'
        },
        data: {
          query: "test query",
          max_documents: 5
        }
      });

      expect([401, 403]).toContain(response.status());
    });
  });

  test.describe('Collections API', () => {
    let createdCollectionId: string;

    test('should list collections', async ({ request }) => {
      const response = await request.get(`${API_BASE}/collections`, {
        headers: {
          'X-API-Key': API_KEY
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(Array.isArray(data)).toBeTruthy();
    });

    test('should create a collection', async ({ request }) => {
      const response = await request.post(`${API_BASE}/collections`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: {
          name: "Test Collection E2E",
          description: "Created via E2E test"
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe("Test Collection E2E");

      createdCollectionId = data.id;
    });

    test('should get collection details', async ({ request }) => {
      // First create a collection if we don't have one
      if (!createdCollectionId) {
        const createResponse = await request.post(`${API_BASE}/collections`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
          },
          data: {
            name: "Test Collection for Get",
            description: "For testing get endpoint"
          }
        });
        const createData = await createResponse.json();
        createdCollectionId = createData.id;
      }

      const response = await request.get(`${API_BASE}/collections/${createdCollectionId}`, {
        headers: {
          'X-API-Key': API_KEY
        }
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.id).toBe(createdCollectionId);
    });

    test('should handle non-existent collection', async ({ request }) => {
      const response = await request.get(`${API_BASE}/collections/non-existent-id`, {
        headers: {
          'X-API-Key': API_KEY
        }
      });

      expect(response.status()).toBe(404);
    });

    test.afterAll('cleanup created collection', async ({ request }) => {
      if (createdCollectionId) {
        await request.delete(`${API_BASE}/collections/${createdCollectionId}`, {
          headers: {
            'X-API-Key': API_KEY
          }
        });
      }
    });
  });

  test.describe('Health Check', () => {
    test('should respond to health check', async ({ request }) => {
      const response = await request.get(`${API_BASE}/`);

      // Health check should be accessible without API key
      expect(response.ok()).toBeTruthy();
    });

    test('should respond to docs endpoint', async ({ request }) => {
      const response = await request.get(`${API_BASE}/docs`);

      // API docs should be accessible
      expect([200, 302]).toContain(response.status());
    });
  });

  test.describe('Error Handling', () => {
    test('should handle malformed JSON', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        },
        data: "invalid json"
      });

      expect([400, 422]).toContain(response.status());
    });

    test('should handle missing content-type', async ({ request }) => {
      const response = await request.post(`${API_BASE}/chat/invoke`, {
        headers: {
          'X-API-Key': API_KEY
        },
        data: JSON.stringify({
          input: { question: "test" }
        })
      });

      // Should either work (if server is lenient) or return 400/415
      expect([200, 400, 415, 422]).toContain(response.status());
    });
  });
});
