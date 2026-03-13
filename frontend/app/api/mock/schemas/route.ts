import { NextResponse } from "next/server";

/**
 * GET /api/mock/schemas - Returns mocked extraction schemas
 */
export async function GET(): Promise<NextResponse> {
  const mockedSchemas = [
    {
      id: 'mock-schema-1',
      name: 'Judgment Metadata Schema',
      description: 'Schema for extracting structured metadata from appellate judgment documents',
      type: 'judgment',
      category: 'case-law',
      text: {
        type: 'object',
        properties: {
          document_type: { 
            type: 'string',
            description: 'The type of judgment or court decision being processed'
          },
          document_status: { 
            type: 'string',
            description: 'Current status of the document'
          },
          decision_date: { 
            type: 'string', 
            format: 'date',
            description: 'The date when the judgment was issued'
          },
          court_name: { 
            type: 'string',
            description: 'Court that issued the judgment'
          },
          legal_issue: { 
            type: 'string',
            description: 'Core legal issue addressed by the judgment'
          },
          holdings: {
            type: 'array',
            description: 'List of key holdings extracted from the judgment',
            items: {
              type: 'object',
              properties: {
                point_number: { type: 'number' },
                issue: { type: 'string' },
                holding: { type: 'string' }
              }
            }
          }
        },
        required: ['document_type', 'document_status', 'decision_date', 'court_name']
      },
      dates: {},
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
    }
  ];

  return NextResponse.json(mockedSchemas, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
