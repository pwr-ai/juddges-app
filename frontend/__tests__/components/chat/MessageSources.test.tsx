/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageSources } from '@/components/chat/MessageSources';

jest.mock('@/hooks/useSourceDocuments', () => ({
  useSourceDocuments: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

jest.mock('@/contexts/ChatContext', () => ({
  useChatContext: jest.fn(() => ({ chatId: 'chat-1' })),
}));

jest.mock('@/lib/document-utils', () => ({
  cleanDocumentIdForUrl: jest.fn((id: string) => id.replace('/doc/', '')),
}));

jest.mock('@/lib/styles/components', () => ({
  CollapsibleButton: ({ children, onClick, isExpanded }: any) => (
    <button aria-expanded={isExpanded ? 'true' : 'false'} onClick={onClick}>
      {children}
    </button>
  ),
  DocumentCard: ({ document }: any) => <div>{document.title}</div>,
  BaseCard: ({ children }: any) => <div>{children}</div>,
}));

const { useSourceDocuments } = require('@/hooks/useSourceDocuments');

describe('MessageSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSourceDocuments.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders the cited-source badge with the cleaned count', () => {
    render(<MessageSources documentIds={['/doc/a', '/doc/b']} />);

    expect(screen.getByText('2 sources cited')).toBeInTheDocument();
  });

  it('renders zero-count badge when no document IDs are provided', () => {
    render(<MessageSources documentIds={[]} />);

    expect(screen.getByText('0 sources cited')).toBeInTheDocument();
  });

  it('renders fetched documents in expanded mode', () => {
    useSourceDocuments.mockReturnValue({
      data: [
        { document_id: 'doc-1', title: 'First source' },
        { document_id: 'doc-2', title: 'Second source' },
      ],
      isLoading: false,
      error: null,
    });

    render(<MessageSources documentIds={['doc-1', 'doc-2']} isExpanded={true} />);

    expect(screen.getByText('First source')).toBeInTheDocument();
    expect(screen.getByText('Second source')).toBeInTheDocument();
  });

  it('renders the loading skeleton grid when expanded and still loading', () => {
    useSourceDocuments.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<MessageSources documentIds={['doc-1']} isExpanded={true} />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an error state for failed source loads', () => {
    useSourceDocuments.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('boom'),
    });

    render(<MessageSources documentIds={['doc-1']} isExpanded={true} />);

    expect(screen.getByText(/Failed to load sources/i)).toBeInTheDocument();
  });

  it('uses the external toggle handler when provided', async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();

    render(<MessageSources documentIds={['doc-1']} onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: /1 source cited/i }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
