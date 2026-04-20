import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SessionHistory } from '../SessionHistory';

const mockSessions = [
  { session_id: 'abc-123', started: '2024-01-15 10:00:00', last_active: '2024-01-15 11:30:00', message_count: 8 },
  { session_id: 'def-456', started: '2024-01-14 09:00:00', last_active: '2024-01-14 09:45:00', message_count: 4 },
];

describe('SessionHistory', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <SessionHistory
        currentSessionId={null}
        onSelectSession={() => {}}
        isOpen={false}
        onClose={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders session list when open', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    render(
      <SessionHistory
        currentSessionId="abc-123"
        onSelectSession={() => {}}
        isOpen={true}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Session History')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Current session')).toBeInTheDocument();
    });

    expect(screen.getByText('8 messages')).toBeInTheDocument();
    expect(screen.getByText('4 messages')).toBeInTheDocument();
  });

  it('calls onSelectSession when a session is clicked', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: mockSessions }),
    });

    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <SessionHistory
        currentSessionId="abc-123"
        onSelectSession={onSelect}
        isOpen={true}
        onClose={onClose}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('4 messages')).toBeInTheDocument();
    });

    const sessionButton = screen.getByText('4 messages').closest('button')!;
    fireEvent.click(sessionButton);

    expect(onSelect).toHaveBeenCalledWith('def-456');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no sessions', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ sessions: [] }),
    });

    render(
      <SessionHistory
        currentSessionId={null}
        onSelectSession={() => {}}
        isOpen={true}
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('No past sessions')).toBeInTheDocument();
    });
  });
});
