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
});
