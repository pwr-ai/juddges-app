/**
 * Extended tests for DocumentMetadataView component
 *
 * Covers: field filtering, HTML stripping, date formatting,
 * URL rendering, array/object rendering, edge cases.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { DocumentMetadataView } from '@/components/document-metadata-view';

describe('DocumentMetadataView', () => {
  describe('null / empty handling', () => {
    it('renders without crashing when metadata is null', () => {
      const { container } = render(<DocumentMetadataView metadata={null} />);
      expect(container).toBeInTheDocument();
    });

    it('renders without crashing when metadata is undefined', () => {
      const { container } = render(<DocumentMetadataView metadata={undefined} />);
      expect(container).toBeInTheDocument();
    });

    it('renders without crashing when metadata is empty object', () => {
      const { container } = render(<DocumentMetadataView metadata={{}} />);
      expect(container).toBeInTheDocument();
    });

    it('renders the title "Document Metadata"', () => {
      render(<DocumentMetadataView metadata={{}} />);
      expect(screen.getByText('Document Metadata')).toBeInTheDocument();
    });
  });

  describe('field filtering (shouldDisplayField)', () => {
    it('skips internal fields like full_text, vectors, x, y', () => {
      render(
        <DocumentMetadataView
          metadata={{
            full_text: 'long text content',
            vectors: [0.1, 0.2],
            x: 100,
            y: 200,
          }}
        />
      );
      // None of these should render as field labels
      expect(screen.queryByText(/Full Text/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Vectors/i)).not.toBeInTheDocument();
    });

    it('skips fields displayed in Key Information section (court_name, judges, etc.)', () => {
      render(
        <DocumentMetadataView
          metadata={{
            court_name: 'Supreme Court',
            judges: ['Judge A'],
            outcome: 'dismissed',
          }}
        />
      );
      // These are shown in Key Information, not in sidebar
      expect(screen.queryByText('Court Name')).not.toBeInTheDocument();
    });

    it('skips null, undefined, and empty string values', () => {
      render(
        <DocumentMetadataView
          metadata={{
            field_null: null,
            field_undefined: undefined,
            field_empty: '',
            field_whitespace: '   ',
          }}
        />
      );
      expect(screen.queryByText(/Field Null/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Field Undefined/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Field Empty/i)).not.toBeInTheDocument();
    });

    it('skips empty arrays', () => {
      render(
        <DocumentMetadataView
          metadata={{
            empty_list: [],
          }}
        />
      );
      expect(screen.queryByText(/Empty List/i)).not.toBeInTheDocument();
    });

    it('skips processing_status when completed', () => {
      render(
        <DocumentMetadataView
          metadata={{
            processing_status: 'completed',
          }}
        />
      );
      expect(screen.queryByText(/Processing Status/i)).not.toBeInTheDocument();
    });

    it('shows processing_status when not completed', () => {
      render(
        <DocumentMetadataView
          metadata={{
            processing_status: 'pending',
          }}
        />
      );
      expect(screen.getByText(/Processing Status/i)).toBeInTheDocument();
      expect(screen.getByText('pending')).toBeInTheDocument();
    });

    it('skips strings longer than 200 characters', () => {
      const longText = 'a'.repeat(201);
      render(
        <DocumentMetadataView
          metadata={{
            custom_long_field: longText,
          }}
        />
      );
      expect(screen.queryByText(/Custom Long Field/i)).not.toBeInTheDocument();
    });

    it('skips fields with chunk in the name', () => {
      render(
        <DocumentMetadataView
          metadata={{
            chunk_count: 10,
            chunks: ['a', 'b'],
          }}
        />
      );
      expect(screen.queryByText(/Chunk/i)).not.toBeInTheDocument();
    });

    it('skips ingestion_date', () => {
      render(
        <DocumentMetadataView
          metadata={{
            ingestion_date: '2024-01-01',
          }}
        />
      );
      expect(screen.queryByText(/Ingestion Date/i)).not.toBeInTheDocument();
    });
  });

  describe('date formatting', () => {
    it('formats date fields using polish locale', () => {
      render(
        <DocumentMetadataView
          metadata={{
            date_issued: '2024-06-15',
          }}
        />
      );
      // Should show a formatted date (pl-PL locale)
      expect(screen.getByText(/2024/i)).toBeInTheDocument();
    });

    it('strips HTML tags from date strings before formatting', () => {
      render(
        <DocumentMetadataView
          metadata={{
            publication_date: '<b>2024-03-20</b>',
          }}
        />
      );
      expect(screen.getByText(/2024/i)).toBeInTheDocument();
      expect(screen.queryByText(/<b>/)).not.toBeInTheDocument();
    });
  });

  describe('URL rendering', () => {
    it('renders source_url as a clickable link', () => {
      render(
        <DocumentMetadataView
          metadata={{
            source_url: 'https://example.com/judgment/123',
          }}
        />
      );
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com/judgment/123');
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  describe('array rendering', () => {
    it('renders string arrays as badges', () => {
      render(
        <DocumentMetadataView
          metadata={{
            custom_tags: ['tag1', 'tag2', 'tag3'],
          }}
        />
      );
      expect(screen.getByText('tag1')).toBeInTheDocument();
      expect(screen.getByText('tag2')).toBeInTheDocument();
      expect(screen.getByText('tag3')).toBeInTheDocument();
    });

    it('filters out null and empty items from arrays', () => {
      render(
        <DocumentMetadataView
          metadata={{
            custom_list: ['valid', null, '', 'also-valid'],
          }}
        />
      );
      expect(screen.getByText('valid')).toBeInTheDocument();
      expect(screen.getByText('also-valid')).toBeInTheDocument();
    });
  });

  describe('object rendering', () => {
    it('extracts string values from objects and displays them', () => {
      render(
        <DocumentMetadataView
          metadata={{
            custom_object: {
              name: 'Test Court',
              jurisdiction: 'Poland',
            },
          }}
        />
      );
      expect(screen.getByText('Test Court')).toBeInTheDocument();
      expect(screen.getByText('Poland')).toBeInTheDocument();
    });
  });

  describe('field name formatting', () => {
    it('converts snake_case to Title Case', () => {
      render(
        <DocumentMetadataView
          metadata={{
            case_type: 'civil',
          }}
        />
      );
      expect(screen.getByText('Case Type')).toBeInTheDocument();
    });
  });

  describe('case_type deduplication', () => {
    it('hides case_type_description when it matches case_type', () => {
      render(
        <DocumentMetadataView
          metadata={{
            case_type: 'civil',
            case_type_description: 'civil',
          }}
        />
      );
      // Only one instance of "civil" for case_type, case_type_description should be hidden
      const civilElements = screen.getAllByText('civil');
      expect(civilElements).toHaveLength(1);
    });
  });

  describe('HTML stripping in values', () => {
    it('strips HTML tags from string values', () => {
      render(
        <DocumentMetadataView
          metadata={{
            custom_html_field: '<strong>Important</strong> text',
          }}
        />
      );
      expect(screen.getByText('Important text')).toBeInTheDocument();
      expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
    });
  });

  describe('section grouping', () => {
    it('renders source URL in the source section', () => {
      render(
        <DocumentMetadataView
          metadata={{
            source_url: 'https://example.com',
          }}
        />
      );
      expect(screen.getByText(/Source Url/i)).toBeInTheDocument();
    });

    it('renders date fields in the historical dates section', () => {
      render(
        <DocumentMetadataView
          metadata={{
            publication_date: '2024-01-15',
            submission_date: '2023-12-01',
          }}
        />
      );
      expect(screen.getByText(/Publication Date/i)).toBeInTheDocument();
      expect(screen.getByText(/Submission Date/i)).toBeInTheDocument();
    });
  });
});
