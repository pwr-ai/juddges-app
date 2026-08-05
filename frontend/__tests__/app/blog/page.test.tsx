/**
 * @jest-environment jsdom
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('@/components/blog/blog-post-card', () => ({
  BlogPostCard: ({ post }: { post: { title: string } }) => <article>{post.title}</article>,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('@/lib/styles/components', () => ({
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  Header: ({ title, description }: { title: string; description: React.ReactNode }) => (
    <header><h1>{title}</h1>{description}</header>
  ),
  PageContainer: ({ children }: React.PropsWithChildren) => <main>{children}</main>,
  SearchInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  EmptyState: ({
    title,
    description,
    secondaryAction,
  }: {
    title: string;
    description: string;
    secondaryAction?: { label: string; onClick: () => void };
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{description}</p>
      {secondaryAction && <button onClick={secondaryAction.onClick}>{secondaryAction.label}</button>}
    </section>
  ),
  VariantButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  LightCard: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  FilterToggleGroup: ({
    options,
    value,
    onChange,
  }: {
    options: Array<{ value: string; label: React.ReactNode }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

import BlogPage from '@/app/blog/page';

const researchPost = {
  id: 'post-1',
  slug: 'real-research',
  title: 'Real research post',
  excerpt: 'Evidence from the backend',
  author: { name: 'Ada Researcher' },
  status: 'published',
  published_at: '2026-08-01T10:00:00Z',
  created_at: '2026-07-31T10:00:00Z',
  updated_at: '2026-08-01T10:00:00Z',
  tags: ['AI'],
  category: 'Research',
  likes_count: 4,
};

const tutorialPost = {
  ...researchPost,
  id: 'post-2',
  slug: 'real-tutorial',
  title: 'Real tutorial post',
  category: 'Tutorials',
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function postsResponse(
  data: Array<typeof researchPost>,
  page = 1,
  hasNext = false,
): Response {
  return jsonResponse({
    data,
    pagination: {
      total: data.length + (hasNext ? 1 : 0),
      page,
      limit: 6,
      total_pages: hasNext ? page + 1 : page,
      has_next: hasNext,
      has_prev: page > 1,
    },
  });
}

describe('BlogPage', () => {
  beforeEach(() => {
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/blog/categories') {
        return jsonResponse({
          data: [
            { id: 'category-1', name: 'Research', description: 'Research posts', post_count: 1 },
            { id: 'category-2', name: 'Tutorials', description: 'Tutorial posts', post_count: 1 },
          ],
        });
      }
      if (url.startsWith('/api/blog/posts?')) return postsResponse([researchPost]);
      throw new Error(`Unexpected fetch: ${url}`);
    }) as jest.Mock;
  });

  it('loads real posts and categories from the same-origin BFF', async () => {
    render(<BlogPage />);

    expect(screen.getByText('Loading blog posts…')).toBeInTheDocument();
    expect(await screen.findByText('Real research post')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/blog/categories', expect.any(Object));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/blog/posts?page=1&limit=6&sort=published_at&order=desc',
      expect.any(Object),
    );
    expect(screen.queryByText('The Future of AI in Legal Research: Trends and Innovations')).toBeNull();
  });

  it('sends category and search filters to the backend and replaces the current results', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/blog/categories') return jsonResponse({ data: [{ id: '2', name: 'Tutorials' }] });
      if (url.includes('category=Tutorials') && url.includes('search=appeal')) {
        return postsResponse([tutorialPost]);
      }
      return postsResponse([researchPost]);
    });

    render(<BlogPage />);
    await screen.findByText('Real research post');

    await user.click(screen.getByRole('button', { name: 'Tutorials' }));
    await user.type(screen.getByPlaceholderText('Search blog posts...'), 'appeal');

    expect(await screen.findByText('Real tutorial post')).toBeInTheDocument();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/blog/posts?page=1&limit=6&sort=published_at&order=desc&category=Tutorials&search=appeal',
        expect.any(Object),
      );
    });
    expect(screen.queryByText('Real research post')).toBeNull();
  });

  it('appends the next page and hides Load More when has_next becomes false', async () => {
    const user = userEvent.setup();
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/blog/categories') return jsonResponse({ data: [] });
      if (url.includes('page=2')) return postsResponse([tutorialPost], 2, false);
      return postsResponse([researchPost], 1, true);
    });

    render(<BlogPage />);
    await screen.findByText('Real research post');

    await user.click(screen.getByRole('button', { name: 'Load More Posts' }));

    expect(await screen.findByText('Real tutorial post')).toBeInTheDocument();
    expect(screen.getByText('Real research post')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/blog/posts?page=2&limit=6&sort=published_at&order=desc',
      expect.any(Object),
    );
    expect(screen.queryByRole('button', { name: 'Load More Posts' })).toBeNull();
  });

  it('does not append an old Load More response after the active filters change', async () => {
    const user = userEvent.setup();
    let resolveOldPage: ((response: Response) => void) | undefined;
    const oldPage = new Promise<Response>((resolve) => {
      resolveOldPage = resolve;
    });
    const stalePost = {
      ...researchPost,
      id: 'post-stale',
      slug: 'stale-page',
      title: 'Stale page result',
    };

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/blog/categories') return jsonResponse({ data: [] });
      if (url.includes('page=2')) return oldPage;
      if (url.includes('search=appeal')) return postsResponse([tutorialPost]);
      return postsResponse([researchPost], 1, true);
    });

    render(<BlogPage />);
    await screen.findByText('Real research post');

    await user.click(screen.getByRole('button', { name: 'Load More Posts' }));
    await waitFor(() => expect(String((global.fetch as jest.Mock).mock.calls.at(-1)?.[0])).toContain('page=2'));
    await user.type(screen.getByPlaceholderText('Search blog posts...'), 'appeal');
    expect(await screen.findByText('Real tutorial post')).toBeInTheDocument();

    await act(async () => {
      resolveOldPage?.(postsResponse([stalePost], 2, false));
      await oldPage;
    });

    await waitFor(() => expect(screen.queryByText('Stale page result')).toBeNull());
    expect(screen.getByText('Real tutorial post')).toBeInTheDocument();
  });

  it('renders an error state and retries the failed request', async () => {
    const user = userEvent.setup();
    let postAttempts = 0;
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/blog/categories') return jsonResponse({ data: [] });
      postAttempts += 1;
      if (postAttempts === 1) return jsonResponse({ detail: 'Database unavailable' }, 503);
      return postsResponse([researchPost]);
    });

    render(<BlogPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText('Real research post')).toBeInTheDocument();
    expect(postAttempts).toBe(2);
  });

  it('renders the empty state when the backend returns no posts', async () => {
    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/blog/categories') return jsonResponse({ data: [] });
      return postsResponse([]);
    });

    render(<BlogPage />);

    expect(await screen.findByText('No posts found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load More Posts' })).toBeNull();
  });
});
