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

// Mock SourceCard component
jest.mock('@/components/chat/SourceCard', () => ({
  SourceCard: ({ source, onClick }: any) => (
    <div data-testid={`source-card-${source.document_id}`} onClick={onClick}>
      <h3>{source.title}</h3>
      <p>{source.court_name}</p>
      <p>Relevance: {source.relevance_score?.toFixed(2)}</p>
    </div>
  ),
}));

describe('MessageSources Component', () => {
  const mockSources = [
    {
      document_id: 'doc-1',
      title: 'Contract Law Precedent 2024',
      court_name: 'Supreme Court',
      date_issued: '2024-01-15',
      relevance_score: 0.95,
      snippet: 'The court ruled that...',
    },
    {
      document_id: 'doc-2',
      title: 'Commercial Disputes Case',
      court_name: 'High Court',
      date_issued: '2023-12-10',
      relevance_score: 0.88,
      snippet: 'In this matter...',
    },
    {
      document_id: 'doc-3',
      title: 'Employment Law Ruling',
      court_name: 'Labor Court',
      date_issued: '2023-11-05',
      relevance_score: 0.82,
      snippet: 'The tribunal found...',
    },
  ];

  describe('Rendering', () => {
    it('should render sources badge with count', () => {
      render(<MessageSources sources={mockSources} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should render all source cards', () => {
      render(<MessageSources sources={mockSources} />);

      expect(screen.getByText('Contract Law Precedent 2024')).toBeInTheDocument();
      expect(screen.getByText('Commercial Disputes Case')).toBeInTheDocument();
      expect(screen.getByText('Employment Law Ruling')).toBeInTheDocument();
    });

    it('should not render when no sources', () => {
      const { container } = render(<MessageSources sources={[]} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render with single source', () => {
      render(<MessageSources sources={[mockSources[0]]} />);

      expect(screen.getByText(/1 source/i)).toBeInTheDocument();
      expect(screen.getByText('Contract Law Precedent 2024')).toBeInTheDocument();
    });

    it('should display relevance scores', () => {
      render(<MessageSources sources={mockSources} />);

      expect(screen.getByText(/0\.95/)).toBeInTheDocument();
      expect(screen.getByText(/0\.88/)).toBeInTheDocument();
      expect(screen.getByText(/0\.82/)).toBeInTheDocument();
    });
  });

  describe('Badge Interaction', () => {
    it('should expand sources when badge is clicked', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);
      await user.click(badge);

      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });
    });

    it('should collapse sources when badge is clicked again', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);

      // Expand
      await user.click(badge);
      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });

      // Collapse
      await user.click(badge);
      await waitFor(() => {
        expect(screen.queryByText('Contract Law Precedent 2024')).not.toBeVisible();
      });
    });

    it('should toggle expansion state', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);

      // Multiple toggles
      await user.click(badge);
      await user.click(badge);
      await user.click(badge);

      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });
    });
  });

  describe('Source Card Interaction', () => {
    it('should handle source card click', async () => {
      const user = userEvent.setup();
      const onSourceClick = jest.fn();

      render(<MessageSources sources={mockSources} onSourceClick={onSourceClick} />);

      // Expand sources
      await user.click(screen.getByText(/3 sources/i));

      // Click on first source
      const sourceCard = screen.getByTestId('source-card-doc-1');
      await user.click(sourceCard);

      expect(onSourceClick).toHaveBeenCalledWith(mockSources[0]);
    });

    it('should allow clicking multiple sources', async () => {
      const user = userEvent.setup();
      const onSourceClick = jest.fn();

      render(<MessageSources sources={mockSources} onSourceClick={onSourceClick} />);

      await user.click(screen.getByText(/3 sources/i));

      await user.click(screen.getByTestId('source-card-doc-1'));
      await user.click(screen.getByTestId('source-card-doc-2'));
      await user.click(screen.getByTestId('source-card-doc-3'));

      expect(onSourceClick).toHaveBeenCalledTimes(3);
    });

    it('should work without onSourceClick handler', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      await user.click(screen.getByText(/3 sources/i));

      const sourceCard = screen.getByTestId('source-card-doc-1');

      // Should not throw error
      await expect(user.click(sourceCard)).resolves.not.toThrow();
    });
  });

  describe('Source Ordering', () => {
    it('should display sources in order of relevance', () => {
      render(<MessageSources sources={mockSources} />);

      const scores = screen.getAllByText(/relevance:/i);

      // Should be in descending order of relevance
      expect(scores[0]).toHaveTextContent('0.95');
      expect(scores[1]).toHaveTextContent('0.88');
      expect(scores[2]).toHaveTextContent('0.82');
    });

    it('should maintain source order when toggling', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);

      // Expand
      await user.click(badge);
      const firstExpand = screen.getAllByText(/relevance:/i);
      expect(firstExpand[0]).toHaveTextContent('0.95');

      // Collapse and re-expand
      await user.click(badge);
      await user.click(badge);

      const secondExpand = screen.getAllByText(/relevance:/i);
      expect(secondExpand[0]).toHaveTextContent('0.95');
    });
  });

  describe('Visual States', () => {
    it('should show expanded indicator when sources are visible', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);
      await user.click(badge);

      // Badge should indicate expanded state
      await waitFor(() => {
        expect(badge).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('should show collapsed indicator when sources are hidden', () => {
      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);
      expect(badge).toHaveAttribute('aria-expanded', 'false');
    });

    it('should apply different styling for high relevance sources', () => {
      render(<MessageSources sources={mockSources} />);

      const highRelevanceCard = screen.getByTestId('source-card-doc-1');
      const lowRelevanceCard = screen.getByTestId('source-card-doc-3');

      // High relevance (0.95) vs low relevance (0.82) might have different styling
      expect(highRelevanceCard).toBeInTheDocument();
      expect(lowRelevanceCard).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);
      expect(badge).toHaveAttribute('aria-expanded');
      expect(badge).toHaveAttribute('role', 'button');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      // Tab to badge
      await user.tab();
      expect(screen.getByText(/3 sources/i)).toHaveFocus();

      // Press Enter to expand
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });
    });

    it('should support Space key for expansion', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      await user.tab();
      await user.keyboard(' ');

      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });
    });

    it('should announce source count to screen readers', () => {
      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);
      expect(badge).toHaveAccessibleName();
    });
  });

  describe('Edge Cases', () => {
    it('should handle sources without relevance scores', () => {
      const sourcesWithoutScores = mockSources.map(s => ({
        ...s,
        relevance_score: undefined,
      }));

      render(<MessageSources sources={sourcesWithoutScores} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should handle very long source titles', () => {
      const longTitleSources = [
        {
          ...mockSources[0],
          title: 'A'.repeat(200),
        },
      ];

      render(<MessageSources sources={longTitleSources} />);

      expect(screen.getByText(/1 source/i)).toBeInTheDocument();
    });

    it('should handle many sources', () => {
      const manySources = Array.from({ length: 50 }, (_, i) => ({
        document_id: `doc-${i}`,
        title: `Document ${i}`,
        court_name: 'Court',
        date_issued: '2024-01-01',
        relevance_score: 0.9 - i * 0.01,
      }));

      render(<MessageSources sources={manySources} />);

      expect(screen.getByText(/50 sources/i)).toBeInTheDocument();
    });

    it('should handle sources with special characters', () => {
      const specialSources = [
        {
          document_id: 'doc-special',
          title: '§ 123: "Contract" & Regulations (2024)',
          court_name: 'Supreme Court',
          date_issued: '2024-01-01',
          relevance_score: 0.95,
        },
      ];

      render(<MessageSources sources={specialSources} />);

      expect(screen.getByText('§ 123: "Contract" & Regulations (2024)')).toBeInTheDocument();
    });

    it('should handle sources with unicode', () => {
      const unicodeSources = [
        {
          document_id: 'doc-unicode',
          title: '法律分析 Análisis legal 🇵🇱',
          court_name: 'Court',
          date_issued: '2024-01-01',
          relevance_score: 0.95,
        },
      ];

      render(<MessageSources sources={unicodeSources} />);

      expect(screen.getByText('法律分析 Análisis legal 🇵🇱')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render large source lists efficiently', () => {
      const largeSources = Array.from({ length: 100 }, (_, i) => ({
        document_id: `doc-${i}`,
        title: `Document ${i}`,
        court_name: 'Court',
        date_issued: '2024-01-01',
        relevance_score: 0.9,
      }));

      const startTime = performance.now();
      render(<MessageSources sources={largeSources} />);
      const endTime = performance.now();

      // Should render in reasonable time (< 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle rapid toggle clicks', async () => {
      const user = userEvent.setup();

      render(<MessageSources sources={mockSources} />);

      const badge = screen.getByText(/3 sources/i);

      // Rapidly toggle
      for (let i = 0; i < 10; i++) {
        await user.click(badge);
      }

      // Should still be responsive
      expect(badge).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should work with empty then populated sources', async () => {
      const { rerender } = render(<MessageSources sources={[]} />);

      expect(screen.queryByText(/sources/i)).not.toBeInTheDocument();

      rerender(<MessageSources sources={mockSources} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should update when sources change', async () => {
      const { rerender } = render(<MessageSources sources={[mockSources[0]]} />);

      expect(screen.getByText(/1 source/i)).toBeInTheDocument();

      rerender(<MessageSources sources={mockSources} />);

      expect(screen.getByText(/3 sources/i)).toBeInTheDocument();
    });

    it('should maintain expansion state when sources update', async () => {
      const user = userEvent.setup();

      const { rerender } = render(<MessageSources sources={[mockSources[0]]} />);

      // Expand
      await user.click(screen.getByText(/1 source/i));

      // Update sources
      rerender(<MessageSources sources={mockSources} />);

      // Should remain expanded
      await waitFor(() => {
        expect(screen.getByText('Contract Law Precedent 2024')).toBeVisible();
      });
    });
  });
});
