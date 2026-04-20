import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KeyboardShortcuts } from '../KeyboardShortcuts';
import type { ShortcutHandlers } from '@/lib/keyboard-shortcuts';

describe('KeyboardShortcuts', () => {
  const createHandlers = (): ShortcutHandlers => ({
    onNewChat: vi.fn(),
    onToggleSidebar: vi.fn(),
    onCopyLastAssistantMessage: vi.fn(),
    onCloseDialog: vi.fn(),
    onShowHelp: vi.fn(),
  });

  it('renders nothing visible', () => {
    const handlers = createHandlers();
    const { container } = render(<KeyboardShortcuts handlers={handlers} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls onNewChat on Cmd+K', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(handlers.onNewChat).toHaveBeenCalledTimes(1);
  });

  it('calls onNewChat on Ctrl+K', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(handlers.onNewChat).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleSidebar on Cmd+/', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: '/', metaKey: true });
    expect(handlers.onToggleSidebar).toHaveBeenCalledTimes(1);
  });

  it('calls onCopyLastAssistantMessage on Cmd+Shift+C', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: 'C', metaKey: true, shiftKey: true });
    expect(handlers.onCopyLastAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it('calls onCloseDialog on Escape', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handlers.onCloseDialog).toHaveBeenCalledTimes(1);
  });

  it('calls onShowHelp on ? when no input focused', () => {
    const handlers = createHandlers();
    render(<KeyboardShortcuts handlers={handlers} />);
    fireEvent.keyDown(document, { key: '?' });
    expect(handlers.onShowHelp).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onShowHelp on ? when input is focused', () => {
    const handlers = createHandlers();
    render(
      <div>
        <input data-testid="text-input" />
        <KeyboardShortcuts handlers={handlers} />
      </div>,
    );
    const input = document.querySelector('input')!;
    input.focus();
    fireEvent.keyDown(document, { key: '?' });
    expect(handlers.onShowHelp).not.toHaveBeenCalled();
  });

  it('cleans up listener on unmount', () => {
    const handlers = createHandlers();
    const { unmount } = render(<KeyboardShortcuts handlers={handlers} />);
    unmount();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(handlers.onNewChat).not.toHaveBeenCalled();
  });
});
