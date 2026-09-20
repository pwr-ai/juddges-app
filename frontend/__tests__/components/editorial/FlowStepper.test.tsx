/**
 * FlowStepper tells the user which persona flow and which step they are on
 * (#690). It reads lib/navigation/flows.ts; it renders nothing on routes that
 * belong to no flow, and admin-only steps only for admins.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

let mockPathname = '/reasoning-lines/42';
let mockUser: { app_metadata?: { is_admin?: boolean } } | null = { app_metadata: {} };

jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));
jest.mock('@/contexts/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      key === 'navigation.flowStep' ? `Step ${values?.n} of ${values?.m}` : key,
  }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FlowStepper } = require('@/components/editorial/FlowStepper');

describe('FlowStepper', () => {
  beforeEach(() => {
    mockPathname = '/reasoning-lines/42';
    mockUser = { app_metadata: {} };
  });

  it('shows the flow name, step index and prev/next links on a flow route', () => {
    render(<FlowStepper />);
    const nav = screen.getByRole('navigation', { name: 'navigation.flowLabel' });
    expect(nav).toHaveTextContent('navigation.flowCase');
    expect(nav).toHaveTextContent('Step 2 of 2');
    expect(screen.getByRole('link', { name: /precedentSearch/ })).toHaveAttribute('href', '/precedents');
    expect(screen.queryByRole('link', { name: /judgeFingerprint/ })).not.toBeInTheDocument();
  });

  it('counts admin-only steps for an admin', () => {
    mockUser = { app_metadata: { is_admin: true } };
    render(<FlowStepper />);
    expect(screen.getByRole('navigation')).toHaveTextContent('Step 2 of 4');
    expect(screen.getByRole('link', { name: /judgeFingerprint/ })).toHaveAttribute('href', '/judge-fingerprint');
  });

  it('renders nothing outside a flow', () => {
    mockPathname = '/about';
    const { container } = render(<FlowStepper />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a signed-out visitor', () => {
    mockUser = null;
    const { container } = render(<FlowStepper />);
    expect(container).toBeEmptyDOMElement();
  });

  it('omits the previous link on the first step and the next link on the last', () => {
    mockPathname = '/search';
    render(<FlowStepper />);
    expect(screen.queryByText('common.previous')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /common\.next/ })).toHaveAttribute('href', '/chat');
  });
});
