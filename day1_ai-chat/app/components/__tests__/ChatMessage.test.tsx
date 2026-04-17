import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChatMessage from '../ChatMessage';
import type { DisplayMessage } from '@/lib/types';

vi.mock('../RagSources', () => ({ default: () => <div data-testid="rag-sources" /> }));
vi.mock('../WriteConfirmDialog', () => ({ default: () => <div data-testid="write-confirm" /> }));
vi.mock('../CopyButton', () => ({ CopyButton: () => <button>Copy</button> }));

describe('ChatMessage', () => {
  it('renders user message with correct styling', () => {
    const msg: DisplayMessage = { id: '1', role: 'user', content: 'Hello there' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  it('renders assistant message with markdown', () => {
    const msg: DisplayMessage = { id: '2', role: 'assistant', content: 'Hello **bold**' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('bold')).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });

  it('returns null for empty assistant content', () => {
    const msg: DisplayMessage = { id: '3', role: 'assistant', content: '' };
    const { container } = render(<ChatMessage message={msg} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders copy button for assistant messages', () => {
    const msg: DisplayMessage = { id: '4', role: 'assistant', content: 'Some text' };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('Copy')).toBeInTheDocument();
  });

  it('renders rag sources when present', () => {
    const msg: DisplayMessage = {
      id: '5',
      role: 'assistant',
      content: 'Answer',
      ragSources: [{ text: 'source1', score: 0.9, file: 'test.txt' }],
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByTestId('rag-sources')).toBeInTheDocument();
  });

  it('renders file attachments for user messages', () => {
    const msg: DisplayMessage = {
      id: '6',
      role: 'user',
      content: 'Check this file',
      files: [{ id: 1, filename: 'test.pdf', mediaType: 'application/pdf', size: 2048 }],
    };
    render(<ChatMessage message={msg} />);
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
  });

  it('renders pending write confirm dialogs', () => {
    const msg: DisplayMessage = { id: '7', role: 'assistant', content: 'Writing file' };
    const writes = [{ writeId: 'w1', path: '/tmp/test.ts', diff: '+line', isNewFile: true }];
    render(<ChatMessage message={msg} pendingWrites={writes} />);
    expect(screen.getByTestId('write-confirm')).toBeInTheDocument();
  });

  it('renders image attachment as img element', () => {
    const msg: DisplayMessage = {
      id: '8',
      role: 'user',
      content: 'See image',
      files: [{ id: 2, filename: 'photo.png', mediaType: 'image/png', size: 5000 }],
    };
    render(<ChatMessage message={msg} />);
    const img = screen.getByAltText('photo.png');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });
});
