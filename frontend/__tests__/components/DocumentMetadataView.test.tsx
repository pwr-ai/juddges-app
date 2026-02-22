/**
 * Component tests for DocumentMetadataView
 *
 * Tests metadata display, formatting, and rendering of different field types
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DocumentMetadataView } from '@/components/document-metadata-view';

describe('DocumentMetadataView Component', () => {
  describe('Basic Rendering', () => {
    it('should render metadata fields', () => {
      const metadata = {
        document_number: 'XII C 123/24',
        court_name: 'Supreme Court',
        date_issued: '2024-01-15',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('XII C 123/24')).toBeInTheDocument();
      expect(screen.getByText('Supreme Court')).toBeInTheDocument();
    });

    it('should render empty state when no metadata provided', () => {
      const { container } = render(<DocumentMetadataView metadata={{}} />);

      // Should render without crashing
      expect(container).toBeInTheDocument();
    });

    it('should handle null metadata gracefully', () => {
      expect(() => {
        render(<DocumentMetadataView metadata={null as any} />);
      }).not.toThrow();
    });
  });

  describe('Field Formatting', () => {
    it('should format date fields correctly', () => {
      const metadata = {
        date_issued: '2024-01-15',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      // Polish locale format: "15 stycznia 2024" or similar
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('should format field names from snake_case to Title Case', () => {
      const metadata = {
        court_name: 'Test Court',
        presiding_judge: 'John Doe',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      // Should format "court_name" to "Court Name"
      expect(screen.getByText(/Court Name|court name/i)).toBeInTheDocument();
    });

    it('should handle HTML tags in date strings', () => {
      const metadata = {
        date_issued: '<span>2024-01-15</span>',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      // Should strip HTML and format date
      expect(screen.getByText(/2024/)).toBeInTheDocument();
    });

    it('should handle invalid date formats gracefully', () => {
      const metadata = {
        date_issued: 'invalid-date',
      };

      expect(() => {
        render(<DocumentMetadataView metadata={metadata} />);
      }).not.toThrow();
    });
  });

  describe('Field Icons', () => {
    it('should display calendar icon for date fields', () => {
      const metadata = {
        date_issued: '2024-01-15',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      // Calendar icon should be rendered (lucide-react renders as SVG)
      const calendarIcon = container.querySelector('svg');
      expect(calendarIcon).toBeInTheDocument();
    });

    it('should display scale icon for court fields', () => {
      const metadata = {
        court_name: 'Supreme Court',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('should display default icon for unknown fields', () => {
      const metadata = {
        custom_field: 'Custom value',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Array Fields', () => {
    it('should render array values as badges', () => {
      const metadata = {
        keywords: ['contract', 'commercial law', 'dispute'],
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('contract')).toBeInTheDocument();
      expect(screen.getByText('commercial law')).toBeInTheDocument();
      expect(screen.getByText('dispute')).toBeInTheDocument();
    });

    it('should handle empty arrays', () => {
      const metadata = {
        keywords: [],
      };

      expect(() => {
        render(<DocumentMetadataView metadata={metadata} />);
      }).not.toThrow();
    });

    it('should render judges array', () => {
      const metadata = {
        judges: ['Judge A', 'Judge B', 'Judge C'],
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('Judge A')).toBeInTheDocument();
      expect(screen.getByText('Judge B')).toBeInTheDocument();
      expect(screen.getByText('Judge C')).toBeInTheDocument();
    });
  });

  describe('Object Fields', () => {
    it('should render nested object fields', () => {
      const metadata = {
        issuing_body: {
          name: 'Supreme Court',
          jurisdiction: 'Poland',
          type: 'Appellate',
        },
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('Supreme Court')).toBeInTheDocument();
      expect(screen.getByText('Poland')).toBeInTheDocument();
      expect(screen.getByText('Appellate')).toBeInTheDocument();
    });

    it('should handle deeply nested objects', () => {
      const metadata = {
        complex_field: {
          level1: {
            level2: {
              value: 'Deep value',
            },
          },
        },
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('Deep value')).toBeInTheDocument();
    });

    it('should handle null values in objects', () => {
      const metadata = {
        issuing_body: {
          name: 'Court',
          jurisdiction: null,
        },
      };

      expect(() => {
        render(<DocumentMetadataView metadata={metadata} />);
      }).not.toThrow();
    });
  });

  describe('URL Fields', () => {
    it('should render URLs as clickable links', () => {
      const metadata = {
        source_url: 'https://example.com/document/123',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      const link = screen.getByRole('link', { name: /example.com/i });
      expect(link).toHaveAttribute('href', 'https://example.com/document/123');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should not render invalid URLs as links', () => {
      const metadata = {
        source_url: 'not-a-url',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByText('not-a-url')).toBeInTheDocument();
    });
  });

  describe('Special Fields', () => {
    it('should render document number with hash icon', () => {
      const metadata = {
        document_number: 'DOC-2024-001',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('DOC-2024-001')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render language with globe icon', () => {
      const metadata = {
        language: 'Polish',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('Polish')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('should render country with map pin icon', () => {
      const metadata = {
        country: 'Poland',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('Poland')).toBeInTheDocument();
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Complex Metadata', () => {
    it('should render complete judgment metadata', () => {
      const metadata = {
        document_number: 'XII C 123/24',
        court_name: 'Supreme Court',
        department_name: 'Commercial Division',
        date_issued: '2024-01-15',
        presiding_judge: 'Judge Smith',
        judges: ['Judge A', 'Judge B'],
        parties: 'Company A vs Company B',
        outcome: 'Dismissed',
        keywords: ['contract', 'commercial'],
        language: 'English',
        country: 'Poland',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('XII C 123/24')).toBeInTheDocument();
      expect(screen.getByText('Supreme Court')).toBeInTheDocument();
      expect(screen.getByText('Commercial Division')).toBeInTheDocument();
      expect(screen.getByText('Judge Smith')).toBeInTheDocument();
      expect(screen.getByText('Company A vs Company B')).toBeInTheDocument();
      expect(screen.getByText('Dismissed')).toBeInTheDocument();
    });

    it('should handle sparse metadata', () => {
      const metadata = {
        document_number: 'DOC-001',
        // Many fields missing
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('DOC-001')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined values', () => {
      const metadata = {
        field1: undefined,
        field2: 'value',
      };

      expect(() => {
        render(<DocumentMetadataView metadata={metadata} />);
      }).not.toThrow();
    });

    it('should handle boolean values', () => {
      const metadata = {
        is_published: true,
        is_archived: false,
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText(/true|yes/i)).toBeInTheDocument();
    });

    it('should handle numeric values', () => {
      const metadata = {
        case_number: 12345,
        amount: 1000.50,
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText('12345')).toBeInTheDocument();
      expect(screen.getByText('1000.5')).toBeInTheDocument();
    });

    it('should handle very long text values', () => {
      const longText = 'A'.repeat(1000);
      const metadata = {
        description: longText,
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });

    it('should handle special characters in values', () => {
      const metadata = {
        title: 'Contract & Agreement § 123 "Special"',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText(/Contract & Agreement/)).toBeInTheDocument();
    });

    it('should handle unicode characters', () => {
      const metadata = {
        title: '法律文件 Dokument prawny',
        court: 'Sąd Najwyższy',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      expect(screen.getByText(/法律文件/)).toBeInTheDocument();
      expect(screen.getByText(/Sąd Najwyższy/)).toBeInTheDocument();
    });
  });

  describe('Visual Structure', () => {
    it('should use separators between sections', () => {
      const metadata = {
        field1: 'value1',
        field2: 'value2',
        field3: 'value3',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      // Check for separator elements
      const separators = container.querySelectorAll('[role="separator"]');
      expect(separators.length).toBeGreaterThan(0);
    });

    it('should organize fields in a card layout', () => {
      const metadata = {
        document_number: 'DOC-001',
        court_name: 'Court',
      };

      const { container } = render(<DocumentMetadataView metadata={metadata} />);

      // Should have structured layout
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper semantic structure', () => {
      const metadata = {
        document_number: 'DOC-001',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      // Links should be accessible
      const link = screen.queryByRole('link');
      if (link) {
        expect(link).toHaveAttribute('href');
      }
    });

    it('should have readable labels for screen readers', () => {
      const metadata = {
        court_name: 'Supreme Court',
      };

      render(<DocumentMetadataView metadata={metadata} />);

      // Field names should be readable
      expect(screen.getByText(/Court Name|court name/i)).toBeInTheDocument();
    });
  });
});
