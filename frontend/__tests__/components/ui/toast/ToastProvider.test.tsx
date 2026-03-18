import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/toast/ToastProvider';

// Test component that uses the toast hook
function TestComponent() {
  const toast = useToast();

  return (
    <div>
      <button onClick={() => toast.success('Success Title', 'Success Description')}>
        Show Success
      </button>
      <button onClick={() => toast.error('Error Title', 'Error Description')}>
        Show Error
      </button>
      <button onClick={() => toast.warning('Warning Title', 'Warning Description')}>
        Show Warning
      </button>
      <button onClick={() => toast.info('Info Title', 'Info Description')}>
        Show Info
      </button>
      <button
        onClick={() =>
          toast.showToast({
            type: 'success',
            title: 'Custom',
            description: 'Custom Description',
            duration: 0, // Don't auto-dismiss
            action: {
              label: 'Custom Action',
              onClick: () => console.log('Action clicked'),
            },
          })
        }
      >
        Show Custom
      </button>
      <button onClick={() => toast.dismissAll()}>Dismiss All</button>
    </div>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  it('renders children', () => {
    render(
      <ToastProvider>
        <div>Test Content</div>
      </ToastProvider>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('throws error when useToast is used outside ToastProvider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useToast must be used within ToastProvider');

    console.error = originalError;
  });

  describe('Toast Methods', () => {
    it('shows success toast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));

      expect(screen.getByText('Success Title')).toBeInTheDocument();
      expect(screen.getByText('Success Description')).toBeInTheDocument();
    });

    it('shows error toast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Error'));

      expect(screen.getByText('Error Title')).toBeInTheDocument();
      expect(screen.getByText('Error Description')).toBeInTheDocument();
    });

    it('shows warning toast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Warning'));

      expect(screen.getByText('Warning Title')).toBeInTheDocument();
      expect(screen.getByText('Warning Description')).toBeInTheDocument();
    });

    it('shows info toast', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Info'));

      expect(screen.getByText('Info Title')).toBeInTheDocument();
      expect(screen.getByText('Info Description')).toBeInTheDocument();
    });

    it('shows custom toast with action', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Custom'));

      expect(screen.getByText('Custom')).toBeInTheDocument();
      expect(screen.getByText('Custom Description')).toBeInTheDocument();
      expect(screen.getByText('Custom Action')).toBeInTheDocument();
    });
  });

  describe('Toast Lifecycle', () => {
    it('auto-dismisses toast after default duration', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      expect(screen.getByText('Success Title')).toBeInTheDocument();

      // Fast-forward time by default duration (5000ms)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Success Title')).not.toBeInTheDocument();
      });
    });

    it('auto-dismisses toast after custom duration', async () => {
      const TestCustomDuration = () => {
        const toast = useToast();
        return (
          <button onClick={() => toast.success('Custom Duration', undefined, 1000)}>
            Show Custom Duration
          </button>
        );
      };

      render(
        <ToastProvider>
          <TestCustomDuration />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Custom Duration'));
      expect(screen.getByText('Custom Duration')).toBeInTheDocument();

      // Fast-forward time by custom duration (1000ms)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.queryByText('Custom Duration')).not.toBeInTheDocument();
      });
    });

    it('does not auto-dismiss when duration is 0', async () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Custom'));
      expect(screen.getByText('Custom')).toBeInTheDocument();

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(10000);
      });

      // Toast should still be visible
      expect(screen.getByText('Custom')).toBeInTheDocument();
    });

    it('manually dismisses toast when close button is clicked', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      expect(screen.getByText('Success Title')).toBeInTheDocument();

      const closeButton = screen.getByLabelText('Close notification');
      fireEvent.click(closeButton);

      expect(screen.queryByText('Success Title')).not.toBeInTheDocument();
    });

    it('dismisses all toasts when dismissAll is called', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      // Show multiple toasts
      fireEvent.click(screen.getByText('Show Success'));
      fireEvent.click(screen.getByText('Show Error'));
      fireEvent.click(screen.getByText('Show Warning'));

      expect(screen.getByText('Success Title')).toBeInTheDocument();
      expect(screen.getByText('Error Title')).toBeInTheDocument();
      expect(screen.getByText('Warning Title')).toBeInTheDocument();

      // Dismiss all
      fireEvent.click(screen.getByText('Dismiss All'));

      expect(screen.queryByText('Success Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Error Title')).not.toBeInTheDocument();
      expect(screen.queryByText('Warning Title')).not.toBeInTheDocument();
    });
  });

  describe('Multiple Toasts', () => {
    it('can show multiple toasts at once', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      fireEvent.click(screen.getByText('Show Error'));

      expect(screen.getByText('Success Title')).toBeInTheDocument();
      expect(screen.getByText('Error Title')).toBeInTheDocument();
    });

    it('stacks toasts in order', () => {
      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      fireEvent.click(screen.getByText('Show Success'));
      fireEvent.click(screen.getByText('Show Error'));
      fireEvent.click(screen.getByText('Show Warning'));

      const alerts = screen.getAllByRole('alert');
      expect(alerts).toHaveLength(3);
    });
  });

  describe('Accessibility', () => {
    it('has aria-live region for toasts', () => {
      const { container } = render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      );

      const liveRegion = container.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });
  });
});
