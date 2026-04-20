import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SearchMessages } from '../SearchMessages';

describe('SearchMessages', () => {
  const mockOnClose = vi.fn();
  const mockOnScrollToMessage = vi.fn();
  const mockOnLoadSession = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <SearchMessages
        isOpen={false}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders search input when open', () => {
    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );
    expect(screen.getByPlaceholderText('Search messages...')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );

    const input = screen.getByPlaceholderText('Search messages...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('performs search after debounce and displays results', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            session_id: 'session-1',
            message_index: 2,
            role: 'user',
            content: 'hello world',
            snippet: 'hello <mark>world</mark>',
          },
        ],
      }),
    });

    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );

    const input = screen.getByPlaceholderText('Search messages...');
    fireEvent.change(input, { target: { value: 'world' } });

    // Advance past debounce
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/search?q=world'),
      );
    });

    await waitFor(() => {
      expect(screen.getByText('user')).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('calls onScrollToMessage for same-session result click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            session_id: 'session-1',
            message_index: 5,
            role: 'assistant',
            content: 'test content',
            snippet: 'test content',
          },
        ],
      }),
    });

    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );

    const input = screen.getByPlaceholderText('Search messages...');
    fireEvent.change(input, { target: { value: 'test' } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByText('assistant')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('assistant').closest('button')!);
    expect(mockOnScrollToMessage).toHaveBeenCalledWith(5);
    expect(mockOnClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('calls onLoadSession for different-session result click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            session_id: 'other-session',
            message_index: 1,
            role: 'user',
            content: 'other content',
            snippet: 'other content',
          },
        ],
      }),
    });

    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );

    const input = screen.getByPlaceholderText('Search messages...');
    fireEvent.change(input, { target: { value: 'other' } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByText('other session')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('user').closest('button')!);
    expect(mockOnLoadSession).toHaveBeenCalledWith('other-session');
    expect(mockOnClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('shows no results message when search returns empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    render(
      <SearchMessages
        isOpen={true}
        onClose={mockOnClose}
        currentSessionId="session-1"
        onScrollToMessage={mockOnScrollToMessage}
        onLoadSession={mockOnLoadSession}
      />,
    );

    const input = screen.getByPlaceholderText('Search messages...');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    vi.advanceTimersByTime(350);

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    vi.useRealTimers();
  });
});
