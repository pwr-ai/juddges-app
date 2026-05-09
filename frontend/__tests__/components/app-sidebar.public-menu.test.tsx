import React from 'react';
import { render } from '@testing-library/react';

const mockUseAuth = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/ChatContext', () => ({
  useChatContext: () => ({
    resetConversation: jest.fn(),
    messages: [],
    chatId: null,
  }),
}));

jest.mock('@/contexts/CommandPaletteContext', () => ({
  useCommandPaletteSafe: () => ({
    open: jest.fn(),
  }),
}));

jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'navigation.navigation': 'Navigation',
        'navigation.features': 'Features',
        'navigation.account': 'Account',
        'navigation.home': 'Home',
        'navigation.about': 'About',
        'navigation.privacy': 'Privacy',
        'navigation.termsOfService': 'Terms of Service',
        'navigation.useCases': 'Use Cases',
        'navigation.signIn': 'Sign In',
        'navigation.signUp': 'Sign Up',
        'navigation.search': 'Search',
        'navigation.extractStructureData': 'Extract Structured Data',
        'navigation.extractions': 'Extractions',
        'navigation.dashboard': 'Dashboard',
        'navigation.searchJudgments': 'Search Judgments',
      };

      return map[key] ?? key;
    },
  }),
}));

jest.mock('@/components/language-switcher', () => ({
  LanguageSwitcherMinimal: () => null,
}));

const { AppSidebar } = require('@/components/app-sidebar');
const { SidebarProvider } = require('@/components/ui/sidebar');

describe('AppSidebar public navigation', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it('shows only the public demo path for unauthenticated users', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    const { container } = render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    expect(container.querySelector('a[href="/search"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/extract"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/extractions"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/collections"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="/dataset-comparison"]')).not.toBeInTheDocument();
  });

  it('shows the Dashboard link as the first item for authenticated users', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1', app_metadata: {} }, loading: false });

    const { container, debug } = render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    // Find all navigation links in sidebar content
    const allLinks = container.querySelectorAll('a');
    const mainNavigationLinks = Array.from(allLinks).filter(link =>
      link.getAttribute('href') &&
      !link.closest('[class*="header"]') // Exclude header links
    );

    expect(mainNavigationLinks.length).toBeGreaterThan(0);

    // Get the dashboard and search links
    const dashboardLink = mainNavigationLinks.find(link => link.getAttribute('href') === '/');
    const searchLink = mainNavigationLinks.find(link => link.getAttribute('href') === '/search');

    expect(dashboardLink).toBeInTheDocument();
    expect(searchLink).toBeInTheDocument();

    // Check DOM order: Dashboard should appear before Search in the main navigation
    const dashboardIndex = mainNavigationLinks.indexOf(dashboardLink);
    const searchIndex = mainNavigationLinks.indexOf(searchLink);
    expect(dashboardIndex).toBeLessThan(searchIndex);
  });
});
