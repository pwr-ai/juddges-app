import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Authentication Pages
 * Encapsulates selectors and actions for sign in/sign up
 */
export class AuthPage {
  readonly page: Page;

  // Form elements
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly signUpButton: Locator;

  // Navigation
  readonly signInLink: Locator;
  readonly signUpLink: Locator;
  readonly forgotPasswordLink: Locator;

  // Messages
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;

    // Form elements - using semantic selectors
    this.emailInput = page.getByRole('textbox', { name: /email/i }).or(
      page.getByLabel(/email/i)
    );
    this.passwordInput = page.getByLabel(/password/i);
    this.signInButton = page.getByRole('button', { name: /sign in|log in/i });
    this.signUpButton = page.getByRole('button', { name: /sign up|create account/i });

    // Navigation links
    this.signInLink = page.getByRole('link', { name: /sign in|log in/i });
    this.signUpLink = page.getByRole('link', { name: /sign up|create account/i });
    this.forgotPasswordLink = page.getByRole('link', { name: /forgot password/i });

    // Messages
    this.errorMessage = page.locator('[role="alert"]').or(
      page.locator('.error, [class*="error"]')
    );
    this.successMessage = page.locator('[role="status"]').or(
      page.locator('.success, [class*="success"]')
    );
  }

  /**
   * Navigate to sign in page
   */
  async gotoSignIn() {
    await this.page.goto('/auth/login');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Navigate to sign up page
   */
  async gotoSignUp() {
    await this.page.goto('/auth/sign-up');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();
  }

  /**
   * Sign up with email and password
   */
  async signUp(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signUpButton.click();
  }

  /**
   * Verify sign in was successful
   */
  async verifySignInSuccess() {
    // Should redirect away from auth pages
    await this.page.waitForURL(/\/(search|chat|$)/, { timeout: 10000 });
  }

  /**
   * Verify error is displayed
   */
  async verifyErrorDisplayed() {
    await expect(this.errorMessage).toBeVisible();
  }

  /**
   * Verify success message is displayed
   */
  async verifySuccessDisplayed() {
    await expect(this.successMessage).toBeVisible();
  }

  /**
   * Navigate to forgot password
   */
  async navigateToForgotPassword() {
    await this.forgotPasswordLink.click();
  }

  /**
   * Navigate to sign up from sign in
   */
  async navigateToSignUp() {
    await this.signUpLink.click();
  }

  /**
   * Navigate to sign in from sign up
   */
  async navigateToSignIn() {
    await this.signInLink.click();
  }
}
