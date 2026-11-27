/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render } from '@testing-library/react';

import AccessibilityPage from '@/app/accessibility/page';
import CookiesPage from '@/app/cookies/page';
import TermsPage from '@/app/terms/page';
import TeamPage from '@/app/team/page';
import HelpPage from '@/app/help/page';
import { firstHeadingJump, headingLevels } from '../helpers/heading-order';

jest.mock('@/lib/store/tourStore', () => ({ useTourStore: () => jest.fn() }));

// The navbar owns the h1 on some routes; start from h1 so pages that rely on it are still checked.
describe.each([
  ['/accessibility', AccessibilityPage],
  ['/cookies', CookiesPage],
  ['/terms', TermsPage],
  ['/team', TeamPage],
  ['/help', HelpPage],
])('%s heading order', (_route, Page) => {
  it('never skips a heading level', () => {
    const { container } = render(<Page />);
    expect(headingLevels(container).length).toBeGreaterThan(0);
    expect(firstHeadingJump(container)).toBeNull();
  });
});

describe('/help quick links', () => {
  it('are real links, not role=button cards', () => {
    const { container } = render(<HelpPage />);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
    for (const name of ['Contact Support', 'About the Project', 'Documentation']) {
      const link = Array.from(container.querySelectorAll('h2 a')).find((a) => a.textContent === name);
      expect(link).toBeDefined();
    }
  });
});
