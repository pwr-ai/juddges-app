/**
 * Tests for Empty State Components
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  EmptySearchResults,
  EmptyCollections,
  EmptyChatHistory,
  EmptyDocuments,
  EmptySavedItems
} from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { Search } from 'lucide-react';

describe('EmptyState', () => {
  const mockAction = jest.fn();
  const mockSecondaryAction = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with required props', () => {
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try again"
      />
    );

    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('renders action button when provided', async () => {
    const user = userEvent.setup();

    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try again"
        action={{
          label: 'Reset',
          onClick: mockAction
        }}
      />
    );

    const button = screen.getByRole('button', { name: 'Reset' });
    expect(button).toBeInTheDocument();

    await user.click(button);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('renders both action buttons', async () => {
    const user = userEvent.setup();

    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try again"
        action={{
          label: 'Primary',
          onClick: mockAction
        }}
        secondaryAction={{
          label: 'Secondary',
          onClick: mockSecondaryAction
        }}
      />
    );

    const primaryButton = screen.getByRole('button', { name: 'Primary' });
    const secondaryButton = screen.getByRole('button', { name: 'Secondary' });

    expect(primaryButton).toBeInTheDocument();
    expect(secondaryButton).toBeInTheDocument();

    await user.click(primaryButton);
    expect(mockAction).toHaveBeenCalledTimes(1);

    await user.click(secondaryButton);
    expect(mockSecondaryAction).toHaveBeenCalledTimes(1);
  });

  it('applies size variants correctly', () => {
    const { container: smContainer } = render(
      <EmptyState
        icon={Search}
        title="Title"
        description="Description"
        size="sm"
      />
    );

    const { container: lgContainer } = render(
      <EmptyState
        icon={Search}
        title="Title"
        description="Description"
        size="lg"
      />
    );

    // Check that different sizes are applied (via className checks)
    expect(smContainer.firstChild).toHaveClass('py-8');
    expect(lgContainer.firstChild).toHaveClass('py-16');
  });

  it('has proper accessibility attributes', () => {
    render(
      <EmptyState
        icon={Search}
        title="No results"
        description="Try again"
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Empty state');
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="Title"
        description="Description"
        className="custom-empty"
      />
    );

    expect(container.firstChild).toHaveClass('custom-empty');
  });
});

describe('EmptySearchResults', () => {
  it('renders with default message', () => {
    render(<EmptySearchResults />);

    expect(screen.getByText('No judgments found')).toBeInTheDocument();
    expect(screen.getByText(/couldn't find any judgments/i)).toBeInTheDocument();
  });

  it('renders custom message', () => {
    const customMessage = 'Custom empty message';
    render(<EmptySearchResults message={customMessage} />);

    expect(screen.getByText(customMessage)).toBeInTheDocument();
  });

  it('calls onReset when Clear filters is clicked', async () => {
    const user = userEvent.setup();
    const mockReset = jest.fn();

    render(<EmptySearchResults onReset={mockReset} />);

    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clearButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('has View all judgments button', () => {
    render(<EmptySearchResults />);
    expect(screen.getByRole('button', { name: /view all judgments/i })).toBeInTheDocument();
  });
});

describe('EmptyCollections', () => {
  it('renders with correct message', () => {
    render(<EmptyCollections onCreate={jest.fn()} />);

    expect(screen.getByText('No collections yet')).toBeInTheDocument();
    expect(screen.getByText(/Collections help you organize/i)).toBeInTheDocument();
  });

  it('calls onCreate when Create collection is clicked', async () => {
    const user = userEvent.setup();
    const mockCreate = jest.fn();

    render(<EmptyCollections onCreate={mockCreate} />);

    const createButton = screen.getByRole('button', { name: /create collection/i });
    await user.click(createButton);

    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyChatHistory', () => {
  it('renders with correct message', () => {
    render(<EmptyChatHistory onStartChat={jest.fn()} />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
    expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument();
  });

  it('calls onStartChat when Start new chat is clicked', async () => {
    const user = userEvent.setup();
    const mockStartChat = jest.fn();

    render(<EmptyChatHistory onStartChat={mockStartChat} />);

    const startButton = screen.getByRole('button', { name: /start new chat/i });
    await user.click(startButton);

    expect(mockStartChat).toHaveBeenCalledTimes(1);
  });
});

describe('EmptyDocuments', () => {
  it('renders with default message', () => {
    render(<EmptyDocuments />);

    expect(screen.getByText('No documents found')).toBeInTheDocument();
    expect(screen.getByText(/no documents to display/i)).toBeInTheDocument();
  });

  it('renders custom title and description', () => {
    const customTitle = 'Custom title';
    const customDescription = 'Custom description';

    render(
      <EmptyDocuments
        title={customTitle}
        description={customDescription}
      />
    );

    expect(screen.getByText(customTitle)).toBeInTheDocument();
    expect(screen.getByText(customDescription)).toBeInTheDocument();
  });

  it('calls onUpload when Upload document is clicked', async () => {
    const user = userEvent.setup();
    const mockUpload = jest.fn();

    render(<EmptyDocuments onUpload={mockUpload} />);

    const uploadButton = screen.getByRole('button', { name: /upload document/i });
    await user.click(uploadButton);

    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when onUpload is not provided', () => {
    render(<EmptyDocuments />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptySavedItems', () => {
  it('renders with correct message', () => {
    render(<EmptySavedItems />);

    expect(screen.getByText('No saved items')).toBeInTheDocument();
    expect(screen.getByText(/haven't saved any judgments/i)).toBeInTheDocument();
  });

  it('calls onBrowse when Browse judgments is clicked', async () => {
    const user = userEvent.setup();
    const mockBrowse = jest.fn();

    render(<EmptySavedItems onBrowse={mockBrowse} />);

    const browseButton = screen.getByRole('button', { name: /browse judgments/i });
    await user.click(browseButton);

    expect(mockBrowse).toHaveBeenCalledTimes(1);
  });

  it('has fallback Go to search button when onBrowse not provided', () => {
    render(<EmptySavedItems />);
    expect(screen.getByRole('button', { name: /go to search/i })).toBeInTheDocument();
  });
});
