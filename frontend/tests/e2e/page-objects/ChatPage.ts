import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for Chat Page
 * Encapsulates selectors and actions for the chat interface
 */
export class ChatPage {
  readonly page: Page;

  // Main elements
  readonly chatInput: Locator;
  readonly sendButton: Locator;
  readonly stopButton: Locator;

  // Messages
  readonly chatMessages: Locator;
  readonly userMessages: Locator;
  readonly assistantMessages: Locator;

  // Chat history
  readonly chatHistorySidebar: Locator;
  readonly chatHistoryItems: Locator;
  readonly newChatButton: Locator;

  // Example questions
  readonly exampleQuestions: Locator;

  // Sources
  readonly sourcesSection: Locator;

  constructor(page: Page) {
    this.page = page;

    // Initialize locators using semantic selectors
    this.chatInput = page.getByRole('textbox', { name: /message|question|chat/i }).or(
      page.locator('textarea[placeholder*="message"], textarea[placeholder*="question"]')
    );
    this.sendButton = page.getByRole('button', { name: /send/i }).or(
      page.locator('button[type="submit"]')
    );
    this.stopButton = page.getByRole('button', { name: /stop/i });

    // Messages
    this.chatMessages = page.getByTestId('chat-message');
    this.userMessages = page.getByTestId('chat-message-user');
    this.assistantMessages = page.getByTestId('chat-message-assistant');

    // Chat history
    this.chatHistorySidebar = page.locator('aside, [data-testid="chat-history-sidebar"]');
    this.chatHistoryItems = page.getByTestId('chat-history-item');
    this.newChatButton = page.getByRole('button', { name: /new.*chat/i });

    // Example questions
    this.exampleQuestions = page.locator('button:has-text("Example"), [class*="example"]');

    // Sources
    this.sourcesSection = page.getByTestId('message-sources');
  }

  /**
   * Navigate to chat page
   */
  async goto() {
    await this.page.goto('/chat');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Send a message in the chat
   */
  async sendMessage(message: string, options?: { waitForResponse?: boolean }) {
    await this.chatInput.fill(message);
    await this.sendButton.click();

    // Wait for response if requested
    if (options?.waitForResponse !== false) {
      await this.waitForAssistantResponse();
    }
  }

  /**
   * Wait for assistant response to appear
   */
  async waitForAssistantResponse(timeout = 30000) {
    // Wait for assistant message to be visible
    await expect(this.assistantMessages.first()).toBeVisible({ timeout });
  }

  /**
   * Stop the current generation
   */
  async stopGeneration() {
    await this.stopButton.click();
  }

  /**
   * Get count of all messages
   */
  async getMessageCount(): Promise<number> {
    return await this.chatMessages.count();
  }

  /**
   * Get count of user messages
   */
  async getUserMessageCount(): Promise<number> {
    return await this.userMessages.count();
  }

  /**
   * Get count of assistant messages
   */
  async getAssistantMessageCount(): Promise<number> {
    return await this.assistantMessages.count();
  }

  /**
   * Click on an example question
   */
  async clickExampleQuestion(index: number) {
    await this.exampleQuestions.nth(index).click();
  }

  /**
   * Verify chat input is visible and ready
   */
  async verifyChatReady() {
    await expect(this.chatInput).toBeVisible();
    await expect(this.chatInput).toBeEnabled();
    await expect(this.sendButton).toBeVisible();
  }

  /**
   * Verify example questions are displayed
   */
  async verifyExampleQuestionsDisplayed() {
    await expect(this.exampleQuestions.first()).toBeVisible();
  }

  /**
   * Verify message appears in chat
   */
  async verifyMessageInChat(text: string, role: 'user' | 'assistant') {
    const messageLocator = role === 'user' ? this.userMessages : this.assistantMessages;
    await expect(messageLocator.filter({ hasText: text })).toBeVisible();
  }

  /**
   * Verify sources are displayed
   */
  async verifySourcesDisplayed() {
    await expect(this.sourcesSection).toBeVisible();
  }

  /**
   * Create a new chat
   */
  async createNewChat() {
    await this.newChatButton.click();
    await this.page.waitForURL('/chat');
  }

  /**
   * Click on a chat history item
   */
  async clickChatHistoryItem(index: number) {
    await this.chatHistoryItems.nth(index).click();
  }

  /**
   * Delete a chat from history
   */
  async deleteChatFromHistory(index: number) {
    const chatItem = this.chatHistoryItems.nth(index);
    await chatItem.hover();

    const deleteButton = chatItem.getByRole('button', { name: /delete/i }).or(
      chatItem.locator('[data-testid="delete-chat-button"]')
    );
    await deleteButton.click();

    // Confirm deletion if dialog appears
    const confirmButton = this.page.getByRole('button', { name: /delete|confirm/i });
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
  }

  /**
   * Verify chat history is visible
   */
  async verifyChatHistoryVisible() {
    await expect(this.chatHistorySidebar).toBeVisible();
  }

  /**
   * Verify welcome screen is displayed
   */
  async verifyWelcomeScreen() {
    await expect(this.page.locator('text=/What legal question|Ask about/i')).toBeVisible();
    await expect(this.chatInput).toBeVisible();
  }
}
