/**
 * The engine switch (#867): a prominent two-option radiogroup above the query
 * input — not a filter — named "Polish native" / "Comparative" (EN) and
 * "Polski natywny" / "Porównawczy" (PL), each with its corpus size and a
 * one-line description; keyboard-operable, with an inline hint slot.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { SearchEngineSelector } from '@/components/search/v2/SearchEngineSelector';
import { LanguageProvider } from '@/contexts/LanguageContext';

const fullRadio = () => screen.getByRole('radio', { name: /Polish native/ });
const curatedRadio = () => screen.getByRole('radio', { name: /Comparative/ });

describe('SearchEngineSelector', () => {
  it('renders both modes with corpus and description, and no test badge (EN)', () => {
    render(<SearchEngineSelector value="full" onChange={jest.fn()} />);

    expect(screen.getByRole('radiogroup', { name: 'Search mode' })).toBeInTheDocument();
    expect(fullRadio()).toHaveAttribute('aria-checked', 'true');
    expect(curatedRadio()).toHaveAttribute('aria-checked', 'false');
    expect(fullRadio()).toHaveTextContent('Polish native· full corpus (~2.7M judgments)');
    expect(fullRadio()).toHaveTextContent(/without extractions/);
    expect(curatedRadio()).toHaveTextContent(
      'Comparative· PL + EN across jurisdictions (with extractions)'
    );
    expect(curatedRadio()).toHaveTextContent(/~12k/);
    expect(screen.queryByText(/test/i)).not.toBeInTheDocument();
  });

  it('uses the Polish labels under the PL locale', () => {
    render(
      <LanguageProvider initialLocale="pl">
        <SearchEngineSelector value="full" onChange={jest.fn()} />
      </LanguageProvider>
    );
    expect(screen.getByRole('radiogroup', { name: 'Tryb wyszukiwania' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Polski natywny/ })).toHaveTextContent(
      'Polski natywny· pełna baza (~2,7 mln orzeczeń)'
    );
    expect(screen.getByRole('radio', { name: /Porównawczy/ })).toHaveTextContent(
      'Porównawczy· PL + EN, jurysdykcje (z ekstrakcjami)'
    );
  });

  it('has one tab stop (the selected option) and switches on click', () => {
    const onChange = jest.fn();
    render(<SearchEngineSelector value="full" onChange={onChange} />);
    expect(fullRadio()).toHaveAttribute('tabindex', '0');
    expect(curatedRadio()).toHaveAttribute('tabindex', '-1');

    fireEvent.click(curatedRadio());
    expect(onChange).toHaveBeenCalledWith('curated');
  });

  it('moves and selects with the arrow keys', () => {
    const onChange = jest.fn();
    render(<SearchEngineSelector value="full" onChange={onChange} />);
    fullRadio().focus();

    fireEvent.keyDown(fullRadio(), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('curated');
    expect(curatedRadio()).toHaveFocus();
  });

  it('keeps the full corpus visible but unavailable for guests', () => {
    const onChange = jest.fn();
    render(<SearchEngineSelector value="curated" onChange={onChange} fullUnavailable />);
    expect(fullRadio()).toHaveAttribute('aria-disabled', 'true');
    expect(fullRadio()).toHaveTextContent('Available after signing in.');
    fireEvent.click(fullRadio());
    fireEvent.keyDown(curatedRadio(), { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalledWith('full');
  });

  it('shows the inline hint next to the switch', () => {
    render(
      <SearchEngineSelector value="curated" onChange={jest.fn()} hint={<span>Why this mode</span>} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Why this mode');
  });
});
