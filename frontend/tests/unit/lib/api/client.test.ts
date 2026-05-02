import { apiClient, ApiError } from '@/lib/api/client'

describe('apiClient', () => {
  beforeEach(() => {
    // Mock fetch on a per-test basis. Each test that needs a manual fetch mock
    // sets it up inline; we keep beforeEach light so other describe blocks
    // (e.g. MSW-based tests below) are not forced to override the mock.
    global.fetch = jest.fn()
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
