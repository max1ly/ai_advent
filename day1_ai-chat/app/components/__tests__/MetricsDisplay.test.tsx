import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MetricsDisplay } from '../MetricsDisplay';

describe('MetricsDisplay', () => {
  const mockProps = {
    metrics: null,
    strategy: 'sliding-window' as const,
    windowSize: 10,
    branches: [],
    activeBranchId: null,
    onStrategyChange: vi.fn(),
    onWindowSizeChange: vi.fn(),
    onNewChat: vi.fn(),
    onCheckpoint: vi.fn(),
    onSwitchBranch: vi.fn(),
    onMemoryOpen: vi.fn(),
    onInvariantsOpen: vi.fn(),
    invariantCount: 0,
    onIndexOpen: vi.fn(),
    ragEnabled: true,
    onRagToggle: vi.fn(),
    ragThreshold: 0.5,
    ragTopK: 10,
    onRagThresholdChange: vi.fn(),
    onRagTopKChange: vi.fn(),
    ragRerank: true,
    onRagRerankToggle: vi.fn(),
  };

  it('renders window size input for sliding-window strategy', () => {
    render(<MetricsDisplay {...mockProps} />);
    const inputs = screen.getAllByDisplayValue('10');
    const windowInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Window:'));
    expect(windowInput).toBeInTheDocument();
  });

  it('clamps window size 0 to minimum value 2 instead of resetting to 10', () => {
    const onWindowSizeChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onWindowSizeChange={onWindowSizeChange} />);

    const inputs = screen.getAllByDisplayValue('10');
    const windowInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Window:'));

    fireEvent.change(windowInput!, { target: { value: '0' } });

    // Should clamp to min=2, NOT reset to default 10
    expect(onWindowSizeChange).toHaveBeenCalledWith(2);
  });

  it('accepts valid window size values', () => {
    const onWindowSizeChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onWindowSizeChange={onWindowSizeChange} />);

    const inputs = screen.getAllByDisplayValue('10');
    const windowInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Window:'));

    fireEvent.change(windowInput!, { target: { value: '5' } });

    expect(onWindowSizeChange).toHaveBeenCalledWith(5);
  });

  it('clamps top-k 0 to minimum value 1 instead of resetting to 10', () => {
    const onRagTopKChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onRagTopKChange={onRagTopKChange} />);

    // Find the Top-K input by searching for inputs with value 10 and checking context
    const inputs = screen.getAllByDisplayValue('10');
    const topKInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Top-K'));

    expect(topKInput).toBeInTheDocument();
    fireEvent.change(topKInput!, { target: { value: '0' } });

    // Should clamp to min=1, NOT reset to default 10
    expect(onRagTopKChange).toHaveBeenCalledWith(1);
  });

  it('accepts valid top-k values', () => {
    const onRagTopKChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onRagTopKChange={onRagTopKChange} />);

    const inputs = screen.getAllByDisplayValue('10');
    const topKInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Top-K'));

    fireEvent.change(topKInput!, { target: { value: '25' } });

    expect(onRagTopKChange).toHaveBeenCalledWith(25);
  });

  it('resets to default 10 for invalid (empty) window size input', () => {
    const onWindowSizeChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onWindowSizeChange={onWindowSizeChange} />);

    const inputs = screen.getAllByDisplayValue('10');
    const windowInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Window:'));

    fireEvent.change(windowInput!, { target: { value: '' } });

    // Empty string → NaN → default 10, then clamped to max(2, 10) = 10
    expect(onWindowSizeChange).toHaveBeenCalledWith(10);
  });

  it('resets to default 10 for invalid (empty) top-k input', () => {
    const onRagTopKChange = vi.fn();
    render(<MetricsDisplay {...mockProps} onRagTopKChange={onRagTopKChange} />);

    const inputs = screen.getAllByDisplayValue('10');
    const topKInput = inputs.find((input) => input.closest('label')?.textContent?.includes('Top-K'));

    fireEvent.change(topKInput!, { target: { value: '' } });

    // Empty string → NaN → default 10, then clamped to max(1, 10) = 10
    expect(onRagTopKChange).toHaveBeenCalledWith(10);
  });
});
