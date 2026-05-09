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

    const { container } = render(
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    );

    // Scope to the sidebar menu list so the logo's href="/" in the header
    // doesn't masquerade as the Dashboard menu item.
    const menuLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('[data-sidebar="menu"] a[href]')
    );

    const dashboardIndex = menuLinks.findIndex(link => link.getAttribute('href') === '/');
    const searchIndex = menuLinks.findIndex(link => link.getAttribute('href') === '/search');

    expect(dashboardIndex).toBeGreaterThanOrEqual(0);
    expect(searchIndex).toBeGreaterThan(dashboardIndex);
  });
});
