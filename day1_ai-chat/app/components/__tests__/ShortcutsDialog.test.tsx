import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ShortcutsDialog } from '../ShortcutsDialog';

describe('ShortcutsDialog', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<ShortcutsDialog isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when isOpen is true', () => {
    render(<ShortcutsDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
  });

  it('displays all shortcut definitions', () => {
    render(<ShortcutsDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('New Chat')).toBeInTheDocument();
    expect(screen.getByText('Toggle Sidebar')).toBeInTheDocument();
    expect(screen.getByText('Copy Last Message')).toBeInTheDocument();
    expect(screen.getByText('Close Dialog')).toBeInTheDocument();
    expect(screen.getByText('Show Shortcuts')).toBeInTheDocument();
  });

  it('displays keyboard shortcut keys', () => {
    render(<ShortcutsDialog isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Cmd/Ctrl + K')).toBeInTheDocument();
    expect(screen.getByText('Escape')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close shortcuts dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('shortcuts-dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when dialog content is clicked', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Keyboard Shortcuts'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
