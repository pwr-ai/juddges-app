import { Page } from '@playwright/test';

/**
 * Authentication test helpers
 * Provides utility functions for mocking auth state in tests
 */

export interface MockUser {
  id: string;
  email: string;
  name?: string;
}

/**
 * Setup mock authenticated user for tests
 * Call this in beforeEach to simulate authenticated state
 */
export async function setupMockAuth(page: Page, user?: MockUser) {
  const mockUser = user || {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User'
  };

  await page.addInitScript((userData) => {
    const mockSupabaseClient = {
      auth: {
        getUser: () => Promise.resolve({
          data: {
            user: {
              id: userData.id,
              email: userData.email,
              user_metadata: {
                name: userData.name
              },
              created_at: new Date().toISOString()
            }
          },
          error: null
        }),
        getSession: () => Promise.resolve({
          data: {
            session: {
              user: {
                id: userData.id,
                email: userData.email,
                user_metadata: {
                  name: userData.name
                }
              },
              access_token: 'mock-access-token',
              refresh_token: 'mock-refresh-token',
              expires_at: Date.now() + 3600000
            }
          },
          error: null
        }),
        onAuthStateChange: () => {
          return {
            data: { subscription: { unsubscribe: () => {} } }
          };
        }
      }
    };

    // Make it available globally for components to use
    window.mockSupabaseClient = mockSupabaseClient;
  }, mockUser);
}

/**
 * Setup mock unauthenticated state for tests
 * Simulates user not logged in
 */
export async function setupMockUnauthenticated(page: Page) {
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
        }),
        onAuthStateChange: () => {
          return {
            data: { subscription: { unsubscribe: () => {} } }
          };
        }
      }
    };

    window.mockSupabaseClient = mockSupabaseClient;
  });
}

/**
 * Mock successful sign in response
 */
export async function mockSignInSuccess(page: Page, user?: MockUser) {
  const mockUser = user || {
    id: 'test-user-123',
    email: 'test@example.com'
  };

  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'mock-access-token',
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          created_at: new Date().toISOString()
        }
      })
    });
  });
}

/**
 * Mock sign in failure
 */
export async function mockSignInError(page: Page, errorMessage = 'Invalid login credentials') {
  await page.route('**/auth/v1/token**', route => {
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: errorMessage
      })
    });
  });
}

/**
 * Mock sign up success
 */
export async function mockSignUpSuccess(page: Page, requiresConfirmation = true) {
  await page.route('**/auth/v1/signup**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'new-user-id',
          email: 'newuser@example.com',
          created_at: new Date().toISOString()
        },
        session: requiresConfirmation ? null : {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token'
        }
      })
    });
  });
}

/**
 * Mock sign up error
 */
export async function mockSignUpError(page: Page, errorMessage = 'User already exists') {
  await page.route('**/auth/v1/signup**', route => {
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'user_already_exists',
        error_description: errorMessage
      })
    });
  });
}
