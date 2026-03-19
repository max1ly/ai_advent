import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RagSources from '../RagSources';
import type { RagSource } from '@/lib/types';

const mockSources: RagSource[] = [
  {
    text: 'This is a test chunk about machine learning algorithms and their applications in modern data science.',
    source: 'ml-overview.pdf',
    section: 'Introduction',
    score: 0.23,
  },
  {
    text: 'Deep learning models have shown remarkable performance in natural language processing tasks, surpassing traditional approaches by significant margins across multiple benchmarks and evaluation criteria that test understanding.',
    source: 'deep-learning.pdf',
    section: 'Results',
    score: 0.45,
  },
];

describe('RagSources', () => {
  it('renders nothing when sources is empty', () => {
    const { container } = render(<RagSources sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders collapsed by default with source count', () => {
    render(<RagSources sources={mockSources} />);
    const button = screen.getByRole('button', { name: /sources \(2\)/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('ml-overview.pdf')).not.toBeInTheDocument();
  });

  it('expands to show source cards when clicked', () => {
    render(<RagSources sources={mockSources} />);
    const button = screen.getByRole('button', { name: /sources \(2\)/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('ml-overview.pdf')).toBeInTheDocument();
    expect(screen.getByText('deep-learning.pdf')).toBeInTheDocument();
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByText('0.23')).toBeInTheDocument();
    expect(screen.getByText('0.45')).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    render(<RagSources sources={mockSources} />);
    const button = screen.getByRole('button', { name: /sources \(2\)/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('ml-overview.pdf')).not.toBeInTheDocument();
  });

  it('truncates long text and shows Read more button', () => {
    render(<RagSources sources={mockSources} />);
    const button = screen.getByRole('button', { name: /sources \(2\)/i });
    fireEvent.click(button);
    expect(screen.getByText('Read more')).toBeInTheDocument();
  });

  it('shows full text when Read more is clicked', () => {
    render(<RagSources sources={mockSources} />);
    fireEvent.click(screen.getByRole('button', { name: /sources \(2\)/i }));
    fireEvent.click(screen.getByText('Read more'));
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.getByText(/surpassing traditional approaches/)).toBeInTheDocument();
  });
});
