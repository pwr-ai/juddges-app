/**
 * Extended tests for LandingPage component
 *
 * Covers: hero section, stats display, capabilities, demo queries,
 * loading state, and section rendering.
 *
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

import { LandingPage } from '@/components/landing/LandingPage';

// --- Mock framer-motion to avoid animation issues in tests ---

function createMotionComponent(tag: keyof React.JSX.IntrinsicElements) {
  return ({ children, ...props }: any) => {
    const {
      initial,
      animate,
      transition,
      whileInView,
      viewport,
      whileHover,
      whileTap,
      exit,
      variants,
      style: motionStyle,
      ...domProps
    } = props;

    return React.createElement(tag, domProps, children);
  };
}

jest.mock('framer-motion', () => ({
  motion: {
    section: createMotionComponent('section'),
    div: createMotionComponent('div'),
    h1: createMotionComponent('h1'),
    h2: createMotionComponent('h2'),
    h3: createMotionComponent('h3'),
    p: createMotionComponent('p'),
    span: createMotionComponent('span'),
    a: createMotionComponent('a'),
    li: createMotionComponent('li'),
    circle: createMotionComponent('circle'),
  },
  useInView: () => true,
  AnimatePresence: ({ children }: any) => children,
}));

describe('LandingPage', () => {
  describe('rendering without crashing', () => {
    it('renders with no props', () => {
      const { container } = render(<LandingPage />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with null stats', () => {
      const { container } = render(<LandingPage stats={null} />);
      expect(container.firstChild).toBeInTheDocument();
    });

    it('renders with stats and loading false', () => {
      const { container } = render(
        <LandingPage
          stats={{ total_documents: 5000, judgments: 5000, judgments_pl: 3000, judgments_uk: 2000 }}
          statsLoading={false}
        />
      );
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('hero section', () => {
    it('displays the JuDDGES branding', () => {
      render(<LandingPage />);
      expect(screen.getAllByText('JuDDGES').length).toBeGreaterThan(0);
    });

    it('shows the university name', () => {
      render(<LandingPage />);
      const matches = screen.getAllByText(/Wroclaw University of Science and Technology/i);
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('displays the platform description', () => {
      render(<LandingPage />);
      expect(
        screen.getByText(/open-source research platform/i)
      ).toBeInTheDocument();
    });

    it('shows "Try search" CTA link routing through /auth/login', () => {
      render(<LandingPage />);
      const searchLinks = screen.getAllByRole('link', { name: /try search/i });
      const heroLink = searchLinks.find((l) => l.getAttribute('href') === '/auth/login');
      expect(heroLink).toBeTruthy();
    });

    it('shows "Create free account" CTA link pointing to /auth/sign-up', () => {
      render(<LandingPage />);
      const links = screen.getAllByRole('link', { name: /create free account/i });
      expect(links.some((l) => l.getAttribute('href') === '/auth/sign-up')).toBe(true);
    });
  });

  describe('demo queries', () => {
    it('renders all 4 demo query links', () => {
      render(<LandingPage />);
      expect(screen.getByText(/popular demo queries/i)).toBeInTheDocument();
      expect(screen.getByText(/Frankowicze i abuzywne klauzule/i)).toBeInTheDocument();
      expect(screen.getByText(/Murder conviction appeal/i)).toBeInTheDocument();
      expect(screen.getByText(/Skarga do sądu administracyjnego/i)).toBeInTheDocument();
      expect(screen.getByText(/Consumer protection in financial services/i)).toBeInTheDocument();
    });

    it('demo query links route through /auth/login (search is auth-gated)', () => {
      render(<LandingPage />);
      const link = screen.getByRole('link', { name: /Murder conviction appeal/i });
      expect(link.getAttribute('href')).toBe('/auth/login');
    });
  });

  describe('stats display', () => {
    it('shows loading skeleton when statsLoading is true', () => {
      render(<LandingPage statsLoading={true} />);
      // When loading, an animated placeholder is shown instead of the stat
      const container = document.querySelector('.animate-pulse');
      expect(container).toBeInTheDocument();
    });

    it('displays judgment count when stats are provided', () => {
      render(
        <LandingPage
          stats={{ total_documents: 6000, judgments: 6000 }}
          statsLoading={false}
        />
      );
      // The AnimatedStat uses requestAnimationFrame, but with useInView mocked to true,
      // and immediate render, it should show at least "0" initially
      expect(screen.getByText(/Judgments indexed/i)).toBeInTheDocument();
    });

    it('displays static stat items', () => {
      render(<LandingPage stats={{ total_documents: 100 }} />);
      expect(screen.getAllByText(/Jurisdictions/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Free/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Academic access/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('capabilities section', () => {
    it('displays semantic search capability', () => {
      render(<LandingPage />);
      expect(screen.getByText('Semantic Search')).toBeInTheDocument();
      expect(screen.getByText(/Find relevant cases by meaning/i)).toBeInTheDocument();
    });

    it('displays schema extraction capability', () => {
      render(<LandingPage />);
      expect(screen.getByText('Schema Extraction')).toBeInTheDocument();
    });
  });

  describe('navigation links', () => {
    it('routes the schema-extraction CTA to /schema-chat', () => {
      render(<LandingPage />);
      const schemaLink = screen.getByRole('link', { name: /create a schema/i });
      expect(schemaLink).toHaveAttribute('href', '/schema-chat');
    });

    it('routes the primary hero CTAs to the auth pages', () => {
      render(<LandingPage />);
      const trySearch = screen.getAllByRole('link', { name: /try search/i });
      expect(trySearch.length).toBeGreaterThan(0);
      expect(trySearch[0]).toHaveAttribute('href', '/auth/login');
      const signUp = screen.getAllByRole('link', { name: /create free account/i });
      expect(signUp.length).toBeGreaterThan(0);
      signUp.forEach((link) => expect(link).toHaveAttribute('href', '/auth/sign-up'));
    });
  });

  describe('footer / trust section', () => {
    it('renders the university footer line', () => {
      render(<LandingPage />);
      // The trust/CTA section at the bottom
      const wustTexts = screen.getAllByText(/Wroclaw University/i);
      expect(wustTexts.length).toBeGreaterThanOrEqual(1);
    });
  });
});
