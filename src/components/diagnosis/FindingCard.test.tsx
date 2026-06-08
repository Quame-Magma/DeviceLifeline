import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FindingCard } from './FindingCard';
import type { DiagnosisFinding } from '../../types/device.types';

const FINDING: DiagnosisFinding = {
  id: 'f1',
  sessionId: 's1',
  orderIndex: 0,
  title: 'High memory pressure',
  cause: 'Available memory is running low.',
  evidence: 'Memory usage at 95%.',
  confidence: 80,
  suggestedAction: 'Close memory-heavy applications.',
};

describe('FindingCard', () => {
  it('renders the title and cause', () => {
    render(<FindingCard finding={FINDING} />);
    expect(screen.getByText('High memory pressure')).toBeInTheDocument();
    expect(
      screen.getByText('Available memory is running low.'),
    ).toBeInTheDocument();
  });

  it('renders the confidence percentage', () => {
    render(<FindingCard finding={FINDING} />);
    expect(screen.getByTestId('finding-confidence-f1')).toHaveTextContent(
      '80% confidence',
    );
  });

  it('renders the suggested action', () => {
    render(<FindingCard finding={FINDING} />);
    expect(
      screen.getByText('Close memory-heavy applications.'),
    ).toBeInTheDocument();
  });
});
