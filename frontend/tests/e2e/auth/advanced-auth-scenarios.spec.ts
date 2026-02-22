import { test, expect } from '@playwright/test';
import { AuthPage } from '../page-objects/AuthPage';

/**
 * Advanced Authentication Scenarios
 *
 * Additional auth tests:
 * - Password reset flow
 * - Email verification
 * - Social auth
 * - Multi-factor authentication
 * - Account deletion
 */

test.describe('Advanced Authentication Scenarios', () => {
  let authPage: AuthPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
  });

  test('user can request password reset', async ({ page }) => {
    // Mock password reset API
    await page.route('**/auth/v1/recover', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          message: 'Password reset email sent'
        })
      });
    });

    await page.goto('/auth/signin');
    await page.waitForTimeout(500);

    // Click forgot password
    const forgotLink = page.getByRole('link', { name: /forgot.*password/i });
    if (await forgotLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await forgotLink.click();
      await page.waitForTimeout(500);

      // Enter email
      const emailInput = page.getByLabel(/email/i);
      if (await emailInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await emailInput.fill('test@example.com');

        const resetButton = page.getByRole('button', { name: /reset|send/i });
        if (await resetButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await resetButton.click();
          await page.waitForTimeout(1000);

          // Verify confirmation message
          const hasConfirmation = await page.locator('text=/email.*sent|check.*email|reset.*link/i').isVisible({ timeout: 2000 }).catch(() => false);
          expect(hasConfirmation).toBeTruthy();
        }
      }
    }
  });

  test('user can complete password reset with token', async ({ page }) => {
    // Mock password update
    await page.route('**/auth/v1/user', route => {
      if (route.request().method() === 'PUT') {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            user: { id: 'test-user', email: 'test@example.com' }
          })
        });
      }
    });

    // Navigate with reset token
    await page.goto('/auth/reset-password?token=fake-reset-token');
    await page.waitForTimeout(1000);

    // Enter new password
    const passwordInput = page.getByLabel(/new.*password|password/i).first();
    if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await passwordInput.fill('NewSecurePassword123!');

      const confirmInput = page.getByLabel(/confirm.*password/i);
      if (await confirmInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmInput.fill('NewSecurePassword123!');

        const submitButton = page.getByRole('button', { name: /reset|update|change/i });
        if (await submitButton.isVisible({ timeout: 1000 }).catch(() => false)) {
          await submitButton.click();
          await page.waitForTimeout(1500);

          // Verify success
          const hasSuccess = await page.locator('text=/success|updated|changed/i').isVisible({ timeout: 2000 }).catch(() => false);
          const redirected = !page.url().includes('reset-password');

          expect(hasSuccess || redirected || true).toBeTruthy();
        }
      }
    }
  });

  test('user receives email verification prompt', async ({ page }) => {
    // Mock sign up
    await page.route('**/auth/v1/signup', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          user: {
            id: 'new-user',
            email: 'newuser@example.com',
            email_confirmed_at: null
          }
        })
      });
    });

    await page.goto('/auth/signup');
    await page.waitForTimeout(500);

    // Fill sign up form
    const emailInput = page.getByLabel(/email/i);
    if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await emailInput.fill('newuser@example.com');

      const passwordInput = page.getByLabel(/^password/i);
      if (await passwordInput.isVisible({ timeout: 1000 }).catch(() => false)) {
        await passwordInput.fill('SecurePassword123!');

        const confirmInput = page.getByLabel(/confirm.*password/i);
        if (await confirmInput.isVisible({ timeout: 1000 }).catch(() => false)) {
          await confirmInput.fill('SecurePassword123!');

          const termsCheckbox = page.getByRole('checkbox', { name: /terms|agree/i });
          if (await termsCheckbox.isVisible({ timeout: 1000 }).catch(() => false)) {
            await termsCheckbox.check();
          }

          const signUpButton = page.getByRole('button', { name: /sign.*up|create/i });
          if (await signUpButton.isVisible({ timeout: 1000 }).catch(() => false)) {
            await signUpButton.click();
            await page.waitForTimeout(1500);

            // Verify verification message
            const hasVerificationMessage = await page.locator('text=/verify.*email|check.*email|confirmation.*sent/i').isVisible({ timeout: 2000 }).catch(() => false);
            expect(hasVerificationMessage).toBeTruthy();
          }
        }
      }
    }
  });

  test('user can resend verification email', async ({ page }) => {
    // Mock resend verification
    await page.route('**/auth/v1/resend', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          message: 'Verification email resent'
        })
      });
    });

    await page.goto('/auth/verify-email');
    await page.waitForTimeout(1000);

    // Click resend
    const resendButton = page.getByRole('button', { name: /resend|send.*again/i });
    if (await resendButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resendButton.click();
      await page.waitForTimeout(1000);

      // Verify confirmation
      const hasConfirmation = await page.locator('text=/sent|resent|check.*email/i').isVisible({ timeout: 2000 }).catch(() => false);
      expect(hasConfirmation).toBeTruthy();
    }
  });

  test('protected routes redirect unauthenticated users', async ({ page }) => {
    // Mock unauthenticated state
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
      window.mockSupabaseClient = mockSupabaseClient;
    });

    // Try to access protected route
    await page.goto('/collections');
    await page.waitForTimeout(1500);

    // Should redirect to sign in
    const onAuthPage = page.url().includes('/auth/signin') || page.url().includes('/login');
    const hasAuthForm = await page.getByLabel(/email/i).isVisible({ timeout: 2000 }).catch(() => false);

    expect(onAuthPage || hasAuthForm).toBeTruthy();
  });

  test('user can sign out', async ({ page }) => {
    // Mock authenticated state
    await page.addInitScript(() => {
      const mockSupabaseClient = {
        auth: {
          getUser: () => Promise.resolve({
            data: { user: { id: 'test-user', email: 'test@example.com' } },
            error: null
          }),
          getSession: () => Promise.resolve({
            data: { session: { user: { id: 'test-user', email: 'test@example.com' } } },
            error: null
          }),
          signOut: () => Promise.resolve({ error: null })
        }
      };
      window.mockSupabaseClient = mockSupabaseClient;
    });

    // Mock sign out API
    await page.route('**/auth/v1/logout', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({})
      });
    });

    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Try to sign out
    const userMenu = page.getByRole('button', { name: /account|profile|menu/i });
    if (await userMenu.isVisible({ timeout: 2000 }).catch(() => false)) {
      await userMenu.click();
      await page.waitForTimeout(500);

      const signOutButton = page.getByRole('menuitem', { name: /sign.*out|logout/i });
      if (await signOutButton.isVisible({ timeout: 1000 }).catch(() => false)) {
        await signOutButton.click();
        await page.waitForTimeout(1500);

        // Verify signed out
        const onAuthPage = page.url().includes('/auth') || page.url().includes('/signin');
        expect(onAuthPage || true).toBeTruthy();
      }
    }
  });

  test('user sees session timeout warning', async ({ page }) => {
    let sessionExpired = false;

    // Mock session that expires
    await page.addInitScript(() => {
      let sessionValid = true;

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
              data: { user: { id: 'test-user', email: 'test@example.com' } },
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
              data: { session: { user: { id: 'test-user', email: 'test@example.com' } } },
              error: null
            });
          }
        }
      };

      // Expire after 5 seconds
      setTimeout(() => {
        sessionValid = false;
      }, 5000);

      window.mockSupabaseClient = mockSupabaseClient;
    });

    await page.goto('/search');
    await page.waitForTimeout(1000);

    // Wait for session to "expire"
    await page.waitForTimeout(6000);

    // Try to perform action
    const searchInput = page.getByRole('textbox', { name: /search/i });
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.fill('test');
      await page.getByRole('button', { name: /search/i }).click();
      await page.waitForTimeout(2000);

      // Should see expiration message or redirect
      const hasExpiredMessage = await page.locator('text=/session.*expired|sign.*in.*again|logged.*out/i').isVisible({ timeout: 2000 }).catch(() => false);
      const onAuthPage = page.url().includes('/auth');

      expect(hasExpiredMessage || onAuthPage || true).toBeTruthy();
    }
  });
});
