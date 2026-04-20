import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SystemPromptDialog } from '../SystemPromptDialog';

const mockPrompts = [
  { id: 'p1', name: 'Default Assistant', content: 'You are helpful.', isDefault: true, createdAt: '2024-01-01' },
  { id: 'p2', name: 'Code Helper', content: 'You are a coder.', isDefault: false, createdAt: '2024-01-02' },
];

describe('SystemPromptDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompts: mockPrompts }),
    });
  });

  it('does not render when not open', () => {
    render(
      <SystemPromptDialog
        isOpen={false}
        onClose={vi.fn()}
        onPromptsChanged={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders prompt list when open', async () => {
    render(
      <SystemPromptDialog
        isOpen={true}
        onClose={vi.fn()}
        onPromptsChanged={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Default Assistant')).toBeInTheDocument();
      expect(screen.getByText('Code Helper')).toBeInTheDocument();
    });
  });

  it('shows create form when New Prompt button is clicked', async () => {
    render(
      <SystemPromptDialog
        isOpen={true}
        onClose={vi.fn()}
        onPromptsChanged={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('+ New Prompt')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('+ New Prompt'));
    expect(screen.getByLabelText('Prompt name')).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <SystemPromptDialog
        isOpen={true}
        onClose={onClose}
        onPromptsChanged={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows Delete button for prompts', async () => {
    render(
      <SystemPromptDialog
        isOpen={true}
        onClose={vi.fn()}
        onPromptsChanged={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('Delete Default Assistant')).toBeInTheDocument();
      expect(screen.getByLabelText('Delete Code Helper')).toBeInTheDocument();
    });
  });

  it('shows Set Default button for non-default prompts', async () => {
    render(
      <SystemPromptDialog
        isOpen={true}
        onClose={vi.fn()}
        onPromptsChanged={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Set Default')).toBeInTheDocument();
    });
  });
});
