/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourceCard } from '@/components/chat/SourceCard';

jest.mock('next/link', () => {
  return ({ children, ...props }: any) => <a {...props}>{children}</a>;
});

describe('SourceCard', () => {
  const baseDocument = {
    document_id: 'doc-123',
    document_type: 'judgment',
    title: 'Contract Law Case 2024',
    document_number: 'XII C 123/24',
    date_issued: '2024-01-15',
    summary: 'This is a judgment about contract law and commercial disputes.',
    language: 'en',
    country: 'PL',
    full_text: null,
    thesis: null,
    keywords: ['contract'],
    issuing_body: null,
    legal_references: null,
    legal_concepts: null,
    score: null,
    court_name: 'Supreme Court',
    department_name: null,
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    factual_state: null,
    legal_state: null,
    metadata: {},
  };

  it('renders a judgment card with title, summary, and link', () => {
    render(<SourceCard document={baseDocument as any} />);

    expect(screen.getByText('Judgment')).toBeInTheDocument();
    expect(screen.getByText('XII C 123/24')).toBeInTheDocument();
    expect(screen.getByText(/contract law/i)).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/documents/doc-123');
    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
  });

  it('renders the database warning for flagged error documents', () => {
    render(
      <SourceCard
        document={{
          ...baseDocument,
          // Database errors are signalled by the `_isWeaviateError` /
          // `_isDatabaseError` flags, not via a separate document_type.
          _isWeaviateError: true,
          _isDatabaseError: true,
        } as any}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/database is temporarily unavailable/i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does not throw on invalid dates and falls back to default summary text', () => {
    render(
      <SourceCard
        document={{
          ...baseDocument,
          date_issued: 'not-a-date',
          summary: null,
        } as any}
      />
    );

    expect(screen.queryByText(/Jan 15, 2024/i)).not.toBeInTheDocument();
    expect(screen.getByText('No summary available')).toBeInTheDocument();
  });

  it('calls onSaveToCollection when the save button is clicked', async () => {
    const user = userEvent.setup();
    const onSaveToCollection = jest.fn();

    render(
      <SourceCard
        document={baseDocument as any}
        onSaveToCollection={onSaveToCollection}
      />
    );

    await user.click(screen.getByRole('button', { name: /Save/i }));

    expect(onSaveToCollection).toHaveBeenCalledWith('doc-123');
  });
});
