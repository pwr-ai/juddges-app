import { getPublications } from '@/lib/api/publications';
import {
  PublicationProject,
  PublicationStatus,
  PublicationType,
} from '@/types/publication';

describe('publications API contract', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('serializes the project using the canonical FastAPI enum value', () => {
    expect(PublicationProject.JUDDGES).toBe('JuDDGES');
  });

  it('builds an exact filtered request accepted by the FastAPI route', async () => {
    global.fetch = jest.fn(async () =>
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof global.fetch;

    await getPublications({
      project: PublicationProject.JUDDGES,
      year: 2026,
      status: PublicationStatus.PUBLISHED,
      type: PublicationType.JOURNAL,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/publications?project=JuDDGES&year=2026&status=published&type=journal',
      {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      },
    );
  });

  it('normalizes the FastAPI list response for frontend consumers', async () => {
    const backendPublication = {
      id: 'publication-1',
      title: 'Interpretable judicial search',
      authors: [
        {
          name: 'Ada Lovelace',
          affiliation: 'JuDDGES Lab',
          url: 'https://example.com/ada',
        },
      ],
      venue: 'Journal of Legal AI',
      venue_short: 'JLAI',
      year: 2026,
      month: 7,
      abstract: 'A publication backed by the FastAPI contract.',
      project: 'JuDDGES',
      type: 'journal',
      status: 'published',
      links: { pdf: 'https://example.com/paper.pdf' },
      tags: ['search'],
      citations: 12,
      manuscript_number: 'JLAI-2026-42',
      acceptance_date: '2026-05-10',
      publication_date: '2026-07-01',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-07-01T12:00:00Z',
      schemas: [
        {
          schema_id: 'schema-1',
          description: 'Case metadata',
          created_at: '2026-04-02T10:00:00Z',
        },
      ],
      collections: [
        {
          collection_id: 'collection-1',
          description: 'Evaluation corpus',
          created_at: '2026-04-03T10:00:00Z',
        },
      ],
      extraction_jobs: [
        {
          job_id: 'job-1',
          job_status: 'completed',
          description: 'Published extraction',
          created_at: '2026-04-04T10:00:00Z',
        },
      ],
    };
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify([backendPublication]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof global.fetch;

    await expect(getPublications()).resolves.toEqual([
      {
        id: 'publication-1',
        title: 'Interpretable judicial search',
        authors: [
          {
            name: 'Ada Lovelace',
            affiliation: 'JuDDGES Lab',
            url: 'https://example.com/ada',
          },
        ],
        venue: 'Journal of Legal AI',
        venueShort: 'JLAI',
        year: 2026,
        month: 7,
        abstract: 'A publication backed by the FastAPI contract.',
        project: PublicationProject.JUDDGES,
        type: PublicationType.JOURNAL,
        status: PublicationStatus.PUBLISHED,
        links: { pdf: 'https://example.com/paper.pdf' },
        tags: ['search'],
        citations: 12,
        manuscriptNumber: 'JLAI-2026-42',
        acceptanceDate: '2026-05-10',
        publicationDate: '2026-07-01',
        createdAt: '2026-04-01T10:00:00Z',
        updatedAt: '2026-07-01T12:00:00Z',
        schemas: [
          {
            schemaId: 'schema-1',
            description: 'Case metadata',
            createdAt: '2026-04-02T10:00:00Z',
          },
        ],
        collections: [
          {
            collectionId: 'collection-1',
            description: 'Evaluation corpus',
            createdAt: '2026-04-03T10:00:00Z',
          },
        ],
        extractionJobs: [
          {
            jobId: 'job-1',
            jobStatus: 'completed',
            description: 'Published extraction',
            createdAt: '2026-04-04T10:00:00Z',
          },
        ],
      },
    ]);
  });
});
