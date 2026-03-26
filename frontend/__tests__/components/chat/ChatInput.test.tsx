/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/lib/styles/components/chat/chat-input';

describe('ChatInput', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    onSubmit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a textarea with the current default placeholder', () => {
    render(<ChatInput {...defaultProps} />);

    expect(
      screen.getByPlaceholderText(/Message\.\.\./i)
    ).toBeInTheDocument();
  });

  it('calls onChange with the updated textarea value', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<ChatInput {...defaultProps} onChange={onChange} />);

    await user.type(screen.getByRole('textbox'), 'Hi');

    expect(onChange.mock.calls.map(([value]) => value)).toEqual(['H', 'i']);
  });

  it('submits from the form button for non-empty values', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    render(<ChatInput {...defaultProps} value="Test message" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button'));

    expect(onSubmit).toHaveBeenCalled();
  });

  it('submits on Enter and keeps Shift+Enter for multiline editing', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    const onChange = jest.fn();

    const { rerender } = render(
      <ChatInput {...defaultProps} value="Test message" onSubmit={onSubmit} onChange={onChange} />
    );

    await user.type(screen.getByRole('textbox'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<ChatInput {...defaultProps} value="Line 1" onSubmit={onSubmit} onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), '{Shift>}{Enter}{/Shift}');

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the submit button for blank values', () => {
    render(<ChatInput {...defaultProps} value="   " />);

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
