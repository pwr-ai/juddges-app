/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockNotFound = jest.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const mockLoadPublicBlogPost = jest.fn();

jest.mock('next/navigation', () => ({ notFound: () => mockNotFound() }));
jest.mock('@/lib/blog/public-api', () => ({
  loadPublicBlogPost: (...args: unknown[]) => mockLoadPublicBlogPost(...args),
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={props.alt ?? ''} {...props} />
  ),
}));
jest.mock('@/components/blog/blog-post-card', () => ({
  BlogPostCard: ({ post }: { post: { title: string; slug: string } }) => (
    <a href={`/blog/${post.slug}`}>{post.title}</a>
  ),
}));

import BlogPostPage, { generateMetadata } from '@/app/blog/[slug]/page';

const publishedPost = {
  id: 'post-1',
  slug: 'first-post',
  title: 'First real post',
  excerpt: 'Loaded from the backend',
  content: '# Safe heading\n\n<script>alert(1)</script>\n\n[unsafe](javascript:alert(2))',
  featured_image: null,
  author: { id: 'author-1', name: 'Ada Author', avatar: null, title: 'Researcher' },
  status: 'published' as const,
  published_at: '2026-08-01T00:00:00Z',
  created_at: '2026-07-31T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  tags: ['AI'],
  category: 'Research',
  read_time: 2,
  views: 12,
  likes_count: 3,
  ai_summary: null,
  related_posts: [
    {
      id: 'post-2',
      slug: 'second-post',
      title: 'Second real post',
      excerpt: 'Related from the backend',
      featured_image: null,
      author: { id: 'author-2', name: 'Ben Author', avatar: null, title: 'Editor' },
      status: 'published' as const,
      published_at: '2026-07-30T00:00:00Z',
      created_at: '2026-07-29T00:00:00Z',
      updated_at: '2026-07-30T00:00:00Z',
      tags: ['Law'],
      category: 'Research',
      read_time: 1,
      views: 2,
      likes_count: 1,
      ai_summary: null,
    },
  ],
};

describe('BlogPostPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['first-post', 'First real post'],
    ['second-post', 'Second requested post'],
  ])('renders the requested published slug %s', async (slug, title) => {
    mockLoadPublicBlogPost.mockResolvedValue({ ...publishedPost, slug, title });

    const view = await BlogPostPage({ params: Promise.resolve({ slug }) });
    const { container } = render(view);

    expect(mockLoadPublicBlogPost).toHaveBeenCalledWith(slug);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Second real post' })).toHaveAttribute(
      'href',
      '/blog/second-post',
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it('invokes the Next.js server not-found boundary only for a missing post', async () => {
    mockLoadPublicBlogPost.mockResolvedValue(null);

    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'missing' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it.each([500, 504])('lets upstream %s reach the error boundary instead of becoming 404', async (status) => {
    const error = Object.assign(new Error('Blog service unavailable'), { status });
    mockLoadPublicBlogPost.mockRejectedValue(error);

    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: 'unavailable' }) }),
    ).rejects.toBe(error);
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  it('builds metadata from the requested post', async () => {
    mockLoadPublicBlogPost.mockResolvedValue(publishedPost);

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: 'first-post' }) }),
    ).resolves.toMatchObject({
      title: 'First real post',
      description: 'Loaded from the backend',
    });
  });
});
