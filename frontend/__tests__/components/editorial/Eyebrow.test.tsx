import React from 'react';
import { render } from '@testing-library/react';

import { Eyebrow } from '@/components/editorial/Eyebrow';

describe('Eyebrow', () => {
  it('gold tone uses the text-safe token, never the decorative gold', () => {
    const { container } = render(<Eyebrow tone="gold">Label</Eyebrow>);
    const cls = container.firstElementChild?.className ?? '';

    expect(cls).toContain('text-[color:var(--gold-text)]');
    expect(cls).not.toContain('var(--gold)');
  });
});
