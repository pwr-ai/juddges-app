import { http, HttpResponse } from 'msw'

import { apiClient, ApiError } from '@/lib/api/client'

import { server, setupMsw } from '../../../__mocks__/server'

// The manual-mock describe block below temporarily replaces `global.fetch`
// with a `jest.fn()` so that we can assert call arguments. Each test saves
// and restores the previous fetch so the MSW describe block keeps its
// interception working.

describe('apiClient (manual fetch mocks)', () => {
  let previousFetch: typeof fetch

  beforeEach(() => {
    previousFetch = global.fetch
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = previousFetch
  })

  it('returns parsed JSON on 200', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'ok' }),
    })
    const result = await apiClient.get('/api/health')
    expect(result).toEqual({ data: 'ok' })
  })

  it('throws ApiError with status on 4xx', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'not found' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'not found' }),
      })
    await expect(apiClient.get('/api/missing')).rejects.toThrow(ApiError)
    await expect(apiClient.get('/api/missing')).rejects.toMatchObject({ status: 404 })
  })

  it('passes JSON body on POST', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1 }),
    })
    await apiClient.post('/api/things', { name: 'x' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/things',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: 'x' }),
      }),
    )
  })

  it('includes API key header when configured', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
    await apiClient.get('/api/private', { apiKey: 'secret' })
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/private',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
      }),
    )
  })
})

describe('apiClient with MSW', () => {
  // Opt-in to MSW interception for this suite. `setupMsw` calls
  // `server.listen()` in beforeAll and tears it down (restoring the previous
  // `global.fetch`) in afterAll.
  setupMsw()

  it('hits a handler-served endpoint', async () => {
    server.use(
      http.get('http://localhost/api/example', () =>
        HttpResponse.json({ message: 'hi' }),
      ),
    )

    const res = await apiClient.get<{ message: string }>('http://localhost/api/example')
    expect(res).toEqual({ message: 'hi' })
  })
})
