/**
 * The engine switch (#867): a prominent two-option radiogroup above the query
 * input — not a filter — with a one-line description and corpus size per
 * option, keyboard-operable, and an inline hint slot.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { SearchEngineSelector } from '@/components/search/v2/SearchEngineSelector';

describe('SearchEngineSelector', () => {
  it('renders both engines with size and description, and no test badge', () => {
    render(<SearchEngineSelector value="full" onChange={jest.fn()} />);

    const group = screen.getByRole('radiogroup', { name: 'Baza wyszukiwania' });
    expect(group).toBeInTheDocument();
    const full = screen.getByRole('radio', { name: /Pełna baza/ });
    const curated = screen.getByRole('radio', { name: /Baza kuratorowana/ });
    expect(full).toHaveAttribute('aria-checked', 'true');
    expect(curated).toHaveAttribute('aria-checked', 'false');
    expect(full).toHaveTextContent('~2,7 mln orzeczeń PL');
    expect(full).toHaveTextContent(/bez ekstrakcji/);
    expect(curated).toHaveTextContent('PL + EN');
    expect(curated).toHaveTextContent(/ekstrakcjami/);
    expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
  });

  it('has one tab stop (the selected option) and switches on click', () => {
    const onChange = jest.fn();
    render(<SearchEngineSelector value="full" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Pełna baza/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /Baza kuratorowana/ })).toHaveAttribute(
      'tabindex',
      '-1'
    );

    fireEvent.click(screen.getByRole('radio', { name: /Baza kuratorowana/ }));
    expect(onChange).toHaveBeenCalledWith('curated');
  });

  it('moves and selects with the arrow keys', () => {
    const onChange = jest.fn();
    render(<SearchEngineSelector value="full" onChange={onChange} />);
    const full = screen.getByRole('radio', { name: /Pełna baza/ });
    full.focus();

    fireEvent.keyDown(full, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('curated');
    expect(screen.getByRole('radio', { name: /Baza kuratorowana/ })).toHaveFocus();
  });

  it('keeps the full corpus visible but unavailable for guests', () => {
    const onChange = jest.fn();
    render(
      <SearchEngineSelector
        value="curated"
        onChange={onChange}
        fullUnavailableReason="Dostępna po zalogowaniu."
      />
    );
    const full = screen.getByRole('radio', { name: /Pełna baza/ });
    expect(full).toHaveAttribute('aria-disabled', 'true');
    expect(full).toHaveTextContent('Dostępna po zalogowaniu.');
    fireEvent.click(full);
    const curated = screen.getByRole('radio', { name: /Baza kuratorowana/ });
    fireEvent.keyDown(curated, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalledWith('full');
  });

  it('shows the inline hint next to the switch', () => {
    render(
      <SearchEngineSelector value="curated" onChange={jest.fn()} hint={<span>Powód wyboru</span>} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Powód wyboru');
  });
});
