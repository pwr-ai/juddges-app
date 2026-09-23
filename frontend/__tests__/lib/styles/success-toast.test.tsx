/**
 * `showSuccessToast` drops `secondaryAction` when `primaryAction` is also
 * given (#709): it only ever passed one of the two to sonner's `action`
 * slot. The save-to-collection popover wires "View Collection" (primary)
 * and "Start Extraction" (secondary) on the same toast, so the secondary
 * button was dead UI — never rendered.
 *
 * These assert directly on the options object sonner's `toast.success`
 * receives: `action` must carry the primary action and `cancel` must carry
 * the secondary one, each with its own working `onClick` and the existing
 * dismissal bookkeeping (`dismissState.dismissedByAction`, clearing the
 * `onDismiss` timeout) intact for both.
 */

import { toast } from 'sonner';
import { showSuccessToast } from '@/lib/styles/components/success-toast';

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(() => 'toast-id'),
    dismiss: jest.fn(),
  },
}));

const mockToastSuccess = toast.success as jest.Mock;

describe('showSuccessToast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes both actions to sonner when both are provided', () => {
    const onView = jest.fn();
    const onExtract = jest.fn();

    showSuccessToast({
      title: 'Success',
      description: '5 documents saved to collection',
      primaryAction: { label: 'View Collection', onClick: onView },
      secondaryAction: { label: 'Start Extraction', onClick: onExtract },
    });

    expect(mockToastSuccess).toHaveBeenCalledTimes(1);
    const options = mockToastSuccess.mock.calls[0][1];

    // The primary action occupies sonner's `action` slot...
    expect(options.action).toMatchObject({ label: 'View Collection' });
    // ...and the secondary one must not be dropped: it occupies `cancel`,
    // which is what regressed in #709 (previously `undefined`).
    expect(options.cancel).toMatchObject({ label: 'Start Extraction' });
  });

  it('fires only the primary callback when the primary action is clicked', () => {
    const onView = jest.fn();
    const onExtract = jest.fn();

    showSuccessToast({
      title: 'Success',
      description: 'saved',
      primaryAction: { label: 'View Collection', onClick: onView },
      secondaryAction: { label: 'Start Extraction', onClick: onExtract },
    });

    const options = mockToastSuccess.mock.calls[0][1];
    options.action.onClick();

    expect(onView).toHaveBeenCalledTimes(1);
    expect(onExtract).not.toHaveBeenCalled();
  });

  it('fires only the secondary callback when the secondary action is clicked', () => {
    const onView = jest.fn();
    const onExtract = jest.fn();

    showSuccessToast({
      title: 'Success',
      description: 'saved',
      primaryAction: { label: 'View Collection', onClick: onView },
      secondaryAction: { label: 'Start Extraction', onClick: onExtract },
    });

    const options = mockToastSuccess.mock.calls[0][1];
    options.cancel.onClick();

    expect(onExtract).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it('falls back to the action slot when only secondaryAction is given, with no cancel slot', () => {
    const onExtract = jest.fn();

    showSuccessToast({
      title: 'Success',
      description: 'saved',
      secondaryAction: { label: 'Start Extraction', onClick: onExtract },
    });

    const options = mockToastSuccess.mock.calls[0][1];
    expect(options.action).toMatchObject({ label: 'Start Extraction' });
    expect(options.cancel).toBeUndefined();
  });

  it('does not fire onDismiss after the duration once an action was clicked, for either action', () => {
    jest.useFakeTimers();
    try {
      const onDismissPrimary = jest.fn();
      showSuccessToast({
        title: 'Success',
        description: 'saved',
        duration: 1000,
        onDismiss: onDismissPrimary,
        primaryAction: { label: 'View Collection', onClick: jest.fn() },
        secondaryAction: { label: 'Start Extraction', onClick: jest.fn() },
      });
      mockToastSuccess.mock.calls[0][1].action.onClick();
      jest.advanceTimersByTime(1000);
      expect(onDismissPrimary).not.toHaveBeenCalled();

      jest.clearAllMocks();

      const onDismissSecondary = jest.fn();
      showSuccessToast({
        title: 'Success',
        description: 'saved',
        duration: 1000,
        onDismiss: onDismissSecondary,
        primaryAction: { label: 'View Collection', onClick: jest.fn() },
        secondaryAction: { label: 'Start Extraction', onClick: jest.fn() },
      });
      mockToastSuccess.mock.calls[0][1].cancel.onClick();
      jest.advanceTimersByTime(1000);
      expect(onDismissSecondary).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
