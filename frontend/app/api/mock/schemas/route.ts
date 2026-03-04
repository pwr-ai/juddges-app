import { NextResponse } from "next/server";

/**
 * GET /api/mock/schemas - Returns mocked extraction schemas
 */
export async function GET(): Promise<NextResponse> {
  const mockedSchemas = [
    {
      id: 'mock-schema-1',
      name: 'IP Box Interpretation Schema',
      description: 'Schema for extracting data from IP Box tax interpretation documents',
      type: 'tax_interpretation',
      category: 'tax',
      text: {
        type: 'object',
        properties: {
          document_type: { 
            type: 'string',
            description: 'The type of tax document or interpretation being processed'
          },
          document_status: { 
            type: 'string',
            description: 'Current status of the document'
          },
          application_date: { 
            type: 'string', 
            format: 'date',
            description: 'The date when the tax application was submitted'
          },
          tax_type: { 
            type: 'string',
            description: 'Category of tax being addressed'
          },
          relief_type: { 
            type: 'string',
            description: 'Type of tax relief or benefit being applied for'
          },
          legal_questions: {
            type: 'array',
            description: 'List of legal questions addressed in the tax interpretation',
            items: {
              type: 'object',
              properties: {
                question_number: { type: 'number' },
                question: { type: 'string' },
                answer: { type: 'string' }
              }
            }
          }
        },
        required: ['document_type', 'document_status', 'application_date', 'tax_type']
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
