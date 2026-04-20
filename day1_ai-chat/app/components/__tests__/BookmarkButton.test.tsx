import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarkButton } from '../BookmarkButton';

describe('BookmarkButton', () => {
  const mockOnToggle = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  it('renders with unbookmarked state', () => {
    render(
      <BookmarkButton
        sessionId="test-session"
        messageIndex={0}
        isBookmarked={false}
        onToggle={mockOnToggle}
      />,
    );
    const button = screen.getByRole('button', { name: 'Add bookmark' });
    expect(button).toBeInTheDocument();
  });

  it('renders with bookmarked state', () => {
    render(
      <BookmarkButton
        sessionId="test-session"
        messageIndex={0}
        isBookmarked={true}
        onToggle={mockOnToggle}
      />,
    );
    const button = screen.getByRole('button', { name: 'Remove bookmark' });
    expect(button).toBeInTheDocument();
  });

  it('calls POST API and onToggle when adding bookmark', async () => {
    render(
      <BookmarkButton
        sessionId="test-session"
        messageIndex={2}
        isBookmarked={false}
        onToggle={mockOnToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/bookmarks', expect.objectContaining({
        method: 'POST',
      }));
      expect(mockOnToggle).toHaveBeenCalledWith(2, true);
    });
  });

  it('calls DELETE API and onToggle when removing bookmark', async () => {
    render(
      <BookmarkButton
        sessionId="test-session"
        messageIndex={3}
        isBookmarked={true}
        onToggle={mockOnToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/bookmarks', expect.objectContaining({
        method: 'DELETE',
      }));
      expect(mockOnToggle).toHaveBeenCalledWith(3, false);
    });
  });

  it('does nothing when sessionId is null', () => {
    render(
      <BookmarkButton
        sessionId={null}
        messageIndex={0}
        isBookmarked={false}
        onToggle={mockOnToggle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockOnToggle).not.toHaveBeenCalled();
  });
});
