import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RelatedDocuments } from '@/app/documents/[id]/_components/RelatedDocuments';

describe('RelatedDocuments', () => {
  it('explains a zero-result comparison instead of removing the section', async () => {
    const onNavigate = jest.fn();

    render(
      <RelatedDocuments
        similarDocs={[]}
        enrichedSimilarDocs={[]}
        onNavigate={onNavigate}
      />,
    );

    // The section heading must survive — a vanishing section reads as a bug.
    expect(
      screen.getByRole('heading', { name: 'Similar Documents' }),
    ).toBeInTheDocument();

    // What happened
    expect(screen.getByText(/no similar documents found/i)).toBeInTheDocument();
    // Why
    expect(
      screen.getByText(/nothing came back close enough to list/i),
    ).toBeInTheDocument();

    // What next — a working exit
    await userEvent.click(screen.getByRole('button', { name: /search the corpus/i }));
    expect(onNavigate).toHaveBeenCalledWith('/search');
  });

  it('still renders the result grid when similar documents exist', () => {
    render(
      <RelatedDocuments
        similarDocs={[
          {
            document_id: '/doc/abc-123',
            title: 'Judgment of the Court of Appeal',
          } as never,
        ]}
        enrichedSimilarDocs={[]}
        onNavigate={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Judgment of the Court of Appeal'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/no similar documents found/i)).not.toBeInTheDocument();
  });
});
