import { renderHook, waitFor, act } from '@testing-library/react';

import { useSourceDocuments, MAX_SOURCE_CARDS } from '@/hooks/useSourceDocuments';

const okResponse = (documents: unknown[]) =>
  new Response(JSON.stringify({ documents }), { status: 200 });

describe('useSourceDocuments', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns found documents and a "not found" placeholder only for ids missing from a 200', async () => {
    global.fetch = jest.fn(async () =>
      okResponse([{ document_id: 'a1', title: 'A' }]),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useSourceDocuments({ documentIds: ['a1', 'a2'] }));

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.error).toBeNull();
    expect(result.current.data?.[0].title).toBe('A');
    expect(result.current.data?.[1]).toMatchObject({
      document_id: 'a2',
      document_type: 'error',
      summary: 'Document was not found!',
    });
  });

  it.each([429, 500, 503])('surfaces HTTP %i as an error without "not found" cards', async (status) => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'x' }), { status }),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() =>
      useSourceDocuments({ documentIds: [`b${status}-1`, `b${status}-2`] }),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('flags 401 with a sign-in message and status', async () => {
    global.fetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 }),
    ) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useSourceDocuments({ documentIds: ['c1'] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error & { status?: number }).status).toBe(401);
    expect(result.current.error?.message).toMatch(/sign in again/i);
    expect(result.current.data).toBeUndefined();
  });

  it('surfaces a thrown fetch as an error', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('network down');
    }) as unknown as typeof global.fetch;

    const { result } = renderHook(() => useSourceDocuments({ documentIds: ['d1'] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('does not cache failures: refetch retries and succeeds', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(okResponse([{ document_id: 'e1', title: 'E' }]));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { result } = renderHook(() => useSourceDocuments({ documentIds: ['e1'] }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => result.current.refetch());

    await waitFor(() => expect(result.current.data?.[0]?.title).toBe('E'));
    expect(result.current.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches successful responses', async () => {
    const fetchMock = jest.fn(async () => okResponse([{ document_id: 'f1', title: 'F' }]));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const first = renderHook(() => useSourceDocuments({ documentIds: ['f1'] }));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    const second = renderHook(() => useSourceDocuments({ documentIds: ['f1'] }));
    await waitFor(() => expect(second.result.current.data?.[0]?.title).toBe('F'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('requests at most MAX_SOURCE_CARDS ids and adds "more sources" placeholders', async () => {
    const ids = Array.from({ length: MAX_SOURCE_CARDS + 2 }, (_, i) => `g${i}`);
    const fetchMock = jest.fn(async () => okResponse([]));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { result } = renderHook(() => useSourceDocuments({ documentIds: ids }));
    await waitFor(() => expect(result.current.data).toBeDefined());

    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.document_ids).toHaveLength(MAX_SOURCE_CARDS);
    expect(result.current.data).toHaveLength(MAX_SOURCE_CARDS + 2);
    expect(result.current.data?.[MAX_SOURCE_CARDS].summary).toBe('+2 more sources available');
  });

  it('does not cache failures: a second mount fetches again', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 500 }))
      .mockResolvedValueOnce(okResponse([{ document_id: 'h1', title: 'H' }]));
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const first = renderHook(() => useSourceDocuments({ documentIds: ['h1'] }));
    await waitFor(() => expect(first.result.current.isError).toBe(true));
    first.unmount();

    const second = renderHook(() => useSourceDocuments({ documentIds: ['h1'] }));
    await waitFor(() => expect(second.result.current.data?.[0]?.title).toBe('H'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not set an error when unmounted during the fetch (abort)', async () => {
    global.fetch = jest.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
    ) as unknown as typeof global.fetch;

    const { result, unmount } = renderHook(() => useSourceDocuments({ documentIds: ['i1'] }));
    await waitFor(() => expect(result.current.isLoading).toBe(true));
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('clears a previous error when disabled', async () => {
    global.fetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof global.fetch;

    const { result, rerender } = renderHook(
      ({ enabled }) => useSourceDocuments({ documentIds: ['j1'], enabled }),
      { initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    rerender({ enabled: false });
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.isError).toBe(false);
  });
});
