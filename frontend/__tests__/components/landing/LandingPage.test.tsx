import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';

import { LandingPage } from '@/components/landing/LandingPage';

function createMotionComponent(tag: keyof React.JSX.IntrinsicElements) {
  return ({ children, ...props }: any) => {
    const {
      initial,
      animate,
      transition,
      whileInView,
      viewport,
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
    p: createMotionComponent('p'),
  },
  useInView: () => true,
}));

describe('LandingPage', () => {
  it('prioritizes search entry and shows demo queries', () => {
    render(
      <LandingPage
        stats={{
          total_documents: 1200,
          judgments: 1200,
          judgments_pl: 700,
          judgments_uk: 500,
        }}
      />
    );

    expect(
      screen
        .getAllByRole('link', { name: /try search/i })
        .some((link) => link.getAttribute('href') === '/search')
    ).toBe(true);
    expect(screen.getByRole('link', { name: /frankowicze i abuzywne klauzule/i })).toHaveAttribute(
      'href',
      expect.stringContaining('/search?')
    );
    expect(screen.getByText(/popular demo queries/i)).toBeInTheDocument();
  });
});
