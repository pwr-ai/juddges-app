import React from 'react';
import { render, screen } from '@testing-library/react';

const mockUseAuth = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
}));
jest.mock('@/contexts/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/contexts/ChatContext', () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useChatContext: () => ({ resetConversation: jest.fn(), messages: [], chatId: null }),
}));
jest.mock('@/contexts/CommandPaletteContext', () => ({
  CommandPaletteProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useCommandPaletteSafe: () => ({ open: jest.fn() }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/language-switcher', () => ({ LanguageSwitcherMinimal: () => null }));
jest.mock('@/components/navbar', () => ({
  Navbar: () => <header data-testid="navbar">navbar</header>,
}));
jest.mock('@/components/command-palette', () => ({ CommandPalette: () => null }));
jest.mock('@/components/legal/legal-compliance-wrapper', () => ({
  LegalComplianceWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@/components/PWAProvider', () => ({ PWAProvider: () => null }));
jest.mock('@/components/editorial/FlowStepper', () => ({ FlowStepper: () => null }));

import { AppLayoutWrapper } from '@/components/layouts/AppLayoutWrapper';

describe('AppLayoutWrapper landmarks', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  it.each([
    ['guest', { user: null, loading: false }],
    ['signed-in', { user: { id: 'u1', app_metadata: {} }, loading: false }],
  ])('exposes a labelled navigation, a banner and one main (%s)', (_name, auth) => {
    mockUseAuth.mockReturnValue(auth);
    render(
      <AppLayoutWrapper>
        <p>content</p>
      </AppLayoutWrapper>,
    );

    expect(screen.getByRole('navigation', { name: 'navigation.mainLabel' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });
});
