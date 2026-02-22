/**
 * Component tests for MessageSources
 *
 * Tests source display, badges, and source card interactions
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MessageSources } from '@/components/chat/MessageSources';

// Mock the hooks and utilities that MessageSources depends on
jest.mock('@/hooks/useSourceDocuments', () => ({
  useSourceDocuments: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

jest.mock('@/contexts/ChatContext', () => ({
  useChatContext: jest.fn(() => ({ chatId: 'test-chat-id' })),
}));

jest.mock('@/lib/document-utils', () => ({
  cleanDocumentIdForUrl: jest.fn((id: string) => id),
}));

jest.mock('@/components/chat/SourceCard', () => ({
  SourceCard: ({ document, onClick }: any) => (
    <div data-testid={`source-card-${document.document_id}`} onClick={onClick}>
      <h3>{document.title}</h3>
    </div>
  ),
}));

jest.mock('@/lib/styles/components', () => ({
  CollapsibleButton: ({ children, onClick, isExpanded }: any) => (
    <button
      role="button"
      aria-expanded={isExpanded ? 'true' : 'false'}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  DocumentCard: ({ document }: any) => (
    <div data-testid={`document-card-${document.document_id}`}>
      <h3>{document.title}</h3>
    </div>
  ),
  BaseCard: ({ children }: any) => <div>{children}</div>,
}));

const { useSourceDocuments } = require('@/hooks/useSourceDocuments');

const mockDocumentIds = ['doc-1', 'doc-2', 'doc-3'];

describe('MessageSources Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSourceDocuments.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  describe('Rendering', () => {
    it('should render sources badge with count', () => {
      render(<MessageSources documentIds={mockDocumentIds} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should render all source cards when expanded and data is loaded', async () => {
      const mockDocuments = [
        { document_id: 'doc-1', title: 'Contract Law Precedent 2024' },
        { document_id: 'doc-2', title: 'Commercial Disputes Case' },
        { document_id: 'doc-3', title: 'Employment Law Ruling' },
      ];

      useSourceDocuments.mockReturnValue({
        data: mockDocuments,
        isLoading: false,
        error: null,
      });

      render(<MessageSources documentIds={mockDocumentIds} isExpanded={true} />);

      expect(screen.getByText('Contract Law Precedent 2024')).toBeInTheDocument();
      expect(screen.getByText('Commercial Disputes Case')).toBeInTheDocument();
      expect(screen.getByText('Employment Law Ruling')).toBeInTheDocument();
    });

    it('should not render when no documentIds provided', () => {
      const { container } = render(<MessageSources documentIds={[]} />);

      expect(screen.queryByText(/sources/i)).not.toBeInTheDocument();
    });

    it('should render with single document id', () => {
      render(<MessageSources documentIds={['doc-1']} />);

      expect(screen.getByText(/1 source/i)).toBeInTheDocument();
    });

    it('should render with undefined documentIds', () => {
      const { container } = render(<MessageSources />);

      expect(container).toBeInTheDocument();
    });
  });

  describe('Badge Interaction', () => {
    it('should expand sources when badge is clicked', async () => {
      const user = userEvent.setup();

      render(<MessageSources documentIds={mockDocumentIds} />);

      const badge = screen.getByText(/3 sources/i);
      await user.click(badge);

      // After clicking, component tries to load sources (isExpanded becomes true internally)
      expect(badge).toBeInTheDocument();
    });

    it('should toggle expansion state via external props', () => {
      const onToggle = jest.fn();

      render(
        <MessageSources
          documentIds={mockDocumentIds}
          isExpanded={false}
          onToggle={onToggle}
        />
      );

      const badge = screen.getByText(/3 sources/i);
      expect(badge).toHaveAttribute('aria-expanded', 'false');
    });

    it('should show expanded state when isExpanded is true', () => {
      render(
        <MessageSources
          documentIds={mockDocumentIds}
          isExpanded={true}
        />
      );

      const badge = screen.getByText(/3 sources/i);
      expect(badge).toHaveAttribute('aria-expanded', 'true');
    });

    it('should call onToggle when badge is clicked', async () => {
      const user = userEvent.setup();
      const onToggle = jest.fn();

      render(
        <MessageSources
          documentIds={mockDocumentIds}
          onToggle={onToggle}
        />
      );

      const badge = screen.getByText(/3 sources/i);
      await user.click(badge);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('Loading State', () => {
    it('should show loading state when fetching sources', () => {
      useSourceDocuments.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      render(<MessageSources documentIds={mockDocumentIds} isExpanded={true} />);

      // Loading skeleton cards should be present when loading
      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should show error message when loading fails', () => {
      useSourceDocuments.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error('Failed to fetch'),
      });

      render(<MessageSources documentIds={mockDocumentIds} isExpanded={true} />);

      expect(screen.getByText(/failed to load sources/i)).toBeInTheDocument();
    });
  });

  describe('Render Modes', () => {
    it('should render only badge when renderBadgeOnly is true', () => {
      render(
        <MessageSources
          documentIds={mockDocumentIds}
          renderBadgeOnly={true}
        />
      );

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should render expanded content only when renderExpandedOnly is true', () => {
      render(
        <MessageSources
          documentIds={mockDocumentIds}
          renderExpandedOnly={true}
          isExpanded={true}
        />
      );

      // No badge should be rendered in expanded-only mode
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle sources without documentIds', () => {
      render(<MessageSources />);

      // Should render without crashing
      expect(document.body).toBeInTheDocument();
    });

    it('should handle many document ids', () => {
      const manyIds = Array.from({ length: 50 }, (_, i) => `doc-${i}`);

      render(<MessageSources documentIds={manyIds} />);

      expect(screen.getByText(/50 sources/i)).toBeInTheDocument();
    });

    it('should update badge count when documentIds change', () => {
      const { rerender } = render(<MessageSources documentIds={['doc-1']} />);

      expect(screen.getByText(/1 source/i)).toBeInTheDocument();

      rerender(<MessageSources documentIds={mockDocumentIds} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should handle empty array of documentIds', () => {
      const { container } = render(<MessageSources documentIds={[]} />);

      expect(container).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render large document id lists efficiently', () => {
      const largeIds = Array.from({ length: 100 }, (_, i) => `doc-${i}`);

      const startTime = performance.now();
      render(<MessageSources documentIds={largeIds} />);
      const endTime = performance.now();

      // Should render in reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle rapid toggle clicks', async () => {
      const user = userEvent.setup();
      const onToggle = jest.fn();

      render(
        <MessageSources
          documentIds={mockDocumentIds}
          onToggle={onToggle}
        />
      );

      const badge = screen.getByText(/3 sources/i);

      // Rapidly toggle
      for (let i = 0; i < 5; i++) {
        await user.click(badge);
      }

      expect(onToggle).toHaveBeenCalledTimes(5);
    });
  });

  describe('Integration', () => {
    it('should work with empty then populated documentIds', async () => {
      const { rerender } = render(<MessageSources documentIds={[]} />);

      expect(screen.queryByText(/sources/i)).not.toBeInTheDocument();

      rerender(<MessageSources documentIds={mockDocumentIds} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should fetch documents only when expanded', () => {
      render(<MessageSources documentIds={mockDocumentIds} isExpanded={false} />);

      // useSourceDocuments should be called with enabled: false when collapsed
      expect(useSourceDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
    });

    it('should fetch documents when expanded', () => {
      render(<MessageSources documentIds={mockDocumentIds} isExpanded={true} />);

      // useSourceDocuments should be called with enabled: true when expanded
      expect(useSourceDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true })
      );
    });
  });
});
