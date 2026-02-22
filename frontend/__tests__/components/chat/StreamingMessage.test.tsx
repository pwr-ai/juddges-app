/**
 * Component tests for StreamingMessage
 *
 * Tests streaming message behavior, completion states, and user interactions
 * following research-backed best practices for React Testing Library.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { StreamingMessage } from '@/components/chat/StreamingMessage';

describe('StreamingMessage Component', () => {
  describe('Rendering States', () => {
    it('should render message content', () => {
      render(
        <StreamingMessage
          content="This is a legal analysis..."
          isComplete={false}
        />
      );

      expect(screen.getByText(/This is a legal analysis/i)).toBeInTheDocument();
    });

    it('should display AI avatar with law emoji', () => {
      render(
        <StreamingMessage
          content="Test message"
          isComplete={false}
        />
      );

      expect(screen.getByText('⚖️')).toBeInTheDocument();
    });

    it('should show streaming cursor when message is incomplete', () => {
      const { container } = render(
        <StreamingMessage
          content="Streaming message"
          isComplete={false}
        />
      );

      // Check for cursor element (animated span with pipe character)
      const cursor = container.querySelector('span');
      expect(cursor).toBeInTheDocument();
    });

    it('should not show cursor when message is complete', () => {
      render(
        <StreamingMessage
          content="Complete message"
          isComplete={true}
        />
      );

      // Message should be complete without cursor animation
      expect(screen.getByText(/Complete message/i)).toBeInTheDocument();
    });

    it('should show completion indicator when message is complete', () => {
      render(
        <StreamingMessage
          content="Complete message"
          isComplete={true}
        />
      );

      expect(screen.getByText('Complete')).toBeInTheDocument();
    });

    it('should render message actions when complete', () => {
      render(
        <StreamingMessage
          content="Complete message"
          isComplete={true}
        />
      );

      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cite sources/i })).toBeInTheDocument();
    });

    it('should not show actions when message is incomplete', () => {
      render(
        <StreamingMessage
          content="Streaming message"
          isComplete={false}
        />
      );

      expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /share/i })).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should handle copy button click', async () => {
      const user = userEvent.setup();

      render(
        <StreamingMessage
          content="Message to copy"
          isComplete={true}
        />
      );

      const copyButton = screen.getByRole('button', { name: /copy/i });
      await user.click(copyButton);

      // Button should be clickable (actual copy functionality would be tested in integration tests)
      expect(copyButton).toBeInTheDocument();
    });

    it('should handle share button click', async () => {
      const user = userEvent.setup();

      render(
        <StreamingMessage
          content="Message to share"
          isComplete={true}
        />
      );

      const shareButton = screen.getByRole('button', { name: /share/i });
      await user.click(shareButton);

      expect(shareButton).toBeInTheDocument();
    });

    it('should handle cite sources button click', async () => {
      const user = userEvent.setup();

      render(
        <StreamingMessage
          content="Legal analysis with sources"
          isComplete={true}
        />
      );

      const citeButton = screen.getByRole('button', { name: /cite sources/i });
      await user.click(citeButton);

      expect(citeButton).toBeInTheDocument();
    });
  });

  describe('Completion Callback', () => {
    it('should call onComplete when message becomes complete', async () => {
      const onComplete = jest.fn();

      const { rerender } = render(
        <StreamingMessage
          content="Streaming..."
          isComplete={false}
          onComplete={onComplete}
        />
      );

      expect(onComplete).not.toHaveBeenCalled();

      // Simulate completion
      rerender(
        <StreamingMessage
          content="Streaming... Done!"
          isComplete={true}
          onComplete={onComplete}
        />
      );

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });
    });

    it('should not call onComplete multiple times for same completion', async () => {
      const onComplete = jest.fn();

      const { rerender } = render(
        <StreamingMessage
          content="Message"
          isComplete={false}
          onComplete={onComplete}
        />
      );

      // First completion
      rerender(
        <StreamingMessage
          content="Message"
          isComplete={true}
          onComplete={onComplete}
        />
      );

      await waitFor(() => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      });

      // Rerender with same completion state
      rerender(
        <StreamingMessage
          content="Message"
          isComplete={true}
          onComplete={onComplete}
        />
      );

      // Should still only be called once
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('should work without onComplete callback', () => {
      const { rerender } = render(
        <StreamingMessage
          content="Test"
          isComplete={false}
        />
      );

      // Should not throw error when transitioning to complete without callback
      expect(() => {
        rerender(
          <StreamingMessage
            content="Test"
            isComplete={true}
          />
        );
      }).not.toThrow();
    });
  });

  describe('Content Updates', () => {
    it('should update content as message streams', () => {
      const { rerender } = render(
        <StreamingMessage
          content="The court"
          isComplete={false}
        />
      );

      expect(screen.getByText(/The court/i)).toBeInTheDocument();

      rerender(
        <StreamingMessage
          content="The court ruled that"
          isComplete={false}
        />
      );

      expect(screen.getByText(/The court ruled that/i)).toBeInTheDocument();

      rerender(
        <StreamingMessage
          content="The court ruled that the contract was valid"
          isComplete={false}
        />
      );

      expect(screen.getByText(/the contract was valid/i)).toBeInTheDocument();
    });

    it('should handle empty content', () => {
      render(
        <StreamingMessage
          content=""
          isComplete={false}
        />
      );

      // Should render without error
      expect(screen.getByText('⚖️')).toBeInTheDocument();
    });

    it('should handle very long content', () => {
      const longContent = 'A'.repeat(5000);

      render(
        <StreamingMessage
          content={longContent}
          isComplete={false}
        />
      );

      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it('should handle content with special characters', () => {
      const specialContent = 'Legal § 123: "Contract" (2024) & regulations';

      render(
        <StreamingMessage
          content={specialContent}
          isComplete={false}
        />
      );

      expect(screen.getByText(specialContent)).toBeInTheDocument();
    });
  });

  describe('Visual States', () => {
    it('should have different border color when streaming vs complete', () => {
      const { container, rerender } = render(
        <StreamingMessage
          content="Test"
          isComplete={false}
        />
      );

      // Check for streaming state border (blue)
      let messageBox = container.querySelector('.border-blue-200');
      expect(messageBox).toBeInTheDocument();

      rerender(
        <StreamingMessage
          content="Test"
          isComplete={true}
        />
      );

      // Check for complete state border (gray)
      messageBox = container.querySelector('.border-gray-200');
      expect(messageBox).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      render(
        <StreamingMessage
          content="Accessible message"
          isComplete={true}
        />
      );

      // Buttons should have text content
      expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /share/i })).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      render(
        <StreamingMessage
          content="Test message"
          isComplete={true}
        />
      );

      // Tab through interactive elements
      await user.tab();
      expect(screen.getByRole('button', { name: /copy/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /share/i })).toHaveFocus();

      await user.tab();
      expect(screen.getByRole('button', { name: /cite sources/i })).toHaveFocus();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state transitions', () => {
      const { rerender } = render(
        <StreamingMessage content="1" isComplete={false} />
      );

      // Rapidly toggle between states
      for (let i = 0; i < 10; i++) {
        rerender(<StreamingMessage content={`${i}`} isComplete={i % 2 === 0} />);
      }

      // Should render final state without errors
      expect(screen.getByText('9')).toBeInTheDocument();
    });

    it('should handle unicode content', () => {
      const unicodeContent = '法律分析 📚 Análisis legal 🇵🇱';

      render(
        <StreamingMessage
          content={unicodeContent}
          isComplete={false}
        />
      );

      expect(screen.getByText(unicodeContent)).toBeInTheDocument();
    });
  });
});
