import { render, screen } from '@testing-library/react';

import { CollectionPairBadge } from '@/app/collections/_components/CollectionPairBadge';

describe('CollectionPairBadge', () => {
  it('names the role and links to the comparison', () => {
    render(<CollectionPairBadge pair={{ id: 'p1', name: 'Fraud', role: 'PL', partner_collection_id: 'c-uk' }} />);
    const link = screen.getByRole('link', { name: /Fraud.*PL/ });
    expect(link).toHaveAttribute('href', '/compare/p1');
  });
});
