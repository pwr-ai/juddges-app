/**
 * Authentication Utilities for E2E Tests
 *
 * Provides helpers for mocking authentication in Playwright tests
 */

import { Page } from '@playwright/test';

export interface MockUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
}

/**
 * Mock authenticated Supabase session
 */
export async function mockAuthentication(
  page: Page,
  user: MockUser = {
    id: 'test-user-id',
    email: 'test@example.com'
  }
): Promise<void> {
  await page.addInitScript((userData) => {
    const mockSupabaseClient = {
      auth: {
        getUser: () => Promise.resolve({
          data: {
            user: userData
          },
          error: null
        }),
        getSession: () => Promise.resolve({
          data: {
            session: {
              user: userData,
              access_token: 'mock-access-token',
              refresh_token: 'mock-refresh-token',
              expires_at: Date.now() + 3600000 // 1 hour from now
            }
          },
          error: null
        }),
        signOut: () => Promise.resolve({ error: null })
      },
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({
              data: {},
              error: null
            })
          })
        }),
        insert: () => Promise.resolve({
          data: {},
          error: null
        }),
        update: () => ({
          eq: () => Promise.resolve({
            data: {},
            error: null
          })
        }),
        delete: () => ({
          eq: () => Promise.resolve({
            data: {},
            error: null
          })
        })
      })
    };

    // Override window.mockSupabaseClient
    (window as any).mockSupabaseClient = mockSupabaseClient;
  }, user);
}

/**
 * Mock unauthenticated state
 */
export async function mockUnauthenticated(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockSupabaseClient = {
      auth: {
        getUser: () => Promise.resolve({
          data: { user: null },
          error: { message: 'Not authenticated' }
        }),
        getSession: () => Promise.resolve({
          data: { session: null },
          error: null
        })
      }
    };

    (window as any).mockSupabaseClient = mockSupabaseClient;
  });
}

/**
 * Mock expired session
 */
export async function mockExpiredSession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const mockSupabaseClient = {
      auth: {
        getUser: () => Promise.resolve({
          data: { user: null },
          error: { message: 'Session expired' }
        }),
        getSession: () => Promise.resolve({
          data: { session: null },
          error: { message: 'Session expired' }
        })
      }
    };

    (window as any).mockSupabaseClient = mockSupabaseClient;
  });
}

/**
 * Mock session that expires after delay
 */
export async function mockTimedSession(
  page: Page,
  expiresInMs: number = 5000
): Promise<void> {
  await page.addInitScript((expireTime) => {
    let sessionValid = true;

    setTimeout(() => {
      sessionValid = false;
    }, expireTime);

    const mockSupabaseClient = {
      auth: {
        getUser: () => {
          if (!sessionValid) {
            return Promise.resolve({
              data: { user: null },
              error: { message: 'Session expired' }
            });
          }
          return Promise.resolve({
            data: {
              user: {
                id: 'test-user-id',
                email: 'test@example.com'
              }
            },
            error: null
          });
        },
        getSession: () => {
          if (!sessionValid) {
            return Promise.resolve({
              data: { session: null },
              error: { message: 'Session expired' }
            });
          }
          return Promise.resolve({
            data: {
              session: {
                user: {
                  id: 'test-user-id',
                  email: 'test@example.com'
                },
                access_token: 'mock-token'
              }
            },
            error: null
          });
        }
      }
    };

    (window as any).mockSupabaseClient = mockSupabaseClient;
  }, expiresInMs);
}

/**
 * Set up auth route mocks
 */
export async function mockAuthRoutes(page: Page): Promise<void> {
  // Mock sign in
  await page.route('**/auth/v1/token?grant_type=password', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        user: {
          id: 'test-user-id',
          email: 'test@example.com'
        }
      })
    });
  });

  // Mock sign up
  await page.route('**/auth/v1/signup', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'new-user-id',
          email: 'newuser@example.com',
          email_confirmed_at: null
        }
      })
    });
  });

  // Mock sign out
  await page.route('**/auth/v1/logout', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });

  // Mock password reset
  await page.route('**/auth/v1/recover', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Password reset email sent'
      })
    });
  });

  // Mock get user
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          id: 'test-user-id',
          email: 'test@example.com'
        })
      });
    } else if (route.request().method() === 'PUT') {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            email: 'test@example.com'
          }
        })
      });
    }
  });
}

/**
 * Wait for authentication to complete
 */
export async function waitForAuth(page: Page, timeout: number = 5000): Promise<void> {
  await page.waitForFunction(
    () => {
      return (window as any).mockSupabaseClient !== undefined;
    },
    { timeout }
  );
}

/**
 * Get current mock user
 */
export async function getCurrentMockUser(page: Page): Promise<MockUser | null> {
  return await page.evaluate(async () => {
    const client = (window as any).mockSupabaseClient;
    if (!client) return null;

    const { data } = await client.auth.getUser();
    return data?.user || null;
  });
}
