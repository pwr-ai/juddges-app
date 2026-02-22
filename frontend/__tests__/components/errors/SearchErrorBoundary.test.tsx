import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchErrorBoundary } from '@/components/errors/SearchErrorBoundary';

// Component that throws specific search errors
function ThrowSearchError({ errorType }: { errorType: 'network' | 'timeout' | 'generic' }) {
  const errorMessages = {
    network: 'Failed to fetch search results',
    timeout: 'Search request timeout',
    generic: 'Search error',
  };

  throw new Error(errorMessages[errorType]);
}

describe('SearchErrorBoundary', () => {
  // Suppress console.error for these tests
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <SearchErrorBoundary>
        <div>Search Results</div>
      </SearchErrorBoundary>
    );

    expect(screen.getByText('Search Results')).toBeInTheDocument();
  });

  it('displays network-specific error message for network errors', () => {
    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="network" />
      </SearchErrorBoundary>
    );

    expect(screen.getByText('Connection issue')).toBeInTheDocument();
    expect(screen.getByText(/check your internet connection/i)).toBeInTheDocument();
  });

  it('displays timeout-specific error message for timeout errors', () => {
    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="timeout" />
      </SearchErrorBoundary>
    );

    expect(screen.getByText('Search took too long')).toBeInTheDocument();
    expect(screen.getByText(/try simplifying your query/i)).toBeInTheDocument();
  });

  it('displays generic error message for other errors', () => {
    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="generic" />
      </SearchErrorBoundary>
    );

    expect(screen.getByText('Search temporarily unavailable')).toBeInTheDocument();
    expect(screen.getByText(/usually temporary/i)).toBeInTheDocument();
  });

  it('renders retry button', () => {
    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="generic" />
      </SearchErrorBoundary>
    );

    expect(screen.getByText('Retry search')).toBeInTheDocument();
  });

  it('shows error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="generic" />
      </SearchErrorBoundary>
    );

    expect(screen.getByText(/Error details.*development only/i)).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('calls console.error with search context when error occurs', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');

    render(
      <SearchErrorBoundary>
        <ThrowSearchError errorType="network" />
      </SearchErrorBoundary>
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    const errorCall = consoleErrorSpy.mock.calls.find((call) => call[0] === 'Search error:');
    expect(errorCall).toBeDefined();
  });
});
