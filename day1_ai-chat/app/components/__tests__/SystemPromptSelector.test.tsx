import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SystemPromptSelector } from '../SystemPromptSelector';

const mockPrompts = [
  { id: 'p1', name: 'Default Assistant', content: 'You are helpful.', isDefault: true, createdAt: '2024-01-01' },
  { id: 'p2', name: 'Code Helper', content: 'You are a coder.', isDefault: false, createdAt: '2024-01-02' },
];

describe('SystemPromptSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompts: mockPrompts }),
    });
  });

  it('renders a select element with system prompt label', async () => {
    render(
      <SystemPromptSelector
        selectedPromptId="p1"
        onSelectPrompt={vi.fn()}
        onManageOpen={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByLabelText('System prompt')).toBeInTheDocument();
    });
  });

  it('loads and displays prompts from API', async () => {
    render(
      <SystemPromptSelector
        selectedPromptId="p1"
        onSelectPrompt={vi.fn()}
        onManageOpen={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Default Assistant (default)')).toBeInTheDocument();
      expect(screen.getByText('Code Helper')).toBeInTheDocument();
    });
  });

  it('calls onSelectPrompt when a prompt is selected', async () => {
    const onSelectPrompt = vi.fn();
    render(
      <SystemPromptSelector
        selectedPromptId="p1"
        onSelectPrompt={onSelectPrompt}
        onManageOpen={vi.fn()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Code Helper')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: 'p2' } });
    expect(onSelectPrompt).toHaveBeenCalledWith('p2', 'You are a coder.');
  });

  it('calls onManageOpen when Manage option is selected', async () => {
    const onManageOpen = vi.fn();
    render(
      <SystemPromptSelector
        selectedPromptId="p1"
        onSelectPrompt={vi.fn()}
        onManageOpen={onManageOpen}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Manage...')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('System prompt'), { target: { value: '__manage__' } });
    expect(onManageOpen).toHaveBeenCalled();
  });
});
