import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toast, ToastType } from '@/components/ui/toast/Toast';

describe('Toast', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  describe('Toast Types', () => {
    const types: ToastType[] = ['success', 'error', 'warning', 'info'];

    types.forEach((type) => {
      it(`renders ${type} toast with correct styling`, () => {
        render(
          <Toast type={type} title={`${type} message`} onClose={mockOnClose} />
        );

        expect(screen.getByText(`${type} message`)).toBeInTheDocument();
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Content', () => {
    it('renders title', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('renders description when provided', () => {
      render(
        <Toast
          type="info"
          title="Test Title"
          description="Test Description"
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('does not render description when not provided', () => {
      const { container } = render(
        <Toast type="info" title="Test Title" onClose={mockOnClose} />
      );

      expect(container.textContent).not.toContain('Test Description');
    });
  });

  describe('Actions', () => {
    it('renders action button when action is provided', () => {
      const mockAction = jest.fn();

      render(
        <Toast
          type="info"
          title="Test Title"
          action={{ label: 'Action Button', onClick: mockAction }}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('Action Button')).toBeInTheDocument();
    });

    it('calls action onClick and onClose when action button is clicked', () => {
      const mockAction = jest.fn();

      render(
        <Toast
          type="info"
          title="Test Title"
          action={{ label: 'Action Button', onClick: mockAction }}
          onClose={mockOnClose}
        />
      );

      const actionButton = screen.getByText('Action Button');
      fireEvent.click(actionButton);

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('does not render action button when action is not provided', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      expect(screen.queryByRole('button', { name: /action/i })).not.toBeInTheDocument();
    });
  });

  describe('Close Button', () => {
    it('renders close button', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      expect(screen.getByLabelText('Close notification')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      const closeButton = screen.getByLabelText('Close notification');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has role="alert"', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('has aria-label on close button', () => {
      render(<Toast type="info" title="Test Title" onClose={mockOnClose} />);

      expect(screen.getByLabelText('Close notification')).toBeInTheDocument();
    });

    it('hides icon from screen readers', () => {
      const { container } = render(
        <Toast type="info" title="Test Title" onClose={mockOnClose} />
      );

      const icon = container.querySelector('svg[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('renders CheckCircle icon for success type', () => {
      const { container } = render(
        <Toast type="success" title="Success" onClose={mockOnClose} />
      );

      // CheckCircle icon is rendered (we can verify by checking the component)
      expect(container.querySelector('.text-green-600')).toBeInTheDocument();
    });

    it('renders XCircle icon for error type', () => {
      const { container } = render(
        <Toast type="error" title="Error" onClose={mockOnClose} />
      );

      expect(container.querySelector('.text-red-600')).toBeInTheDocument();
    });

    it('renders AlertTriangle icon for warning type', () => {
      const { container } = render(
        <Toast type="warning" title="Warning" onClose={mockOnClose} />
      );

      expect(container.querySelector('.text-yellow-600')).toBeInTheDocument();
    });

    it('renders Info icon for info type', () => {
      const { container } = render(
        <Toast type="info" title="Info" onClose={mockOnClose} />
      );

      expect(container.querySelector('.text-blue-600')).toBeInTheDocument();
    });
  });
});
