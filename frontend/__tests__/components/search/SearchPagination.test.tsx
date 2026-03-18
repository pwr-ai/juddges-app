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
    totalItems: 100,
    pageSize: 10,
    onPageChange: jest.fn(),
    onPageSizeChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the current range and page indicator from the shared pagination component', () => {
    render(<SearchPagination {...defaultProps} />);

    expect(screen.getByText('Showing 11–20 of 100')).toBeInTheDocument();
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });

  it('changes page with previous and next buttons', async () => {
    const user = userEvent.setup();
    const onPageChange = jest.fn();

    render(<SearchPagination {...defaultProps} onPageChange={onPageChange} />);

    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('disables buttons on the first and last page', () => {
    const { rerender } = render(<SearchPagination {...defaultProps} currentPage={1} />);

    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    rerender(<SearchPagination {...defaultProps} currentPage={10} totalPages={10} />);

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('changes page size through the shared select control', async () => {
    const user = userEvent.setup();
    const onPageSizeChange = jest.fn();

    render(<SearchPagination {...defaultProps} onPageSizeChange={onPageSizeChange} />);

    await user.selectOptions(screen.getByRole('combobox'), '20');

    expect(onPageSizeChange).toHaveBeenCalledWith(20);
  });
});
