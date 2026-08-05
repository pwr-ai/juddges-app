/**
 * @jest-environment node
 */

global.fetch = jest.fn();

import {
  loadPublicBlogPost,
} from '@/lib/blog/public-api';

const validPost = {
  id: 'post-1',
  slug: 'published-post',
  title: 'Published post',
  excerpt: 'Excerpt',
  content: '# Article',
  author: { id: 'author-1', name: 'Author', avatar: null, title: 'Researcher' },
  status: 'published',
  published_at: '2026-08-01T00:00:00Z',
  created_at: '2026-07-31T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  tags: ['AI'],
  category: 'Research',
  views: 1,
  likes_count: 0,
  related_posts: [],
};

describe('loadPublicBlogPost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_BASE_URL = 'http://backend.test';
    process.env.BACKEND_API_KEY = 'server-only-key';
  });

  it('returns a validated published post through the server-only boundary', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify(validPost), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(loadPublicBlogPost('published-post')).resolves.toEqual(validPost);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://backend.test/blog/posts/published-post',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it('returns null only for an explicit upstream 404', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Post not found' }), { status: 404 }),
    );

    await expect(loadPublicBlogPost('missing')).resolves.toBeNull();
  });

  it.each([500, 504])('throws an upstream error for status %s instead of returning null', async (status) => {
    (global.fetch as jest.Mock).mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Unavailable' }), { status }),
    );

    await expect(loadPublicBlogPost('unavailable')).rejects.toMatchObject({
      name: 'BlogPostUpstreamError',
      status,
    });
  });

  it.each([
    '{not-json',
    JSON.stringify({ ...validPost, status: 'draft' }),
    JSON.stringify({ ...validPost, related_posts: {} }),
  ])('rejects malformed or non-public successful payloads', async (body) => {
    (global.fetch as jest.Mock).mockResolvedValue(new Response(body, { status: 200 }));

    await expect(loadPublicBlogPost('published-post')).rejects.toThrow(
      'Blog service returned invalid post data',
    );
  });
});
