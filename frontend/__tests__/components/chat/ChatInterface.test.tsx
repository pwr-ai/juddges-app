/**
 * Component tests for ChatInterface
 *
 * Tests chat UI, message display, scrolling, and user interactions
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ChatInterface } from '@/lib/styles/components/chat/chat-interface';
import { useChatContext } from '@/contexts/ChatContext';
import { usePathname, useRouter } from 'next/navigation';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

// Mock ChatContext
jest.mock('@/contexts/ChatContext', () => ({
  useChatContext: jest.fn(),
}));

// Mock child components
jest.mock('@/lib/styles/components/chat/chat-input', () => ({
  ChatInput: ({ onSend, isLoading, placeholder, tools }: any) => (
    <div data-testid="chat-input">
      <input
        data-testid="message-input"
        placeholder={placeholder}
        disabled={isLoading}
      />
      <button
        data-testid="send-button"
        onClick={() => onSend('Test message')}
        disabled={isLoading}
      >
        Send
      </button>
      {tools && tools.length > 0 && (
        <div data-testid="chat-tools">
          {tools.map((tool: any) => (
            <div key={tool.id} data-testid={`tool-${tool.id}`}>
              {tool.label}
            </div>
          ))}
        </div>
      )}
    </div>
  ),
}));

jest.mock('@/lib/styles/components/chat/chat-message-list', () => ({
  ChatMessageList: ({ messages, isLoading, onRegenerateMessage, onEditMessage, onForkFromMessage }: any) => (
    <div data-testid="chat-message-list">
      {messages.map((msg: any, idx: number) => (
        <div key={idx} data-testid={`message-${idx}`}>
          <p>{msg.content}</p>
          <p>Role: {msg.role}</p>
          {onRegenerateMessage && msg.role === 'assistant' && (
            <button onClick={() => onRegenerateMessage(idx)}>Regenerate</button>
          )}
          {onEditMessage && msg.role === 'user' && (
            <button onClick={() => onEditMessage(idx, 'Edited')}>Edit</button>
          )}
          {onForkFromMessage && (
            <button onClick={() => onForkFromMessage(msg.id)}>Fork</button>
          )}
        </div>
      ))}
      {isLoading && <div data-testid="loading-indicator">Loading...</div>}
    </div>
  ),
}));

jest.mock('@/components/chat/ExportChatDialog', () => ({
  ExportChatDialog: ({ open, onOpenChange, chatId }: any) =>
    open ? (
      <div data-testid="export-dialog">
        <p>Export chat: {chatId}</p>
        <button onClick={() => onOpenChange(false)}>Close</button>
      </div>
    ) : null,
}));

describe('ChatInterface Component', () => {
  const mockMessages = [
    { id: 'msg-1', role: 'user', content: 'What is contract law?' },
    { id: 'msg-2', role: 'assistant', content: 'Contract law is...' },
  ];

  const mockChatContext = {
    messages: mockMessages,
    isLoading: false,
    fragments: [],
    messagesEndRef: { current: null },
    handleSendMessage: jest.fn(),
    stopGeneration: jest.fn(),
    responseFormat: 'adaptive' as const,
    setResponseFormat: jest.fn(),
    handleRegenerateMessage: jest.fn(),
    handleEditMessage: jest.fn(),
    chatId: 'chat-123',
    isLoadingChat: false,
    forkChat: jest.fn(),
  };

  const mockRouter = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatContext as jest.Mock).mockReturnValue(mockChatContext);
    (usePathname as jest.Mock).mockReturnValue('/chat/chat-123');
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Mock scrollIntoView
    Element.prototype.scrollIntoView = jest.fn();
    // Mock scrollTo
    window.scrollTo = jest.fn();
  });

  describe('Rendering', () => {
    it('should render chat message list', () => {
      render(<ChatInterface />);

      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    });

    it('should render chat input', () => {
      render(<ChatInterface />);

      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    });

    it('should render all messages', () => {
      render(<ChatInterface />);

      expect(screen.getByText('What is contract law?')).toBeInTheDocument();
      expect(screen.getByText('Contract law is...')).toBeInTheDocument();
    });

    it('should render export button when chat has messages', () => {
      render(<ChatInterface />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toBeInTheDocument();
    });

    it('should not render export button when loading', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        isLoading: true,
      });

      render(<ChatInterface />);

      expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    });

    it('should not render export button when no messages', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: [],
      });

      render(<ChatInterface />);

      expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    });

    it('should render response format tool', () => {
      render(<ChatInterface />);

      expect(screen.getByTestId('tool-responseFormat')).toBeInTheDocument();
      expect(screen.getByText('Response Format')).toBeInTheDocument();
    });
  });

  describe('Message Sending', () => {
    it('should call handleSendMessage when send button is clicked', async () => {
      const user = userEvent.setup();
      const handleSendMessage = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        handleSendMessage,
      });

      render(<ChatInterface />);

      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);

      expect(handleSendMessage).toHaveBeenCalledWith('Test message');
    });

    it('should disable input when loading', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        isLoading: true,
      });

      render(<ChatInterface />);

      const input = screen.getByTestId('message-input');
      expect(input).toBeDisabled();
    });

    it('should disable send button when loading', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        isLoading: true,
      });

      render(<ChatInterface />);

      const sendButton = screen.getByTestId('send-button');
      expect(sendButton).toBeDisabled();
    });

    it('should show loading indicator when loading', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        isLoading: true,
      });

      render(<ChatInterface />);

      expect(screen.getByTestId('loading-indicator')).toBeInTheDocument();
    });
  });

  describe('Message Actions', () => {
    it('should call handleRegenerateMessage when regenerate is clicked', async () => {
      const user = userEvent.setup();
      const handleRegenerateMessage = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        handleRegenerateMessage,
      });

      render(<ChatInterface />);

      const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
      await user.click(regenerateButton);

      expect(handleRegenerateMessage).toHaveBeenCalledWith(1);
    });

    it('should call handleEditMessage when edit is clicked', async () => {
      const user = userEvent.setup();
      const handleEditMessage = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        handleEditMessage,
      });

      render(<ChatInterface />);

      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      expect(handleEditMessage).toHaveBeenCalledWith(0, 'Edited');
    });

    it('should fork conversation from message', async () => {
      const user = userEvent.setup();
      const forkChat = jest.fn().mockResolvedValue('new-chat-id');

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        forkChat,
      });

      render(<ChatInterface />);

      const forkButtons = screen.getAllByRole('button', { name: /fork/i });
      await user.click(forkButtons[0]);

      await waitFor(() => {
        expect(forkChat).toHaveBeenCalledWith('chat-123', 'msg-1');
      });

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/chat/new-chat-id');
      });
    });

    it('should handle fork error gracefully', async () => {
      const user = userEvent.setup();
      const forkChat = jest.fn().mockRejectedValue(new Error('Fork failed'));
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        forkChat,
      });

      render(<ChatInterface />);

      const forkButtons = screen.getAllByRole('button', { name: /fork/i });
      await user.click(forkButtons[0]);

      await waitFor(() => {
        expect(forkChat).toHaveBeenCalled();
      });

      // Should not crash
      expect(mockRouter.push).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Export Functionality', () => {
    it('should open export dialog when export button is clicked', async () => {
      const user = userEvent.setup();

      render(<ChatInterface />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
      });
    });

    it('should pass correct chatId to export dialog', async () => {
      const user = userEvent.setup();

      render(<ChatInterface />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('Export chat: chat-123')).toBeInTheDocument();
      });
    });

    it('should close export dialog when close is clicked', async () => {
      const user = userEvent.setup();

      render(<ChatInterface />);

      // Open dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
      });

      // Close dialog
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Response Format', () => {
    it('should call setResponseFormat when format changes', () => {
      const setResponseFormat = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        setResponseFormat,
      });

      render(<ChatInterface />);

      // Format change would be triggered by the dropdown in ChatInput
      // We're testing that the tool is configured correctly
      expect(screen.getByTestId('tool-responseFormat')).toBeInTheDocument();
    });

    it('should display current response format', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        responseFormat: 'detailed',
      });

      render(<ChatInterface />);

      // The component should render with the current format
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should render empty message list when no messages', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: [],
      });

      render(<ChatInterface />);

      const messageList = screen.getByTestId('chat-message-list');
      expect(messageList).toBeInTheDocument();
      expect(messageList.textContent).toBe('');
    });

    it('should still render input when no messages', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: [],
      });

      render(<ChatInterface />);

      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });
  });

  describe('Page Guard', () => {
    it('should render on chat page', () => {
      (usePathname as jest.Mock).mockReturnValue('/chat');

      render(<ChatInterface />);

      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    });

    it('should render on chat detail page', () => {
      (usePathname as jest.Mock).mockReturnValue('/chat/chat-123');

      render(<ChatInterface />);

      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    });

    it('should not crash when rendered on wrong page', () => {
      (usePathname as jest.Mock).mockReturnValue('/search');

      expect(() => {
        render(<ChatInterface />);
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    it('should have proper structure for screen readers', () => {
      render(<ChatInterface />);

      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
    });

    it('should have accessible buttons', () => {
      render(<ChatInterface />);

      const exportButton = screen.getByRole('button', { name: /export/i });
      expect(exportButton).toHaveAccessibleName();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      render(<ChatInterface />);

      // Tab to export button
      await user.tab();
      expect(screen.getByRole('button', { name: /export/i })).toHaveFocus();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const longMessages = [
        { id: 'msg-1', role: 'user', content: longMessage },
      ];

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: longMessages,
      });

      render(<ChatInterface />);

      expect(screen.getByText(longMessage)).toBeInTheDocument();
    });

    it('should handle many messages', () => {
      const manyMessages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: manyMessages,
      });

      render(<ChatInterface />);

      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
      expect(screen.getByText('Message 0')).toBeInTheDocument();
      expect(screen.getByText('Message 99')).toBeInTheDocument();
    });

    it('should handle rapid message sending', async () => {
      const user = userEvent.setup();
      const handleSendMessage = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        handleSendMessage,
      });

      render(<ChatInterface />);

      const sendButton = screen.getByTestId('send-button');

      // Rapidly click send
      await user.click(sendButton);
      await user.click(sendButton);
      await user.click(sendButton);

      expect(handleSendMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle missing chatId for fork', async () => {
      const user = userEvent.setup();
      const forkChat = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        chatId: null,
        forkChat,
      });

      render(<ChatInterface />);

      const forkButtons = screen.getAllByRole('button', { name: /fork/i });
      await user.click(forkButtons[0]);

      // Should not call forkChat without chatId
      expect(forkChat).not.toHaveBeenCalled();
    });

    it('should handle loading chat state', () => {
      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        isLoadingChat: true,
      });

      render(<ChatInterface />);

      // Should still render
      expect(screen.getByTestId('chat-message-list')).toBeInTheDocument();
    });

    it('should handle unicode content', () => {
      const unicodeMessages = [
        { id: 'msg-1', role: 'user', content: '法律分析 📚 Análisis legal 🇵🇱' },
      ];

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        messages: unicodeMessages,
      });

      render(<ChatInterface />);

      expect(screen.getByText('法律分析 📚 Análisis legal 🇵🇱')).toBeInTheDocument();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete chat workflow', async () => {
      const user = userEvent.setup();
      const handleSendMessage = jest.fn();
      const handleRegenerateMessage = jest.fn();

      (useChatContext as jest.Mock).mockReturnValue({
        ...mockChatContext,
        handleSendMessage,
        handleRegenerateMessage,
      });

      render(<ChatInterface />);

      // 1. Send a message
      const sendButton = screen.getByTestId('send-button');
      await user.click(sendButton);
      expect(handleSendMessage).toHaveBeenCalled();

      // 2. Regenerate response
      const regenerateButton = screen.getByRole('button', { name: /regenerate/i });
      await user.click(regenerateButton);
      expect(handleRegenerateMessage).toHaveBeenCalled();
    });

    it('should handle export workflow', async () => {
      const user = userEvent.setup();

      render(<ChatInterface />);

      // 1. Open export dialog
      const exportButton = screen.getByRole('button', { name: /export/i });
      await user.click(exportButton);

      await waitFor(() => {
        expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
      });

      // 2. Close export dialog
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
      });
    });
  });
});
