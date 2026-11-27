import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';

import { AISummaryPanel } from '@/app/documents/[id]/_components/AISummaryPanel';
import { KeyPointsPanel } from '@/app/documents/[id]/_components/KeyPointsPanel';

const summaryProps = (open: boolean) => ({
  isSummaryPanelOpen: open,
  onToggle: jest.fn(),
  authLoading: false,
  canUseDocumentAI: true,
  summaryType: 'executive' as const,
  onSummaryTypeChange: jest.fn(),
  summaryLength: 'medium' as const,
  onSummaryLengthChange: jest.fn(),
  isSummarizing: false,
  summaryError: null,
  summaryResult: null,
  onGenerateSummary: jest.fn(),
});

const keyPointsProps = (open: boolean) => ({
  isKeyPointsPanelOpen: open,
  onToggle: jest.fn(),
  authLoading: false,
  canUseDocumentAI: true,
  isExtractingKeyPoints: false,
  keyPointsError: null,
  keyPointsResult: null,
  onExtractKeyPoints: jest.fn(),
});

describe('AISummaryPanel a11y', () => {
  it('names both selects with their visible labels', () => {
    render(<AISummaryPanel {...summaryProps(true)} />);
    expect(screen.getByRole('combobox', { name: 'Summary Type' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Length' })).toBeInTheDocument();
  });

  it('removes the controls of a collapsed panel from the accessibility tree and tab order', () => {
    render(<AISummaryPanel {...summaryProps(false)} />);
    expect(screen.queryByRole('combobox', { name: 'Summary Type' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate Summary' })).not.toBeInTheDocument();
    // Still mounted, but display:none via [hidden]
    expect(screen.getByRole('combobox', { hidden: true, name: 'Summary Type' }).closest('[hidden]')).not.toBeNull();
  });

  it('uses h2 for the panel title and h3 for nested headings', () => {
    render(<AISummaryPanel {...summaryProps(true)} />);
    expect(screen.getByRole('heading', { level: 2, name: 'AI Summary' })).toBeInTheDocument();
  });
});

describe('KeyPointsPanel a11y', () => {
  it('hides the extract button of a collapsed panel from AT and keyboard', () => {
    render(<KeyPointsPanel {...keyPointsProps(false)} />);
    expect(screen.queryByRole('button', { name: 'Extract Key Points' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { hidden: true, name: 'Extract Key Points' }).closest('[hidden]'),
    ).not.toBeNull();
  });

  it('exposes the extract button once expanded', () => {
    render(<KeyPointsPanel {...keyPointsProps(true)} />);
    expect(screen.getByRole('button', { name: 'Extract Key Points' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Key Points' })).toBeInTheDocument();
  });
});
