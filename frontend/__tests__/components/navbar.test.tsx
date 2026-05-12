/**
 * Tests for Navbar component
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import { Navbar } from '@/components/navbar';

// --- Mocks ---

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockRefresh = jest.fn();
let mockPathname = '/';
let mockParams: Record<string, string> = {};
let mockSearchParamsMap = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    refresh: mockRefresh,
    prefetch: jest.fn(),
    forward: jest.fn(),
  }),
  usePathname: () => mockPathname,
  useParams: () => mockParams,
  useSearchParams: () => mockSearchParamsMap,
}));

// Mock AuthContext
const mockUser = { id: 'user-1', email: 'test@example.com' };
let currentUser: typeof mockUser | null = null;

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: currentUser,
    loading: false,
    signOut: jest.fn(),
  }),
}));

// Mock searchStore
let mockSearchType = 'standard';
jest.mock('@/lib/store/searchStore', () => ({
  useSearchStore: (selector: any) => selector({ searchType: mockSearchType }),
}));

// Mock UI components to simplify testing
jest.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: (props: any) => <button data-testid="sidebar-trigger" {...props}>Sidebar</button>,
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children, ...props }: any) => <div data-testid="popover" {...props}>{children}</div>,
  PopoverTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  PopoverContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}));

jest.mock('@/lib/styles/components', () => ({
  PrimaryButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  SecondaryButton: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  UserAvatar: (props: any) => <div data-testid="user-avatar" {...props}>Avatar</div>,
  UserCard: (props: any) => <div data-testid="user-card" {...props}>UserCard</div>,
  IconButton: ({ icon: Icon, ...props }: any) => (
    <button {...props}>
      {Icon && <Icon className="w-4 h-4" />}
    </button>
  ),
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

jest.mock('@/lib/styles/components/ai-badge', () => ({
  AIBadge: ({ text, ...props }: any) => <span data-testid="ai-badge" {...props}>{text}</span>,
}));

jest.mock('@/lib/styles/components/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

jest.mock('@/lib/styles/components/save-to-collection-popover', () => ({
  SaveToCollectionPopover: () => <div data-testid="save-to-collection">Save</div>,
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>;
});

// Mock lucide-react icons
jest.mock('lucide-react', () => {
  const icon = (props: any) => <svg {...props} />;
  return {
    X: icon,
    Trash2: icon,
    Pencil: icon,
    Printer: icon,
    FileText: icon,
    BookmarkPlus: icon,
    ExternalLink: icon,
    ArrowLeft: icon,
    MessageSquare: icon,
    FolderOpen: icon,
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
  mockParams = {};
  mockSearchParamsMap = new URLSearchParams();
  currentUser = null;
  mockSearchType = 'standard';
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
    text: async () => '',
  });
});

describe('Navbar', () => {
  describe('unauthenticated user', () => {
    beforeEach(() => {
      currentUser = null;
    });

    it('renders Login and Sign Up buttons', () => {
      render(<Navbar />);
      expect(screen.getByText('Login')).toBeInTheDocument();
      expect(screen.getByText('Sign Up')).toBeInTheDocument();
    });

    it('renders About link', () => {
      render(<Navbar />);
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('does not show sidebar trigger', () => {
      render(<Navbar />);
      expect(screen.queryByTestId('sidebar-trigger')).not.toBeInTheDocument();
    });

    it('navigates to /auth/login on Login click', async () => {
      const user = userEvent.setup();
      render(<Navbar />);

      await user.click(screen.getByText('Login'));
      expect(mockPush).toHaveBeenCalledWith('/auth/login');
    });

    it('navigates to /auth/sign-up on Sign Up click', async () => {
      const user = userEvent.setup();
      render(<Navbar />);

      await user.click(screen.getByText('Sign Up'));
      expect(mockPush).toHaveBeenCalledWith('/auth/sign-up');
    });
  });

  describe('authenticated user', () => {
    beforeEach(() => {
      currentUser = mockUser;
    });

    it('shows sidebar trigger', () => {
      render(<Navbar />);
      expect(screen.getByTestId('sidebar-trigger')).toBeInTheDocument();
    });

    it('shows user avatar', () => {
      render(<Navbar />);
      expect(screen.getByTestId('user-avatar')).toBeInTheDocument();
    });

    it('does not show Login/Sign Up buttons', () => {
      render(<Navbar />);
      expect(screen.queryByText('Login')).not.toBeInTheDocument();
      expect(screen.queryByText('Sign Up')).not.toBeInTheDocument();
    });
  });

  describe('page titles', () => {
    beforeEach(() => {
      currentUser = mockUser;
    });

    it('shows Dashboard title on /', () => {
      mockPathname = '/';
      render(<Navbar />);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('shows Assistant title on /chat', () => {
      mockPathname = '/chat';
      render(<Navbar />);
      expect(screen.getByText('Assistant')).toBeInTheDocument();
      expect(screen.getByTestId('ai-badge')).toBeInTheDocument();
    });

    it('shows Search title on /search', () => {
      mockPathname = '/search';
      render(<Navbar />);
      expect(screen.getByText('Search')).toBeInTheDocument();
    });

    it('shows AI badge on search page when thinking mode is active', () => {
      mockPathname = '/search';
      mockSearchType = 'thinking';
      render(<Navbar />);
      expect(screen.getByTestId('ai-badge')).toBeInTheDocument();
    });

    it('does not show AI badge on search page when standard mode', () => {
      mockPathname = '/search';
      mockSearchType = 'standard';
      render(<Navbar />);
      expect(screen.queryByTestId('ai-badge')).not.toBeInTheDocument();
    });

    it('shows Collections title on /collections', () => {
      mockPathname = '/collections';
      render(<Navbar />);
      expect(screen.getByText('Collections')).toBeInTheDocument();
    });

    it('shows Collection Viewer on /collections/:id', () => {
      mockPathname = '/collections/123';
      mockParams = { id: '123' };
      render(<Navbar />);
      expect(screen.getByText('Collection Viewer')).toBeInTheDocument();
    });

    it('shows Schemas title on /schemas', () => {
      mockPathname = '/schemas';
      render(<Navbar />);
      expect(screen.getByText('Schemas')).toBeInTheDocument();
    });

    it('shows Precedent Finder title on /precedents', () => {
      mockPathname = '/precedents';
      render(<Navbar />);
      expect(screen.getByText('Precedent Finder')).toBeInTheDocument();
    });

    it('shows Schema Studio title on /schema-chat', () => {
      mockPathname = '/schema-chat';
      render(<Navbar />);
      expect(screen.getByText('Schema Studio')).toBeInTheDocument();
    });

    it('shows Configure extraction title on /extract', () => {
      mockPathname = '/extract';
      render(<Navbar />);
      expect(screen.getByText('Configure extraction')).toBeInTheDocument();
    });

    it('shows Extractions title on /extractions', () => {
      mockPathname = '/extractions';
      render(<Navbar />);
      expect(screen.getByText('Extractions')).toBeInTheDocument();
    });
  });

  describe('document page', () => {
    beforeEach(() => {
      currentUser = mockUser;
      mockPathname = '/documents/doc-123';
      mockParams = { id: 'doc-123' };
    });

    it('shows Document Viewer title', () => {
      render(<Navbar />);
      expect(screen.getByText('Document Viewer')).toBeInTheDocument();
    });

    it('fetches document metadata on mount', () => {
      render(<Navbar />);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents/doc-123/metadata',
        expect.objectContaining({ cache: 'no-store' })
      );
    });
  });

  describe('collection detail page', () => {
    beforeEach(() => {
      currentUser = mockUser;
      mockPathname = '/collections/col-1';
      mockParams = { id: 'col-1' };
    });

    it('fetches collection data on mount', () => {
      render(<Navbar />);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/collections/col-1',
        expect.objectContaining({ cache: 'no-store' })
      );
    });
  });

  describe('sticky header styling', () => {
    it('renders as a header element', () => {
      render(<Navbar />);
      const header = document.querySelector('header');
      expect(header).toBeInTheDocument();
    });

    it('has sticky positioning class', () => {
      render(<Navbar />);
      const header = document.querySelector('header');
      expect(header?.className).toContain('sticky');
      expect(header?.className).toContain('top-0');
    });
  });
});
