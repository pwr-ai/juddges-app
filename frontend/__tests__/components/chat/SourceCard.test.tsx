/**
 * Component tests for SourceCard
 *
 * Tests document source card rendering, interactions, and different document types
 * following user-focused testing patterns.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { SourceCard } from '@/components/chat/SourceCard';
import { DocumentType, SearchDocument } from '@/types/search';

// Mock Next.js Link component
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('SourceCard Component', () => {
  const mockDocument: SearchDocument = {
    document_id: 'doc-123',
    document_type: DocumentType.JUDGMENT,
    title: 'Contract Law Case 2024',
    document_number: 'XII C 123/24',
    date_issued: '2024-01-15',
    summary: 'This is a judgment about contract law and commercial disputes.',
    language: 'en',
    country: 'PL',
    full_text: 'Full text of the judgment...',
    thesis: null,
    keywords: ['contract', 'commercial law'],
    issuing_body: 'Supreme Court',
    ingestion_date: '2024-01-20',
    last_updated: '2024-01-20',
    processing_status: 'completed',
    source_url: 'https://example.com/doc-123',
    legal_references: null,
    legal_concepts: null,
    court_name: 'Supreme Court',
    department_name: 'Commercial Division',
    presiding_judge: null,
    judges: null,
    parties: null,
    outcome: null,
    legal_bases: null,
    extracted_legal_bases: null,
    references: null,
    metadata: null,
  };

  describe('Rendering - Judgment Documents', () => {
    it('should render document number as title', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.getByText('XII C 123/24')).toBeInTheDocument();
    });

    it('should render document date', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    });

    it('should render document summary preview', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.getByText(/This is a judgment about contract law/i)).toBeInTheDocument();
    });

    it('should display Judgment badge', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.getByText('Judgment')).toBeInTheDocument();
    });

    it('should show scale icon for judgment documents', () => {
      const { container } = render(<SourceCard document={mockDocument} />);

      // Icon is rendered through lucide-react, check for icon container
      const iconContainer = container.querySelector('.w-8.h-8');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should truncate long summaries with ellipsis', () => {
      const longSummary = 'A'.repeat(200);
      const docWithLongSummary = {
        ...mockDocument,
        summary: longSummary,
      };

      render(<SourceCard document={docWithLongSummary} />);

      const summary = screen.getByText(/A{150}\.\.\.$/);
      expect(summary).toBeInTheDocument();
    });

    it('should handle missing summary gracefully', () => {
      const docWithoutSummary = {
        ...mockDocument,
        summary: null,
      };

      render(<SourceCard document={docWithoutSummary} />);

      expect(screen.getByText('No summary available')).toBeInTheDocument();
    });
  });

  describe('Rendering - Tax Interpretation Documents', () => {
    it('should render tax interpretation with correct styling', () => {
      const taxDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.TAX_INTERPRETATION,
        document_number: 'INT-2024-001',
      };

      render(<SourceCard document={taxDoc} />);

      expect(screen.getByText('Tax Interpretation')).toBeInTheDocument();
      expect(screen.getByText('INT-2024-001')).toBeInTheDocument();
    });

    it('should show calculator icon for tax interpretation', () => {
      const taxDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.TAX_INTERPRETATION,
      };

      const { container } = render(<SourceCard document={taxDoc} />);

      // Check for icon container with tax interpretation styling
      const iconContainer = container.querySelector('.w-8.h-8');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Rendering - Error Documents', () => {
    it('should display error warning for error type documents', () => {
      const errorDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.ERROR,
      };

      render(<SourceCard document={errorDoc} />);

      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText(/May be hallucinated/i)).toBeInTheDocument();
    });

    it('should show error icon and warning message', () => {
      const errorDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.ERROR,
      };

      render(<SourceCard document={errorDoc} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Verify manually/i)).toBeInTheDocument();
    });

    it('should not show action buttons for error documents', () => {
      const errorDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.ERROR,
      };

      render(<SourceCard document={errorDoc} />);

      expect(screen.queryByRole('button', { name: /view full/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });

    it('should display Weaviate error message when flagged', () => {
      const weaviateErrorDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.ERROR,
        // Type assertion for test-specific property
      } as SearchDocument & { _isWeaviateError: boolean };
      (weaviateErrorDoc as any)._isWeaviateError = true;

      render(<SourceCard document={weaviateErrorDoc} />);

      expect(screen.getByText(/database is temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should have clickable link to view full document', () => {
      render(<SourceCard document={mockDocument} />);

      const viewLink = screen.getByRole('link');
      expect(viewLink).toHaveAttribute('href', '/documents/doc-123');
    });

    it('should open document in new tab', () => {
      render(<SourceCard document={mockDocument} />);

      const viewLink = screen.getByRole('link');
      expect(viewLink).toHaveAttribute('target', '_blank');
      expect(viewLink).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('should call onSaveToCollection when save button is clicked', async () => {
      const user = userEvent.setup();
      const onSaveToCollection = jest.fn();

      render(
        <SourceCard
          document={mockDocument}
          onSaveToCollection={onSaveToCollection}
        />
      );

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      expect(onSaveToCollection).toHaveBeenCalledWith('doc-123');
      expect(onSaveToCollection).toHaveBeenCalledTimes(1);
    });

    it('should not render save button when onSaveToCollection is not provided', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });
  });

  describe('Document Metadata Display', () => {
    it('should display formatted date when available', () => {
      render(<SourceCard document={mockDocument} />);

      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    });

    it('should not display date badge when date is missing', () => {
      const docWithoutDate = {
        ...mockDocument,
        date_issued: null,
      };

      render(<SourceCard document={docWithoutDate} />);

      expect(screen.queryByText(/Jan/i)).not.toBeInTheDocument();
    });

    it('should fall back to title when document_number is missing', () => {
      const docWithoutNumber = {
        ...mockDocument,
        document_number: null,
        title: 'Fallback Title',
      };

      render(<SourceCard document={docWithoutNumber} />);

      expect(screen.getByText('Fallback Title')).toBeInTheDocument();
    });

    it('should fall back to document_id when both number and title are missing', () => {
      const docWithOnlyId = {
        ...mockDocument,
        document_number: null,
        title: null,
      };

      render(<SourceCard document={docWithOnlyId} />);

      expect(screen.getByText('doc-123')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper link semantics', () => {
      render(<SourceCard document={mockDocument} />);

      const link = screen.getByRole('link');
      expect(link).toBeInTheDocument();
    });

    it('should have accessible button labels', () => {
      const onSaveToCollection = jest.fn();

      render(
        <SourceCard
          document={mockDocument}
          onSaveToCollection={onSaveToCollection}
        />
      );

      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });

    it('should have proper alert role for error messages', () => {
      const errorDoc: SearchDocument = {
        ...mockDocument,
        document_type: DocumentType.ERROR,
      };

      render(<SourceCard document={errorDoc} />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveAttribute('title');
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      const onSaveToCollection = jest.fn();

      render(
        <SourceCard
          document={mockDocument}
          onSaveToCollection={onSaveToCollection}
        />
      );

      // Tab to view button
      await user.tab();
      const viewButton = screen.getByRole('button', { name: /view full/i });
      expect(viewButton).toHaveFocus();

      // Tab to save button
      await user.tab();
      const saveButton = screen.getByRole('button', { name: /save/i });
      expect(saveButton).toHaveFocus();

      // Activate with keyboard
      await user.keyboard('{Enter}');
      expect(onSaveToCollection).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle documents with special characters in ID', () => {
      const docWithSpecialId = {
        ...mockDocument,
        document_id: 'doc-123/special_chars!@#',
      };

      render(<SourceCard document={docWithSpecialId} />);

      // Should render without crashing
      expect(screen.getByText('XII C 123/24')).toBeInTheDocument();
    });

    it('should handle invalid date gracefully', () => {
      const docWithInvalidDate = {
        ...mockDocument,
        date_issued: 'invalid-date',
      };

      // Should not throw error
      expect(() => {
        render(<SourceCard document={docWithInvalidDate} />);
      }).not.toThrow();
    });

    it('should handle empty string summary', () => {
      const docWithEmptySummary = {
        ...mockDocument,
        summary: '',
      };

      render(<SourceCard document={docWithEmptySummary} />);

      expect(screen.getByText('No summary available')).toBeInTheDocument();
    });

    it('should handle very long document numbers', () => {
      const docWithLongNumber = {
        ...mockDocument,
        document_number: 'A'.repeat(100),
      };

      render(<SourceCard document={docWithLongNumber} />);

      // Should render with truncation
      const titleElement = screen.getByText(/A+/);
      expect(titleElement).toBeInTheDocument();
    });
  });

  describe('Visual Styling', () => {
    it('should apply hover effects on the card', async () => {
      const user = userEvent.setup();
      const { container } = render(<SourceCard document={mockDocument} />);

      const card = container.querySelector('.group');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('hover:shadow-xl');
    });

    it('should have different color schemes for different document types', () => {
      const { container: judgmentContainer } = render(
        <SourceCard document={mockDocument} />
      );

      const { container: taxContainer } = render(
        <SourceCard
          document={{ ...mockDocument, document_type: DocumentType.TAX_INTERPRETATION }}
        />
      );

      // Both should have distinct styling
      expect(judgmentContainer.innerHTML).not.toBe(taxContainer.innerHTML);
    });
  });
});
