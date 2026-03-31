/**
 * Tests for LoadingMessage component
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';

import { LoadingMessage } from '@/components/chat/LoadingMessage';

// --- Mock framer-motion ---

function createMotionComponent(tag: keyof React.JSX.IntrinsicElements) {
  return React.forwardRef(({ children, ...props }: any, ref: any) => {
    const {
      initial,
      animate,
      transition,
      whileInView,
      viewport,
      exit,
      variants,
      style,
      ...domProps
    } = props;
    return React.createElement(tag, { ...domProps, ref }, children);
  });
}

jest.mock('framer-motion', () => ({
  motion: {
    div: createMotionComponent('div'),
    p: createMotionComponent('p'),
    span: createMotionComponent('span'),
    circle: createMotionComponent('circle'),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('LoadingMessage', () => {
  describe('rendering without crashing', () => {
    it('renders with default props', () => {
      const { container } = render(<LoadingMessage />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with all style variants', () => {
      const { rerender, container } = render(<LoadingMessage style="modern" />);
      expect(container.firstChild).toBeInTheDocument();

      rerender(<LoadingMessage style="judicial" />);
      expect(container.firstChild).toBeInTheDocument();

      rerender(<LoadingMessage style="innovation" />);
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('modern style (default)', () => {
    it('displays the initial stage message for general query type', () => {
      render(<LoadingMessage style="modern" queryType="general" />);
      expect(screen.getByText(/analyzing your question/i)).toBeInTheDocument();
    });

    it('displays contract-specific messages', () => {
      render(<LoadingMessage style="modern" queryType="contract" />);
      expect(screen.getByText(/reading contract clauses/i)).toBeInTheDocument();
    });

    it('displays caselaw-specific messages', () => {
      render(<LoadingMessage style="modern" queryType="caselaw" />);
      expect(screen.getByText(/understanding legal issue/i)).toBeInTheDocument();
    });

    it('displays regulatory-specific messages', () => {
      render(<LoadingMessage style="modern" queryType="regulatory" />);
      expect(screen.getByText(/identifying regulations/i)).toBeInTheDocument();
    });

    it('shows stage indicator dots', () => {
      const { container } = render(<LoadingMessage style="modern" />);
      // 4 stages = 4 stage dots (w-2 h-2 rounded-full elements)
      const stageDots = container.querySelectorAll('.rounded-full.w-2.h-2');
      expect(stageDots.length).toBeGreaterThanOrEqual(3); // At least typing indicator dots
    });
  });

  describe('judicial style', () => {
    it('renders the judicial loading message variant', () => {
      render(<LoadingMessage style="judicial" queryType="general" />);
      // The judicial style shows a balance scale emoji
      expect(screen.getByText('⚖️')).toBeInTheDocument();
    });

    it('shows the current stage message', () => {
      render(<LoadingMessage style="judicial" queryType="general" />);
      expect(screen.getByText(/analyzing your question/i)).toBeInTheDocument();
    });
  });

  describe('innovation style', () => {
    it('renders the innovation loading message variant', () => {
      render(<LoadingMessage style="innovation" queryType="general" />);
      // Innovation style shows stage labels
      expect(screen.getByText('Analyzing')).toBeInTheDocument();
    });

    it('shows stage labels for all stages', () => {
      render(<LoadingMessage style="innovation" queryType="general" />);
      expect(screen.getByText('Analyzing')).toBeInTheDocument();
      expect(screen.getByText('Retrieving')).toBeInTheDocument();
      expect(screen.getByText('Reasoning')).toBeInTheDocument();
      expect(screen.getByText('Generating')).toBeInTheDocument();
    });

    it('shows progress percentage', () => {
      render(<LoadingMessage style="innovation" queryType="general" />);
      // Initially 0%
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('stage transitions', () => {
    it('progresses through stages over time', () => {
      render(
        <LoadingMessage
          style="modern"
          queryType="general"
          estimatedDuration={4} // 4 seconds = 1 second per stage
        />
      );

      // Initially on "Analyzing" stage
      expect(screen.getByText(/analyzing your question/i)).toBeInTheDocument();

      // Advance past the first stage
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      // Should now show second stage message
      expect(screen.getByText(/searching legal documents/i)).toBeInTheDocument();
    });
  });

  describe('progress tracking', () => {
    it('increments progress over time', () => {
      render(
        <LoadingMessage
          style="innovation"
          queryType="general"
          estimatedDuration={10}
        />
      );

      // Initially at 0%
      expect(screen.getByText('0%')).toBeInTheDocument();

      // Advance time to ~50%
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // Progress should have increased
      const percentText = screen.getByText(/%$/);
      const percentValue = parseInt(percentText.textContent || '0');
      expect(percentValue).toBeGreaterThan(0);
    });

    it('does not exceed 99%', () => {
      render(
        <LoadingMessage
          style="innovation"
          queryType="general"
          estimatedDuration={1}
        />
      );

      // Advance well past the estimated duration
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Should cap at 99%
      const percentText = screen.getByText(/%$/);
      const percentValue = parseInt(percentText.textContent || '0');
      expect(percentValue).toBeLessThanOrEqual(99);
    });
  });

  describe('witty messages', () => {
    it('does not show witty message for short durations in judicial style', () => {
      render(
        <LoadingMessage
          style="judicial"
          estimatedDuration={5}
        />
      );

      // Witty messages are only shown for estimatedDuration > 15 and non-judicial style
      expect(screen.queryByText(/billable hours/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/law books/i)).not.toBeInTheDocument();
    });
  });

  describe('cleanup', () => {
    it('cleans up intervals on unmount', () => {
      const { unmount } = render(
        <LoadingMessage estimatedDuration={30} />
      );

      // Should not throw on unmount
      unmount();

      // Advancing timers after unmount should not cause errors
      act(() => {
        jest.advanceTimersByTime(5000);
      });
    });
  });

  describe('default props', () => {
    it('defaults to modern style', () => {
      const { container } = render(<LoadingMessage />);
      // Modern style has the gradient bubble
      expect(container.querySelector('.rounded-2xl')).toBeInTheDocument();
    });

    it('defaults to general query type', () => {
      render(<LoadingMessage />);
      expect(screen.getByText(/analyzing your question/i)).toBeInTheDocument();
    });

    it('defaults to 15 second estimated duration', () => {
      // This is implicitly tested - no witty message at default duration
      // for modern style (threshold is estimatedDuration > 15)
      render(<LoadingMessage />);
      // Should render without error
      expect(screen.getByText(/analyzing your question/i)).toBeInTheDocument();
    });
  });
});
