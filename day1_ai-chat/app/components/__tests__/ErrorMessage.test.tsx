import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ErrorMessage from '../ErrorMessage';

describe('ErrorMessage', () => {
  const defaultProps = {
    error: new Error('Something broke'),
    onRetry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the error message text', () => {
    render(<ErrorMessage {...defaultProps} />);
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('renders fallback text when error.message is empty', () => {
    const error = new Error('');
    render(<ErrorMessage error={error} onRetry={defaultProps.onRetry} />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('renders a Retry button', () => {
    render(<ErrorMessage {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('calls onRetry when the Retry button is clicked', () => {
    render(<ErrorMessage {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(defaultProps.onRetry).toHaveBeenCalledTimes(1);
  });
});
