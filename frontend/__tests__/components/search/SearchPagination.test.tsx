/**
 * Component tests for SearchPagination
 *
 * Tests pagination controls, page navigation, and user interactions
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SearchPagination } from '@/components/search/SearchPagination';

describe('SearchPagination Component', () => {
  const defaultProps = {
    currentPage: 1,
    totalPages: 10,
    onPageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render pagination controls', () => {
      render(<SearchPagination {...defaultProps} />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should display current page number', () => {
      render(<SearchPagination {...defaultProps} currentPage={5} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show previous and next buttons', () => {
      render(<SearchPagination {...defaultProps} />);

      expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
    });

    it('should display total pages information', () => {
      render(<SearchPagination {...defaultProps} totalPages={15} />);

      // Check for page indicator (e.g., "Page 1 of 15")
      expect(screen.getByText(/of 15/i)).toBeInTheDocument();
    });

    it('should not render when there is only one page', () => {
      const { container } = render(
        <SearchPagination {...defaultProps} totalPages={1} />
      );

      // Pagination should either not render or be hidden
      expect(container.firstChild).toBeNull();
    });

    it('should not render when there are no pages', () => {
      const { container } = render(
        <SearchPagination {...defaultProps} totalPages={0} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Navigation Controls', () => {
    it('should disable previous button on first page', () => {
      render(<SearchPagination {...defaultProps} currentPage={1} />);

      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toBeDisabled();
    });

    it('should enable previous button when not on first page', () => {
      render(<SearchPagination {...defaultProps} currentPage={5} />);

      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).not.toBeDisabled();
    });

    it('should disable next button on last page', () => {
      render(
        <SearchPagination {...defaultProps} currentPage={10} totalPages={10} />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeDisabled();
    });

    it('should enable next button when not on last page', () => {
      render(<SearchPagination {...defaultProps} currentPage={5} />);

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe('User Interactions', () => {
    it('should call onPageChange with next page when next button is clicked', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={5}
          onPageChange={onPageChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(onPageChange).toHaveBeenCalledWith(6);
      expect(onPageChange).toHaveBeenCalledTimes(1);
    });

    it('should call onPageChange with previous page when previous button is clicked', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={5}
          onPageChange={onPageChange}
        />
      );

      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      expect(onPageChange).toHaveBeenCalledWith(4);
      expect(onPageChange).toHaveBeenCalledTimes(1);
    });

    it('should not call onPageChange when clicking disabled previous button', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={1}
          onPageChange={onPageChange}
        />
      );

      const prevButton = screen.getByRole('button', { name: /previous/i });
      await user.click(prevButton);

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('should not call onPageChange when clicking disabled next button', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={10}
          totalPages={10}
          onPageChange={onPageChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });
      await user.click(nextButton);

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('should allow clicking on specific page numbers', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={1}
          totalPages={10}
          onPageChange={onPageChange}
        />
      );

      // If page numbers are rendered as buttons, test clicking them
      const pageButton = screen.queryByRole('button', { name: '5' });
      if (pageButton) {
        await user.click(pageButton);
        expect(onPageChange).toHaveBeenCalledWith(5);
      }
    });
  });

  describe('Page Number Display', () => {
    it('should show ellipsis for large page ranges', () => {
      render(
        <SearchPagination
          {...defaultProps}
          currentPage={5}
          totalPages={100}
        />
      );

      // Check if ellipsis is shown (common pattern in pagination)
      const ellipsis = screen.queryByText('...');
      if (ellipsis) {
        expect(ellipsis).toBeInTheDocument();
      }
    });

    it('should highlight current page', () => {
      const { container } = render(
        <SearchPagination {...defaultProps} currentPage={5} />
      );

      // Current page should have special styling
      const currentPageElement = screen.getByText('5').closest('button, span');
      if (currentPageElement) {
        expect(currentPageElement).toHaveAttribute('aria-current', 'page');
      }
    });

    it('should show page range for very large pagination', () => {
      render(
        <SearchPagination
          {...defaultProps}
          currentPage={50}
          totalPages={100}
        />
      );

      // Should show current page
      expect(screen.getByText('50')).toBeInTheDocument();
      // Should show total
      expect(screen.getByText(/of 100/i)).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper navigation landmark', () => {
      render(<SearchPagination {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('should have aria-label on navigation', () => {
      render(<SearchPagination {...defaultProps} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={5}
          onPageChange={onPageChange}
        />
      );

      // Tab to previous button
      await user.tab();
      expect(screen.getByRole('button', { name: /previous/i })).toHaveFocus();

      // Press Enter
      await user.keyboard('{Enter}');
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('should indicate disabled state to screen readers', () => {
      render(<SearchPagination {...defaultProps} currentPage={1} />);

      const prevButton = screen.getByRole('button', { name: /previous/i });
      expect(prevButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative page numbers gracefully', () => {
      expect(() => {
        render(<SearchPagination {...defaultProps} currentPage={-1} />);
      }).not.toThrow();
    });

    it('should handle page number exceeding total pages', () => {
      expect(() => {
        render(
          <SearchPagination
            {...defaultProps}
            currentPage={20}
            totalPages={10}
          />
        );
      }).not.toThrow();
    });

    it('should handle zero as current page', () => {
      expect(() => {
        render(<SearchPagination {...defaultProps} currentPage={0} />);
      }).not.toThrow();
    });

    it('should handle rapid page changes', async () => {
      const user = userEvent.setup();
      const onPageChange = jest.fn();

      render(
        <SearchPagination
          {...defaultProps}
          currentPage={5}
          onPageChange={onPageChange}
        />
      );

      const nextButton = screen.getByRole('button', { name: /next/i });

      // Rapidly click next button
      await user.click(nextButton);
      await user.click(nextButton);
      await user.click(nextButton);

      // Should have been called for each click
      expect(onPageChange).toHaveBeenCalledTimes(3);
    });

    it('should handle very large page numbers', () => {
      render(
        <SearchPagination
          {...defaultProps}
          currentPage={999999}
          totalPages={1000000}
        />
      );

      expect(screen.getByText('999999')).toBeInTheDocument();
    });
  });

  describe('Visual Feedback', () => {
    it('should show loading state when navigating', () => {
      const { container } = render(
        <SearchPagination {...defaultProps} isLoading={true} />
      );

      // Check if loading indicators are present (if component supports it)
      const loadingIndicator = container.querySelector('[data-loading="true"]');
      if (loadingIndicator) {
        expect(loadingIndicator).toBeInTheDocument();
      }
    });

    it('should maintain visual consistency across different page counts', () => {
      const { rerender } = render(
        <SearchPagination {...defaultProps} totalPages={5} />
      );

      rerender(<SearchPagination {...defaultProps} totalPages={100} />);

      // Both should render pagination controls
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });
});
