# Frontend Testing Strategy
## Comprehensive Testing Plan for Juddges App

**Document Version**: 1.0
**Last Updated**: 2026-02-12
**Status**: Implementation Required

---

## Executive Summary

This document outlines a comprehensive testing strategy for the Juddges App frontend, addressing the current **0% test coverage** and providing a roadmap to achieve **80%+ coverage** within 30 days.

### Current State
- **Unit Tests**: 0% coverage (no tests found)
- **Integration Tests**: 0% coverage (no tests found)
- **E2E Tests**: 0% coverage (Playwright configured but no tests)
- **Accessibility Tests**: 0% coverage
- **Visual Regression Tests**: Not implemented

### Target State (30 days)
- **Unit Tests**: 80%+ coverage for components and utilities
- **Integration Tests**: Core user flows covered
- **E2E Tests**: Critical paths automated
- **Accessibility Tests**: WCAG 2.1 AA compliance verified
- **Visual Regression Tests**: Key pages captured

---

## 1. Testing Pyramid

```
                    /\
                   /  \
                  /    \
                 / E2E  \         10% of tests
                /--------\        (Slow, Expensive, High Value)
               /          \
              / Integration \     20% of tests
             /--------------\    (Medium Speed, Medium Cost)
            /                \
           /   Unit Tests     \  70% of tests
          /____________________\ (Fast, Cheap, High Volume)
```

### Philosophy
1. **Many unit tests**: Fast, isolated, cover edge cases
2. **Some integration tests**: Test component interactions
3. **Few E2E tests**: Cover critical user journeys

---

## 2. Unit Testing Strategy

### 2.1 Tools & Setup

**Tech Stack**:
- **Test Runner**: Jest (already configured)
- **Testing Library**: @testing-library/react
- **User Event**: @testing-library/user-event
- **Mocking**: Jest mocks + MSW (Mock Service Worker)

**Jest Configuration** (already in place):
```javascript
// jest.config.js
{
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.{js,jsx,ts,tsx}',
  ]
}
```

### 2.2 Component Testing Guidelines

#### Basic Component Test Template

```tsx
// tests/unit/components/ui/Button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  describe('Rendering', () => {
    it('renders with children', () => {
      render(<Button>Click me</Button>);
      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('renders as child component when asChild is true', () => {
      render(
        <Button asChild>
          <a href="/test">Link Button</a>
        </Button>
      );
      expect(screen.getByRole('link')).toBeInTheDocument();
    });
  });

  describe('Variants', () => {
    it('applies default variant classes', () => {
      render(<Button>Default</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('applies destructive variant classes', () => {
      render(<Button variant="destructive">Delete</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive');
    });

    it('applies outline variant classes', () => {
      render(<Button variant="outline">Outline</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'bg-background');
    });
  });

  describe('Sizes', () => {
    it('applies default size classes', () => {
      render(<Button>Default Size</Button>);
      expect(screen.getByRole('button')).toHaveClass('h-9');
    });

    it('applies small size classes', () => {
      render(<Button size="sm">Small</Button>);
      expect(screen.getByRole('button')).toHaveClass('h-8');
    });

    it('applies large size classes', () => {
      render(<Button size="lg">Large</Button>);
      expect(screen.getByRole('button')).toHaveClass('h-10');
    });

    it('applies icon size classes', () => {
      render(<Button size="icon">X</Button>);
      expect(screen.getByRole('button')).toHaveClass('size-9');
    });
  });

  describe('States', () => {
    it('handles disabled state', () => {
      render(<Button disabled>Disabled</Button>);
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByRole('button')).toHaveClass('disabled:opacity-50');
    });

    it('does not fire onClick when disabled', async () => {
      const handleClick = jest.fn();
      render(<Button disabled onClick={handleClick}>Disabled</Button>);

      await userEvent.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('Interactions', () => {
    it('calls onClick handler when clicked', async () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Click me</Button>);

      await userEvent.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('supports keyboard interaction', async () => {
      const handleClick = jest.fn();
      render(<Button onClick={handleClick}>Press me</Button>);

      const button = screen.getByRole('button');
      button.focus();
      await userEvent.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has proper button role', () => {
      render(<Button>Accessible</Button>);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('supports aria-label', () => {
      render(<Button aria-label="Close dialog">X</Button>);
      expect(screen.getByRole('button', { name: /close dialog/i })).toBeInTheDocument();
    });

    it('has focus-visible ring classes', () => {
      render(<Button>Focus me</Button>);
      expect(screen.getByRole('button')).toHaveClass('focus-visible:ring-ring/50');
    });
  });
});
```

#### Card Component Test

```tsx
// tests/unit/components/ui/Card.test.tsx
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';

describe('Card', () => {
  describe('Compound Components', () => {
    it('renders card with all subcomponents', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Title</CardTitle>
            <CardDescription>Description</CardDescription>
          </CardHeader>
          <CardContent>Content</CardContent>
          <CardFooter>Footer</CardFooter>
        </Card>
      );

      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });

    it('applies correct data-slot attributes', () => {
      const { container } = render(
        <Card>
          <CardHeader>Header</CardHeader>
        </Card>
      );

      expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="card-header"]')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies custom className to Card', () => {
      render(<Card className="custom-class">Content</Card>);
      const card = screen.getByText('Content').closest('[data-slot="card"]');
      expect(card).toHaveClass('custom-class');
    });

    it('has default styling classes', () => {
      render(<Card>Content</Card>);
      const card = screen.getByText('Content').closest('[data-slot="card"]');
      expect(card).toHaveClass('bg-card', 'text-card-foreground', 'rounded-xl');
    });
  });
});
```

### 2.3 Context Testing

```tsx
// tests/unit/contexts/AuthContext.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(),
}));

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
}));

describe('AuthContext', () => {
  const mockSupabase = {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      signInWithSSO: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Mock subscription
    mockSupabase.auth.onAuthStateChange.mockReturnValue({
      data: {
        subscription: { unsubscribe: jest.fn() },
      },
    });
  });

  describe('Initial State', () => {
    it('provides initial loading state', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });

    it('sets user when session exists', async () => {
      const mockUser = { id: '123', email: 'test@example.com' };
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            user: mockUser,
            access_token: 'token',
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => {
        expect(result.current.user).toEqual(mockUser);
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('Sign In', () => {
    it('calls signInWithPassword with correct credentials', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.signIn('test@example.com', 'password123');

      expect(mockSupabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('throws error when sign in fails', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        error: new Error('Invalid credentials'),
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await expect(
        result.current.signIn('wrong@example.com', 'wrongpass')
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('Sign Out', () => {
    it('calls signOut and redirects', async () => {
      mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } });
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });

      await waitFor(() => expect(result.current.loading).toBe(false));

      await result.current.signOut();

      expect(mockSupabase.auth.signOut).toHaveBeenCalled();
    });
  });
});
```

### 2.4 Utility Function Testing

```tsx
// tests/unit/lib/utils.test.ts
import { cn, formatNumberAbbreviated, formatSnakeCaseToHumanReadable } from '@/lib/utils';

describe('Utils', () => {
  describe('cn (className merger)', () => {
    it('merges multiple class names', () => {
      const result = cn('text-base', 'text-red-500', 'font-bold');
      expect(result).toContain('font-bold');
    });

    it('handles conditional classes', () => {
      const isActive = true;
      const result = cn('base-class', isActive && 'active-class');
      expect(result).toContain('active-class');
    });

    it('removes duplicate Tailwind classes', () => {
      const result = cn('p-4 p-8');
      expect(result).toBe('p-8');
    });
  });

  describe('formatNumberAbbreviated', () => {
    it('formats numbers under 1000 without abbreviation', () => {
      expect(formatNumberAbbreviated(500)).toBe('500');
      expect(formatNumberAbbreviated(999)).toBe('999');
    });

    it('formats thousands with K suffix', () => {
      expect(formatNumberAbbreviated(1000)).toBe('1K+');
      expect(formatNumberAbbreviated(1500)).toBe('1.5K+');
      expect(formatNumberAbbreviated(999000)).toBe('999K+');
    });

    it('formats millions with M suffix', () => {
      expect(formatNumberAbbreviated(1000000)).toBe('1M+');
      expect(formatNumberAbbreviated(2500000)).toBe('2.5M+');
    });

    it('removes trailing .0 from abbreviations', () => {
      expect(formatNumberAbbreviated(1000)).toBe('1K+');
      expect(formatNumberAbbreviated(2000000)).toBe('2M+');
    });
  });

  describe('formatSnakeCaseToHumanReadable', () => {
    it('converts snake_case to Title Case', () => {
      expect(formatSnakeCaseToHumanReadable('hello_world')).toBe('Hello World');
    });

    it('handles single words', () => {
      expect(formatSnakeCaseToHumanReadable('hello')).toBe('Hello');
    });

    it('handles multiple underscores', () => {
      expect(formatSnakeCaseToHumanReadable('ustawa_wprowadzajaca_super_agentow'))
        .toBe('Ustawa Wprowadzajaca Super Agentow');
    });
  });
});
```

### 2.5 Custom Hook Testing

```tsx
// tests/unit/hooks/useSearch.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSearch } from '@/hooks/useSearch';

describe('useSearch', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('returns initial state', () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches search results', async () => {
    const { result } = renderHook(() => useSearch(), { wrapper });

    result.current.search('contract law');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.data).toBeDefined();
    });
  });
});
```

### 2.6 Unit Test Coverage Goals

| Category | Target Coverage | Priority |
|----------|----------------|----------|
| UI Components | 90% | High |
| Contexts | 85% | High |
| Utility Functions | 95% | High |
| Custom Hooks | 80% | Medium |
| Type Definitions | N/A | N/A |

---

## 3. Integration Testing Strategy

### 3.1 Testing Component Interactions

```tsx
// tests/integration/search/SearchFlow.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchPage } from '@/app/(app)/search/page';
import { setupServer } from 'msw/node';
import { rest } from 'msw';

const server = setupServer(
  rest.get('/api/search/judgments', (req, res, ctx) => {
    const query = req.url.searchParams.get('q');
    return res(
      ctx.json({
        results: [
          {
            id: '1',
            case_number: 'I CSK 123/2024',
            title: 'Contract dispute case',
            jurisdiction: 'PL',
          },
        ],
        total: 1,
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Search Flow Integration', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('completes full search flow', async () => {
    render(<SearchPage />, { wrapper });

    // Enter search query
    const searchInput = screen.getByPlaceholderText(/search judgments/i);
    await userEvent.type(searchInput, 'contract law');

    // Apply filter
    const plFilter = screen.getByRole('button', { name: /poland/i });
    await userEvent.click(plFilter);

    // Submit search
    const searchButton = screen.getByRole('button', { name: /search/i });
    await userEvent.click(searchButton);

    // Wait for results
    await waitFor(() => {
      expect(screen.getByText('Contract dispute case')).toBeInTheDocument();
    });

    // Verify result card
    expect(screen.getByText('I CSK 123/2024')).toBeInTheDocument();
  });

  it('displays empty state when no results', async () => {
    server.use(
      rest.get('/api/search/judgments', (req, res, ctx) => {
        return res(ctx.json({ results: [], total: 0 }));
      })
    );

    render(<SearchPage />, { wrapper });

    const searchInput = screen.getByPlaceholderText(/search judgments/i);
    await userEvent.type(searchInput, 'nonexistent query');

    const searchButton = screen.getByRole('button', { name: /search/i });
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/no judgments found/i)).toBeInTheDocument();
    });
  });

  it('handles API errors gracefully', async () => {
    server.use(
      rest.get('/api/search/judgments', (req, res, ctx) => {
        return res(ctx.status(500), ctx.json({ error: 'Internal server error' }));
      })
    );

    render(<SearchPage />, { wrapper });

    const searchInput = screen.getByPlaceholderText(/search judgments/i);
    await userEvent.type(searchInput, 'test query');

    const searchButton = screen.getByRole('button', { name: /search/i });
    await userEvent.click(searchButton);

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

---

## 4. E2E Testing Strategy

### 4.1 Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3007',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3007',
    reuseExistingServer: !process.env.CI,
  },
});
```

### 4.2 Authentication Flow E2E Tests

```typescript
// tests/e2e/auth/login.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
  });

  test('user can log in successfully', async ({ page }) => {
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard|\/search/);
    await expect(page.locator('nav')).toBeVisible();
  });

  test('displays error for invalid credentials', async ({ page }) => {
    await page.fill('[name="email"]', 'wrong@example.com');
    await page.fill('[name="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid|error/i')).toBeVisible();
    await expect(page).toHaveURL('/auth/login');
  });

  test('validates required fields', async ({ page }) => {
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/email.*required/i')).toBeVisible();
    await expect(page.locator('text=/password.*required/i')).toBeVisible();
  });

  test('redirects to intended page after login', async ({ page }) => {
    // Try to access protected page
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/auth\/login/);

    // Log in
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    // Should redirect back to chat
    await expect(page).toHaveURL('/chat');
  });

  test('user can log out', async ({ page }) => {
    // Login first
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard|\/search/);

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=/log out|sign out/i');

    await expect(page).toHaveURL('/auth/login');
  });
});
```

### 4.3 Search Flow E2E Tests

```typescript
// tests/e2e/search/search-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Assume user is logged in
    await page.goto('/search');
  });

  test('user can search for judgments', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'copyright law');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="judgment-card"]').first()).toBeVisible();
  });

  test('user can filter by jurisdiction', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'contract');
    await page.click('[data-testid="filter-jurisdiction-PL"]');
    await page.click('[data-testid="search-button"]');

    await expect(page).toHaveURL(/jurisdiction=PL/);

    const results = page.locator('[data-testid="judgment-card"]');
    const count = await results.count();

    for (let i = 0; i < count; i++) {
      await expect(results.nth(i)).toContainText(/PL|Poland/);
    }
  });

  test('user can paginate through results', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'law');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="judgment-card"]')).toHaveCount(10);

    await page.click('[data-testid="next-page"]');
    await expect(page).toHaveURL(/page=2/);

    await expect(page.locator('[data-testid="judgment-card"]')).toBeVisible();
  });

  test('user can view judgment details', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'copyright');
    await page.click('[data-testid="search-button"]');

    await page.click('[data-testid="judgment-card"]' + ':first-child');

    await expect(page).toHaveURL(/\/judgments\//);
    await expect(page.locator('[data-testid="judgment-title"]')).toBeVisible();
    await expect(page.locator('[data-testid="judgment-full-text"]')).toBeVisible();
  });

  test('displays loading state during search', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'test query');
    await page.click('[data-testid="search-button"]');

    // Should show loading indicator immediately
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();

    // Loading should disappear when results load
    await expect(page.locator('[data-testid="loading-indicator"]')).not.toBeVisible({
      timeout: 10000,
    });
  });

  test('displays empty state for no results', async ({ page }) => {
    await page.fill('[data-testid="search-input"]', 'xyznonexistentquery123');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
    await expect(page.locator('text=/no.*found/i')).toBeVisible();
  });
});
```

### 4.4 Chat Flow E2E Tests

```typescript
// tests/e2e/chat/chat-flow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chat');
  });

  test('user can send message and receive response', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]', 'What is copyright duration in Poland?');
    await page.click('[data-testid="send-button"]');

    // User message should appear
    await expect(page.locator('[data-testid="chat-message-user"]').last()).toContainText(
      'copyright'
    );

    // AI response should appear (with timeout for API)
    await expect(page.locator('[data-testid="chat-message-assistant"]').last()).toBeVisible({
      timeout: 15000,
    });
  });

  test('displays streaming response correctly', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]', 'Explain contract law');
    await page.click('[data-testid="send-button"]');

    // Typing indicator should appear
    await expect(page.locator('[data-testid="typing-indicator"]')).toBeVisible();

    // Wait for response to complete
    await expect(page.locator('[data-testid="typing-indicator"]')).not.toBeVisible({
      timeout: 20000,
    });

    // Full message should be visible
    const lastMessage = page.locator('[data-testid="chat-message-assistant"]').last();
    await expect(lastMessage).toBeVisible();
    const text = await lastMessage.textContent();
    expect(text!.length).toBeGreaterThan(50);
  });

  test('user can clear chat history', async ({ page }) => {
    // Send a message first
    await page.fill('[data-testid="chat-input"]', 'Test message');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('[data-testid="chat-message-user"]')).toBeVisible();

    // Clear chat
    await page.click('[data-testid="clear-chat"]');
    await page.click('text=/confirm|yes/i');

    // Messages should be gone
    await expect(page.locator('[data-testid="chat-message-user"]')).not.toBeVisible();
  });

  test('handles errors gracefully', async ({ page }) => {
    // Simulate network error by disconnecting
    await page.route('**/api/chat**', (route) =>
      route.abort('failed')
    );

    await page.fill('[data-testid="chat-input"]', 'Test message');
    await page.click('[data-testid="send-button"]');

    await expect(page.locator('text=/error|failed/i')).toBeVisible();
  });

  test('input is disabled while waiting for response', async ({ page }) => {
    await page.fill('[data-testid="chat-input"]', 'Test message');
    await page.click('[data-testid="send-button"]');

    const input = page.locator('[data-testid="chat-input"]');
    await expect(input).toBeDisabled();

    // Should re-enable after response
    await expect(input).toBeEnabled({ timeout: 20000 });
  });
});
```

---

## 5. Accessibility Testing Strategy

### 5.1 Automated Accessibility Tests

```typescript
// tests/e2e/accessibility/keyboard-navigation.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Keyboard Navigation', () => {
  test('user can navigate with keyboard only', async ({ page }) => {
    await page.goto('/search');

    // Tab to search input
    await page.keyboard.press('Tab');
    let focused = await page.locator(':focus');
    await expect(focused).toHaveAttribute('data-testid', 'search-input');

    // Type query
    await page.keyboard.type('contract law');

    // Tab to search button
    await page.keyboard.press('Tab');
    focused = await page.locator(':focus');
    await expect(focused).toHaveAttribute('data-testid', 'search-button');

    // Activate button with Enter
    await page.keyboard.press('Enter');

    // Wait for results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

    // Tab to first result
    await page.keyboard.press('Tab');
    focused = await page.locator(':focus');
    await expect(focused).toHaveAttribute('data-testid', 'judgment-card');

    // Open with Enter
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/judgments\//);
  });

  test('focus trap works in modals', async ({ page }) => {
    await page.goto('/search');

    // Open filter modal
    await page.click('[data-testid="open-filters"]');

    // Tab should stay within modal
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Get all focusable elements in modal
    const firstFocusable = modal.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').first();
    const lastFocusable = modal.locator('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])').last();

    // Tab to last element
    await lastFocusable.focus();

    // Tab again should cycle to first
    await page.keyboard.press('Tab');
    const focused = await page.locator(':focus');
    const firstId = await firstFocusable.getAttribute('id');
    const focusedId = await focused.getAttribute('id');
    expect(focusedId).toBe(firstId);
  });

  test('skip navigation link works', async ({ page }) => {
    await page.goto('/');

    // Tab to skip link
    await page.keyboard.press('Tab');
    const skipLink = page.locator('text=/skip to.*content/i');
    await expect(skipLink).toBeFocused();

    // Activate skip link
    await page.keyboard.press('Enter');

    // Focus should move to main content
    const focused = await page.locator(':focus');
    await expect(focused).toHaveAttribute('id', 'main-content');
  });
});
```

```typescript
// tests/e2e/accessibility/aria-labels.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('ARIA Labels and Accessibility', () => {
  test('all interactive elements have accessible names', async ({ page }) => {
    await page.goto('/search');

    const buttons = await page.locator('button').all();
    for (const button of buttons) {
      const accessibleName =
        (await button.getAttribute('aria-label')) || (await button.textContent());
      expect(accessibleName?.trim()).toBeTruthy();
    }
  });

  test('form inputs have associated labels', async ({ page }) => {
    await page.goto('/auth/login');

    const emailInput = page.locator('[name="email"]');
    const passwordInput = page.locator('[name="password"]');

    await expect(emailInput).toHaveAttribute('aria-label', /.+/);
    await expect(passwordInput).toHaveAttribute('aria-label', /.+/);
  });

  test('page has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/search');

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('all pages have proper landmarks', async ({ page }, testInfo) => {
    const pages = ['/search', '/chat', '/dashboard'];

    for (const url of pages) {
      await page.goto(url);

      // Main landmark
      await expect(page.locator('main, [role="main"]')).toBeVisible();

      // Navigation landmark
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible();

      // Search landmark (if applicable)
      if (url === '/search') {
        await expect(page.locator('[role="search"]')).toBeVisible();
      }
    }
  });

  test('color contrast meets WCAG AA standards', async ({ page }) => {
    await page.goto('/search');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2aa', 'wcag21aa'])
      .analyze();

    const contrastViolations = accessibilityScanResults.violations.filter(
      (violation) => violation.id === 'color-contrast'
    );

    expect(contrastViolations).toEqual([]);
  });
});
```

---

## 6. Visual Regression Testing

### 6.1 Screenshot Comparison Tests

```typescript
// tests/e2e/visual/pages.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression Tests', () => {
  test('search page matches baseline', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveScreenshot('search-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('chat page matches baseline', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveScreenshot('chat-page.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('judgment detail page matches baseline', async ({ page }) => {
    await page.goto('/judgments/test-id-123');
    await expect(page).toHaveScreenshot('judgment-detail.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('search results match baseline', async ({ page }) => {
    await page.goto('/search?q=copyright');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('search-results.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('dark mode matches baseline', async ({ page }) => {
    await page.goto('/search');

    // Toggle dark mode
    await page.click('[data-testid="theme-toggle"]');
    await page.waitForTimeout(500); // Wait for transition

    await expect(page).toHaveScreenshot('search-page-dark.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });
});
```

---

## 7. Testing Workflow

### 7.1 Developer Workflow

```bash
# Before committing
npm run test              # Run unit tests
npm run test:coverage     # Check coverage
npm run lint              # Check linting

# Before pushing
npm run test:e2e          # Run E2E tests locally

# CI/CD pipeline
npm run test:ci           # Run all tests in CI mode
```

### 7.2 CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  accessibility-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e:accessibility
```

---

## 8. Testing Metrics & Goals

### 8.1 Coverage Targets

| Test Type | Week 1 | Week 2 | Week 3 | Week 4 | Final Target |
|-----------|--------|--------|--------|--------|--------------|
| Unit Tests | 40% | 60% | 75% | 85% | 80%+ |
| Integration Tests | 20% | 40% | 60% | 70% | 60%+ |
| E2E Critical Paths | 2 flows | 4 flows | 6 flows | 8 flows | 8 flows |
| Accessibility Tests | 0 | 5 pages | 10 pages | All pages | All pages |

### 8.2 Performance Benchmarks

| Metric | Target | Current | Priority |
|--------|--------|---------|----------|
| Unit Test Execution | < 10s | TBD | High |
| E2E Test Suite | < 5 min | TBD | Medium |
| Test Flakiness Rate | < 1% | TBD | High |
| Code Coverage | > 80% | 0% | Critical |

---

## 9. Quick Start Guide

### Step 1: Set Up Testing Environment

```bash
# Install dependencies (already done)
npm install

# Install Playwright browsers
npx playwright install --with-deps
```

### Step 2: Write Your First Unit Test

```bash
# Create test file
mkdir -p tests/unit/components/ui
touch tests/unit/components/ui/Button.test.tsx

# Copy Button test template from section 2.2
# Run test
npm run test tests/unit/components/ui/Button.test.tsx
```

### Step 3: Write Your First E2E Test

```bash
# Create test file
mkdir -p tests/e2e/auth
touch tests/e2e/auth/login.spec.ts

# Copy login test template from section 4.2
# Run test
npm run test:e2e tests/e2e/auth/login.spec.ts
```

### Step 4: Check Coverage

```bash
# Run all tests with coverage
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

---

## 10. Resources

### Testing Libraries Documentation
- [Jest](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright](https://playwright.dev/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [Axe Accessibility Testing](https://www.deque.com/axe/)

### Best Practices
- [Kent C. Dodds Testing Blog](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Playwright Best Practices 2026](https://www.browserstack.com/guide/playwright-best-practices)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Document Status**: Ready for Implementation
**Next Steps**: Begin with Priority 1 tasks in section 5
**Review Date**: After Sprint 1 completion
