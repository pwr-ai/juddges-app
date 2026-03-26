/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchPagination } from '@/components/search/SearchPagination';

describe('SearchPagination', () => {
  const defaultProps = {
    currentPage: 2,
    totalPages: 10,
    totalResults: 100,
    pageSize: 10,
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders navigation buttons and page numbers', () => {
    render(<SearchPagination {...defaultProps} />);

    expect(screen.getByLabelText('Previous page')).toBeInTheDocument();
    expect(screen.getByLabelText('Next page')).toBeInTheDocument();
    expect(screen.getByLabelText('First page')).toBeInTheDocument();
    expect(screen.getByLabelText('Last page')).toBeInTheDocument();
  });

  it('changes page with previous and next buttons', async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();

    render(<SearchPagination {...defaultProps} onPageChange={onPageChange} />);

    await user.click(screen.getByLabelText('Previous page'));
    await user.click(screen.getByLabelText('Next page'));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('disables buttons on the first and last page', () => {
    const { rerender } = render(<SearchPagination {...defaultProps} currentPage={1} />);

    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('First page')).toBeDisabled();

    rerender(<SearchPagination {...defaultProps} currentPage={10} totalPages={10} />);

    expect(screen.getByLabelText('Next page')).toBeDisabled();
    expect(screen.getByLabelText('Last page')).toBeDisabled();
  });

  it('renders nothing when there are no results', () => {
    const { container } = render(
      <SearchPagination {...defaultProps} totalResults={0} totalPages={0} />
    );

    expect(container.firstChild).toBeNull();
  });
});
