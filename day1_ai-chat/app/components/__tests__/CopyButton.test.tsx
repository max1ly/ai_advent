import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CopyButton } from '../CopyButton';

describe('CopyButton', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders a copy button', () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByRole('button', { name: /copy message/i })).toBeInTheDocument();
  });

  it('writes text to clipboard and shows Copied on click', async () => {
    render(<CopyButton text="hello world" />);
    const button = screen.getByRole('button', { name: /copy message/i });
    fireEvent.click(button);
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
      expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
    });
  });
});
