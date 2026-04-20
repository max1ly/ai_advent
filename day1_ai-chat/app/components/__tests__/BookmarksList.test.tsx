import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BookmarksList } from '../BookmarksList';
import type { BookmarkEntry } from '../BookmarksList';

describe('BookmarksList', () => {
  const mockOnClose = vi.fn();
  const mockOnScrollToMessage = vi.fn();

  const sampleBookmarks: BookmarkEntry[] = [
    { messageIndex: 0, label: 'bookmark', contentPreview: 'Hello, this is a user message' },
    { messageIndex: 3, label: 'bookmark', contentPreview: 'This is an assistant reply with details' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when not open', () => {
    const { container } = render(
      <BookmarksList
        isOpen={false}
        onClose={mockOnClose}
        bookmarks={sampleBookmarks}
        onScrollToMessage={mockOnScrollToMessage}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders bookmarks when open', () => {
    render(
      <BookmarksList
        isOpen={true}
        onClose={mockOnClose}
        bookmarks={sampleBookmarks}
        onScrollToMessage={mockOnScrollToMessage}
      />,
    );
    expect(screen.getByText('Bookmarks')).toBeInTheDocument();
    expect(screen.getByText('Message #1')).toBeInTheDocument();
    expect(screen.getByText('Message #4')).toBeInTheDocument();
    expect(screen.getByText('Hello, this is a user message')).toBeInTheDocument();
  });

  it('shows empty state when no bookmarks', () => {
    render(
      <BookmarksList
        isOpen={true}
        onClose={mockOnClose}
        bookmarks={[]}
        onScrollToMessage={mockOnScrollToMessage}
      />,
    );
    expect(screen.getByText(/No bookmarks yet/)).toBeInTheDocument();
  });

  it('calls onScrollToMessage and onClose when clicking a bookmark', () => {
    render(
      <BookmarksList
        isOpen={true}
        onClose={mockOnClose}
        bookmarks={sampleBookmarks}
        onScrollToMessage={mockOnScrollToMessage}
      />,
    );

    fireEvent.click(screen.getByText('Message #1'));
    expect(mockOnScrollToMessage).toHaveBeenCalledWith(0);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when clicking the close button', () => {
    render(
      <BookmarksList
        isOpen={true}
        onClose={mockOnClose}
        bookmarks={sampleBookmarks}
        onScrollToMessage={mockOnScrollToMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close bookmarks' }));
    expect(mockOnClose).toHaveBeenCalled();
  });
});
