/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockLoadPublicBlogPost = jest.fn();

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
jest.mock('@/lib/blog/public-api', () => ({
  loadPublicBlogPost: (...args: unknown[]) => mockLoadPublicBlogPost(...args),
}));

import BlogPostPage from '@/app/blog/[slug]/page';

const post = {
  id: 'post-image-policy',
  slug: 'post-image-policy',
  title: 'Article with untrusted image',
  excerpt: 'The article must remain readable.',
  content: '# Article body',
  author: { id: 'author-1', name: 'Author', avatar: null, title: 'Researcher' },
  status: 'published' as const,
  published_at: '2026-08-01T00:00:00Z',
  created_at: '2026-07-31T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  tags: [],
  category: 'Research',
  views: 1,
  likes_count: 0,
  related_posts: [],
};

describe('blog detail featured-image policy', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    '/images/article.jpg',
    'https://images.unsplash.com/photo-123?auto=format',
  ])('renders a source allowed by Next image configuration: %s', async (featuredImage) => {
    mockLoadPublicBlogPost.mockResolvedValue({
      ...post,
      featured_image: featuredImage,
    });

    const view = await BlogPostPage({
      params: Promise.resolve({ slug: post.slug }),
    });
    const { container } = render(view);

    expect(container.querySelector('img')).not.toBeNull();
    expect(
      screen.queryByRole('img', { name: 'Article image unavailable' }),
    ).toBeNull();
  });

  it.each([
    'https://unconfigured.example.test/article.jpg',
    'images/article-without-leading-slash.jpg',
    'javascript:alert(1)',
  ])('uses an editorial fallback for unsafe source %s', async (featuredImage) => {
    mockLoadPublicBlogPost.mockResolvedValue({
      ...post,
      featured_image: featuredImage,
    });

    const view = await BlogPostPage({
      params: Promise.resolve({ slug: post.slug }),
    });
    const { container } = render(view);

    expect(screen.getByRole('heading', { name: post.title })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Article image unavailable' }),
    ).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
