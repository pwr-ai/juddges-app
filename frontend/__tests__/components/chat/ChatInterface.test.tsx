/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ChatInterface } from '@/lib/styles/components/chat/chat-interface';

describe('ChatInterface', () => {
  it('renders its empty state when no children are provided', () => {
    render(<ChatInterface />);

    expect(screen.getByText('Start a conversation')).toBeInTheDocument();
  });

  it('renders custom children instead of the empty state', () => {
    render(
      <ChatInterface>
        <div>Custom chat content</div>
      </ChatInterface>
    );

    expect(screen.getByText('Custom chat content')).toBeInTheDocument();
    expect(screen.queryByText('Start a conversation')).not.toBeInTheDocument();
  });
});
