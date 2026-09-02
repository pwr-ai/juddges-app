/**
 * @jest-environment jsdom
 *
 * The invite-redeem endpoint can return a 429 from two different code
 * paths with two different body shapes:
 *  - the per-email limiter: {"detail": {"code": "...", "message": "..."}}
 *  - slowapi's own decorator handler: {"error": "Rate limit exceeded: ..."}
 *    with no `detail` at all.
 * Both must surface the same "wait and try again" message to the invitee
 * instead of the generic "check your invite code" fallback.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignUpForm } from '@/components/sign-up-form';

// A real createClient() opens a GoTrueClient with its own session-refresh
// timers, which never resolve in jsdom and leave Jest with an open handle.
// None of these tests exercise the redemption success path (that would call
// signInWithPassword), so a stub is enough.
jest.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: jest.fn().mockResolvedValue({ error: null }),
    },
  }),
}));

const WAIT_MESSAGE = 'Too many attempts. Please wait a while and try again.';

async function fillAndSubmit() {
  const user = userEvent.setup();
  render(<SignUpForm />);

  await user.type(screen.getByLabelText(/invite code/i), 'PILOT-2026');
  await user.type(screen.getByLabelText(/^email$/i), 'a@example.org');
  await user.type(screen.getByLabelText(/^password$/i), 'correct horse battery');
  await user.type(screen.getByLabelText(/repeat password/i), 'correct horse battery');
  await user.click(screen.getByRole('button', { name: /sign up/i }));
}

describe('SignUpForm invite redemption errors', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('shows a wait-and-retry message on the per-email-limiter 429 shape', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'INVITE_RATE_LIMIT_EXCEEDED',
            message: 'Too many registration attempts for this address. Try again later.',
          },
        }),
        { status: 429 }
      )
    );

    await fillAndSubmit();

    expect(await screen.findByText(WAIT_MESSAGE)).toBeInTheDocument();
  });

  it('shows the same wait-and-retry message on the slowapi decorator 429 shape (no detail)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'Rate limit exceeded: 60 per 1 hour' }),
        { status: 429 }
      )
    );

    await fillAndSubmit();

    expect(await screen.findByText(WAIT_MESSAGE)).toBeInTheDocument();
    // Must not fall through to the generic "check your invite code" message.
    expect(screen.queryByText(/check your invite code/i)).not.toBeInTheDocument();
  });

  it('still falls back to detail.message for a non-429 refusal', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: { code: 'INVALID_INVITE_CODE', message: 'This invite code is not valid.' },
        }),
        { status: 403 }
      )
    );

    await fillAndSubmit();

    expect(await screen.findByText('This invite code is not valid.')).toBeInTheDocument();
  });
});
