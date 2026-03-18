/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { DocumentMetadataView } from '@/components/document-metadata-view';

describe('DocumentMetadataView', () => {
  it('renders visible metadata fields that are meant for the sidebar', () => {
    render(
      <DocumentMetadataView
        metadata={{
          source_url: 'https://example.com/doc/1',
          publication_date: '2024-01-15',
          processing_status: 'pending',
          case_type: 'civil',
        }}
      />
    );

    expect(screen.getByText(/Publication Date/i)).toBeInTheDocument();
    expect(screen.getByText(/2024/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /example.com/i })).toHaveAttribute(
      'href',
      'https://example.com/doc/1'
    );
    expect(screen.getByText('civil')).toBeInTheDocument();
  });

  it('handles null metadata without crashing', () => {
    const { container } = render(<DocumentMetadataView metadata={null} />);

    expect(container).toBeInTheDocument();
  });

  it('strips html from dates and renders nested object values', () => {
    render(
      <DocumentMetadataView
        metadata={{
          date_issued: '<span>2024-01-15</span>',
          custom_field: {
            name: 'Supreme Court',
            jurisdiction: 'Poland',
          },
        }}
      />
    );

    expect(screen.getByText(/2024/i)).toBeInTheDocument();
    expect(screen.getByText('Supreme Court')).toBeInTheDocument();
    expect(screen.getByText('Poland')).toBeInTheDocument();
  });
});
