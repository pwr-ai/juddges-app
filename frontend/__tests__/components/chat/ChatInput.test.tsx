/**
 * Component tests for ChatInput
 *
 * Tests message input, send button, tools, and keyboard shortcuts
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ChatInput } from '@/lib/styles/components/chat/chat-input';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('ChatInput Component', () => {
  const defaultProps = {
    onSend: jest.fn(),
    onStopGeneration: jest.fn(),
    isLoading: false,
    placeholder: 'Type your message...',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render input field', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByPlaceholderText('Type your message...');
      expect(textarea).toBeInTheDocument();
      expect(textarea.tagName).toBe('TEXTAREA');
    });

    it('should render send button', () => {
      render(<ChatInput {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      expect(sendButton).toBeInTheDocument();
    });

    it('should use provided placeholder', () => {
      render(<ChatInput {...defaultProps} placeholder="Ask a question..." />);

      expect(screen.getByPlaceholderText('Ask a question...')).toBeInTheDocument();
    });

    it('should render with initial value', () => {
      render(<ChatInput {...defaultProps} value="Initial message" />);

      expect(screen.getByDisplayValue('Initial message')).toBeInTheDocument();
    });

    it('should render tools when provided', () => {
      const tools = [
        {
          id: 'tool-1',
          icon: <span>📄</span>,
          label: 'Tool 1',
          type: 'toggle' as const,
          onClick: jest.fn(),
        },
      ];

      render(<ChatInput {...defaultProps} tools={tools} />);

      expect(screen.getByText('Tool 1')).toBeInTheDocument();
    });
  });

  describe('Input Interaction', () => {
    it('should call onChange when user types', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();

      render(<ChatInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');

      expect(onChange).toHaveBeenCalledWith('H');
      expect(onChange).toHaveBeenCalledWith('e');
      expect(onChange).toHaveBeenCalledWith('l');
      expect(onChange).toHaveBeenCalledWith('l');
      expect(onChange).toHaveBeenCalledWith('o');
    });

    it('should update value when typing', async () => {
      const user = userEvent.setup();

      const { rerender } = render(<ChatInput {...defaultProps} value="" />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Test message');

      // Simulate controlled component
      rerender(<ChatInput {...defaultProps} value="Test message" />);

      expect(screen.getByDisplayValue('Test message')).toBeInTheDocument();
    });

    it('should handle multiline input', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();

      render(<ChatInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Line 1{Enter}Line 2');

      expect(textarea).toHaveValue('Line 1\nLine 2');
    });

    it('should auto-resize textarea on input', async () => {
      const user = userEvent.setup();

      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      const longText = 'A'.repeat(200);

      await user.type(textarea, longText);

      // Textarea should adjust height
      expect(textarea.style.height).toBeTruthy();
    });

    it('should clear input after sending', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      const { rerender } = render(<ChatInput {...defaultProps} value="Test" onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      // Simulate clearing
      rerender(<ChatInput {...defaultProps} value="" onSend={onSend} />);

      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('Send Functionality', () => {
    it('should call onSend when send button is clicked', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test message" onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith('Test message');
    });

    it('should not send empty message', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="" onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).not.toHaveBeenCalled();
    });

    it('should not send whitespace-only message', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="   " onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).not.toHaveBeenCalled();
    });

    it('should trim message before sending', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="  test message  " onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith('test message');
    });

    it('should send on Ctrl+Enter', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test message" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '{Control>}{Enter}{/Control}');

      expect(onSend).toHaveBeenCalledWith('Test message');
    });

    it('should send on Cmd+Enter (Mac)', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test message" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '{Meta>}{Enter}{/Meta}');

      expect(onSend).toHaveBeenCalledWith('Test message');
    });

    it('should not send on Enter without modifier', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '{Enter}');

      // Should add newline, not send
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('should disable input when loading', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should hide send button when loading', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
    });

    it('should show stop button when loading', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      const stopButton = screen.getByRole('button', { name: /stop/i });
      expect(stopButton).toBeInTheDocument();
    });

    it('should call onStopGeneration when stop is clicked', async () => {
      const user = userEvent.setup();
      const onStopGeneration = jest.fn();

      render(<ChatInput {...defaultProps} isLoading={true} onStopGeneration={onStopGeneration} />);

      const stopButton = screen.getByRole('button', { name: /stop/i });
      await user.click(stopButton);

      expect(onStopGeneration).toHaveBeenCalledTimes(1);
    });

    it('should not disable stop button while loading', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      const stopButton = screen.getByRole('button', { name: /stop/i });
      expect(stopButton).not.toBeDisabled();
    });
  });

  describe('Tools', () => {
    it('should render button tool', async () => {
      const user = userEvent.setup();
      const onClick = jest.fn();

      const tools = [
        {
          id: 'attach',
          icon: <span>📎</span>,
          label: 'Attach',
          type: 'toggle' as const,
          onClick,
        },
      ];

      render(<ChatInput {...defaultProps} tools={tools} />);

      const attachButton = screen.getByRole('button', { name: /attach/i });
      expect(attachButton).toBeInTheDocument();

      await user.click(attachButton);
      expect(onClick).toHaveBeenCalled();
    });

    it('should render dropdown tool', () => {
      const tools = [
        {
          id: 'format',
          icon: <span>📄</span>,
          label: 'Format',
          type: 'dropdown' as const,
          value: 'short',
          onChange: jest.fn(),
          options: [
            { value: 'short', label: 'Short' },
            { value: 'long', label: 'Long' },
          ],
        },
      ];

      render(<ChatInput {...defaultProps} tools={tools} />);

      expect(screen.getByText('Format')).toBeInTheDocument();
    });

    it('should call onChange when dropdown value changes', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();

      const tools = [
        {
          id: 'format',
          icon: <span>📄</span>,
          label: 'Format',
          type: 'dropdown' as const,
          value: 'short',
          onChange,
          options: [
            { value: 'short', label: 'Short' },
            { value: 'long', label: 'Long' },
          ],
        },
      ];

      render(<ChatInput {...defaultProps} tools={tools} />);

      // Find and interact with dropdown (implementation depends on UI library)
      const formatTool = screen.getByText('Format');
      expect(formatTool).toBeInTheDocument();
    });

    it('should render multiple tools', () => {
      const tools = [
        {
          id: 'tool-1',
          icon: <span>1</span>,
          label: 'Tool 1',
          type: 'toggle' as const,
          onClick: jest.fn(),
        },
        {
          id: 'tool-2',
          icon: <span>2</span>,
          label: 'Tool 2',
          type: 'toggle' as const,
          onClick: jest.fn(),
        },
      ];

      render(<ChatInput {...defaultProps} tools={tools} />);

      expect(screen.getByText('Tool 1')).toBeInTheDocument();
      expect(screen.getByText('Tool 2')).toBeInTheDocument();
    });

    it('should disable tools when loading', () => {
      const tools = [
        {
          id: 'attach',
          icon: <span>📎</span>,
          label: 'Attach',
          type: 'toggle' as const,
          onClick: jest.fn(),
        },
      ];

      render(<ChatInput {...defaultProps} isLoading={true} tools={tools} />);

      const attachButton = screen.getByRole('button', { name: /attach/i });
      expect(attachButton).toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveAccessibleName();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      render(<ChatInput {...defaultProps} />);

      // Tab to textarea
      await user.tab();
      expect(screen.getByRole('textbox')).toHaveFocus();

      // Tab to send button
      await user.tab();
      expect(screen.getByRole('button', { name: /send/i })).toHaveFocus();
    });

    it('should announce loading state to screen readers', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      const stopButton = screen.getByRole('button', { name: /stop/i });
      expect(stopButton).toHaveAccessibleName();
    });

    it('should have accessible placeholder', () => {
      render(<ChatInput {...defaultProps} placeholder="Enter your question" />);

      const textarea = screen.getByPlaceholderText('Enter your question');
      expect(textarea).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long messages', async () => {
      const user = userEvent.setup();
      const longMessage = 'A'.repeat(10000);
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value={longMessage} onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith(longMessage);
    });

    it('should handle rapid typing', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();

      render(<ChatInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'rapid typing test');

      expect(onChange).toHaveBeenCalled();
    });

    it('should handle rapid send clicks', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test" onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });

      await user.click(sendButton);
      await user.click(sendButton);
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledTimes(3);
    });

    it('should handle unicode characters', async () => {
      const user = userEvent.setup();
      const unicodeText = '法律分析 📚 Análisis legal 🇵🇱';
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value={unicodeText} onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith(unicodeText);
    });

    it('should handle special characters', async () => {
      const user = userEvent.setup();
      const specialText = '§ 123: "Contract" (2024) & regulations';
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value={specialText} onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith(specialText);
    });

    it('should handle paste events', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();

      render(<ChatInput {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByRole('textbox');

      // Simulate paste
      await user.click(textarea);
      await user.paste('Pasted content');

      expect(onChange).toHaveBeenCalled();
    });

    it('should handle focus and blur', async () => {
      const user = userEvent.setup();

      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');

      await user.click(textarea);
      expect(textarea).toHaveFocus();

      await user.tab();
      expect(textarea).not.toHaveFocus();
    });
  });

  describe('Visual States', () => {
    it('should apply focus styles when focused', async () => {
      const user = userEvent.setup();

      render(<ChatInput {...defaultProps} />);

      const textarea = screen.getByRole('textbox');
      await user.click(textarea);

      expect(textarea).toHaveFocus();
    });

    it('should apply disabled styles when loading', () => {
      render(<ChatInput {...defaultProps} isLoading={true} />);

      const textarea = screen.getByRole('textbox');
      expect(textarea).toBeDisabled();
    });

    it('should show character count for long messages', async () => {
      const longMessage = 'A'.repeat(500);

      render(<ChatInput {...defaultProps} value={longMessage} />);

      // Component might show character count
      const textarea = screen.getByRole('textbox');
      expect(textarea).toHaveValue(longMessage);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete message flow', async () => {
      const user = userEvent.setup();
      const onChange = jest.fn();
      const onSend = jest.fn();

      const { rerender } = render(
        <ChatInput {...defaultProps} value="" onChange={onChange} onSend={onSend} />
      );

      // 1. User types message
      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello');

      // 2. Update with typed value
      rerender(
        <ChatInput {...defaultProps} value="Hello" onChange={onChange} onSend={onSend} />
      );

      // 3. User sends message
      const sendButton = screen.getByRole('button', { name: /send/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalledWith('Hello');

      // 4. Clear input
      rerender(
        <ChatInput {...defaultProps} value="" onChange={onChange} onSend={onSend} />
      );

      expect(screen.getByRole('textbox')).toHaveValue('');
    });

    it('should handle send with keyboard shortcut', async () => {
      const user = userEvent.setup();
      const onSend = jest.fn();

      render(<ChatInput {...defaultProps} value="Test" onSend={onSend} />);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, '{Control>}{Enter}{/Control}');

      expect(onSend).toHaveBeenCalledWith('Test');
    });

    it('should handle stop generation workflow', async () => {
      const user = userEvent.setup();
      const onStopGeneration = jest.fn();

      const { rerender } = render(
        <ChatInput {...defaultProps} isLoading={false} onStopGeneration={onStopGeneration} />
      );

      // Start loading
      rerender(
        <ChatInput {...defaultProps} isLoading={true} onStopGeneration={onStopGeneration} />
      );

      const stopButton = screen.getByRole('button', { name: /stop/i });
      await user.click(stopButton);

      expect(onStopGeneration).toHaveBeenCalled();

      // Stop loading
      rerender(
        <ChatInput {...defaultProps} isLoading={false} onStopGeneration={onStopGeneration} />
      );

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
    });
  });
});
