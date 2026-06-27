/**
 * @jest-environment jsdom
 *
 * Render tests for PrimaryButton (#144). Lock the component's behaviour after
 * removing the dead `enhancedHover` / `enhancedFocus` props (they were
 * destructured-but-ignored on PrimaryButton; SecondaryButton/IconButton keep
 * their working versions). Removing no-op props must not change what renders.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrimaryButton } from '@/lib/styles/components/primary-button';

describe('PrimaryButton', () => {
  it('renders its children inside a button by default', () => {
    render(<PrimaryButton>Search</PrimaryButton>);
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toBeInTheDocument();
    expect(button.tagName).toBe('BUTTON');
  });

  it('fires onClick when clicked', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<PrimaryButton onClick={onClick}>Go</PrimaryButton>);
    await user.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a link when href is provided', () => {
    render(<PrimaryButton href="/search">Search</PrimaryButton>);
    const link = screen.getByRole('link', { name: 'Search' });
    expect(link).toHaveAttribute('href', '/search');
  });

  it('shows loading text and disables while loading', () => {
    render(
      <PrimaryButton isLoading loadingText="Saving...">
        Save
      </PrimaryButton>,
    );
    expect(screen.getByText('Saving...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('still accepts enhancedActive (the one live enhancement prop)', () => {
    // Sanity: the surviving enhancement prop remains in the public API.
    render(<PrimaryButton enhancedActive>Press</PrimaryButton>);
    expect(screen.getByRole('button', { name: 'Press' })).toBeInTheDocument();
  });
});
