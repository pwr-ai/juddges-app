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
});
