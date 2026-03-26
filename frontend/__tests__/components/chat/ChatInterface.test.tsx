/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatInterface } from '@/lib/styles/components/chat/chat-interface';

// Mock the ChatContext hook
jest.mock('@/contexts/ChatContext', () => ({
  useChatContext: () => ({
    messages: [],
    isLoading: false,
    fragments: [],
    messagesEndRef: { current: null },
    handleSendMessage: jest.fn(),
    stopGeneration: jest.fn(),
    responseFormat: 'adaptive',
    setResponseFormat: jest.fn(),
    handleRegenerateMessage: jest.fn(),
    handleEditMessage: jest.fn(),
    chatId: null,
    isLoadingChat: false,
    forkChat: jest.fn(),
  }),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/chat',
}));

// Mock ResizeObserver (used by auto-resize textarea)
beforeAll(() => {
  global.ResizeObserver = class {
    observe = jest.fn();
    unobserve = jest.fn();
    disconnect = jest.fn();
  };
});

describe('ChatInterface', () => {
  it('renders the chat input area', () => {
    render(<ChatInterface />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('renders without crashing when isLoadingChat is true', () => {
    const chatContextMock = jest.requireMock('@/contexts/ChatContext');
    const original = chatContextMock.useChatContext();
    jest.spyOn(chatContextMock, 'useChatContext').mockReturnValue({
      ...original,
      isLoadingChat: true,
    });

    const { container } = render(<ChatInterface />);

    // Should render the component (loading or content)
    expect(container.firstChild).not.toBeNull();
  });
});
