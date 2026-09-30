/**
 * Whitespace around a highlighted chunk (#722).
 *
 * The unhighlighted segments render through ReactMarkdown, which trims
 * leading and trailing whitespace off a paragraph. The highlight itself is a
 * raw string, so the two used to fuse: "the appellant had" + "no standing".
 *
 * These assert on the assembled *text*, not the markup: every element is
 * present and correct in the broken version, so a structural assertion passes
 * while the sentence reads wrong.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { HighlightedText } from '@/lib/styles/components/highlighted-text';
import type { SearchChunk } from '@/types/search';

const chunk = (chunk_text: string): SearchChunk => ({
  document_id: 'doc-1',
  chunk_id: 'chunk-1',
  chunk_text,
});

describe('HighlightedText whitespace', () => {
  it('keeps the space before and after a mid-sentence highlight', () => {
    const { container } = render(
      <HighlightedText
        text="the appellant had no standing to bring the claim"
        chunks={[chunk('no standing')]}
      />
    );

    expect(container.textContent).toBe('the appellant had no standing to bring the claim');
  });

  it('still marks the chunk itself', () => {
    render(
      <HighlightedText
        text="the appellant had no standing to bring the claim"
        chunks={[chunk('no standing')]}
      />
    );

    expect(screen.getByText('no standing')).toHaveClass('bg-gold-soft');
  });

  it('keeps the space when the highlight opens the text', () => {
    const { container } = render(
      <HighlightedText text="no standing was shown" chunks={[chunk('no standing')]} />
    );

    expect(container.textContent).toBe('no standing was shown');
  });

  it('keeps the space when the highlight closes the text', () => {
    const { container } = render(
      <HighlightedText text="the court found no standing" chunks={[chunk('no standing')]} />
    );

    expect(container.textContent).toBe('the court found no standing');
  });

  it('keeps the spaces around two separate highlights', () => {
    const { container } = render(
      <HighlightedText
        text="the appellant had no standing and the respondent had no answer"
        chunks={[chunk('no standing'), chunk('no answer')]}
      />
    );

    expect(container.textContent).toBe(
      'the appellant had no standing and the respondent had no answer'
    );
  });

  it('still renders markdown inside an unhighlighted segment', () => {
    render(
      <HighlightedText text="the **appellant** had no standing" chunks={[chunk('no standing')]} />
    );

    expect(screen.getByText('appellant').tagName).toBe('STRONG');
  });
});
