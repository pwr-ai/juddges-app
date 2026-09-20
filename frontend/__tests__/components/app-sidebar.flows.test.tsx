/**
 * The signed-in sidebar is rendered from lib/navigation/flows.ts (#690).
 * These tests pin: every route that was in the sidebar before the regroup is
 * still there, /extract and /extractions were added, admin-only steps are
 * hidden for non-admins, and the four flow labels appear in order.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';

let mockUser: { app_metadata?: { is_admin?: boolean } } | null = { app_metadata: {} };

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));
jest.mock('@/contexts/ChatContext', () => ({
  useChat: () => ({ createNewChat: jest.fn() }),
}));
jest.mock('@/contexts/CommandPaletteContext', () => ({
  useCommandPaletteSafe: () => ({ open: jest.fn() }),
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/collections/abc',
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/components/language-switcher', () => ({
  LanguageSwitcherMinimal: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppSidebar } = require('@/components/app-sidebar');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SidebarProvider } = require('@/components/ui/sidebar');

function renderSidebar() {
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  );
}

function hrefs(): string[] {
  return screen
    .getAllByRole('link')
    .map((a) => a.getAttribute('href') ?? '')
    .filter((h) => h.startsWith('/'));
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: jest.fn(), removeListener: jest.fn(),
      addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn(),
    })),
  });
});

describe('AppSidebar signed-in flows', () => {
  beforeEach(() => { mockUser = { app_metadata: {} }; });

  it('renders the four flow labels in order and no legacy phase labels', () => {
    renderSidebar();
    const labels = screen.getAllByText(/^navigation\.flow(Ask|Explore|Code|Case)$/).map((el) => el.textContent);
    expect(labels).toEqual(['navigation.flowAsk', 'navigation.flowExplore', 'navigation.flowCode', 'navigation.flowCase']);
    expect(screen.queryByText('navigation.phasePlan')).not.toBeInTheDocument();
  });

  it('keeps every pre-#690 signed-in route and adds /extract and /extractions', () => {
    renderSidebar();
    const got = hrefs();
    for (const h of ['/', '/search', '/search/extractions', '/collections', '/schemas', '/chat', '/topics', '/history', '/precedents', '/reasoning-lines', '/extract', '/extractions']) {
      expect(got).toContain(h);
    }
  });

  it('hides admin-only routes from a non-admin', () => {
    renderSidebar();
    const got = hrefs();
    for (const h of ['/judge-fingerprint', '/argumentation-analysis', '/saved-searches', '/topic-modeling', '/admin']) {
      expect(got).not.toContain(h);
    }
    expect(screen.queryByText('navigation.administration')).not.toBeInTheDocument();
  });

  it('shows admin-only routes for an admin, with judge fingerprint inside the Case flow', () => {
    mockUser = { app_metadata: { is_admin: true } };
    renderSidebar();
    const got = hrefs();
    for (const h of ['/judge-fingerprint', '/argumentation-analysis', '/saved-searches', '/topic-modeling', '/admin']) {
      expect(got).toContain(h);
    }
    const caseGroup = screen.getByText('navigation.flowCase').closest('[data-sidebar="group"]') as HTMLElement;
    expect(within(caseGroup).getByRole('link', { name: /judgeFingerprint/ })).toHaveAttribute('href', '/judge-fingerprint');
  });

  it('marks the prefix-matched step active on a child route', () => {
    renderSidebar(); // pathname mocked as /collections/abc
    const link = screen.getByRole('link', { name: /researchCollections/ });
    expect(link.closest('[data-active="true"]')).not.toBeNull();
  });
});
