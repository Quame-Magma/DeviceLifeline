import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RestorePlanStepsTable } from './RestorePlanStepsTable';
import type { RestorePlanStep } from '../../types/device.types';

const STEPS: RestorePlanStep[] = [
  {
    id: 'step-1',
    planId: 'plan-1',
    orderIndex: 0,
    softwareName: 'Google Chrome',
    targetVersion: '126.0',
    wingetId: 'Google.Chrome',
    source: 'winget',
  },
  {
    id: 'step-2',
    planId: 'plan-1',
    orderIndex: 1,
    softwareName: 'Special Vendor Utility',
    targetVersion: null,
    wingetId: null,
    source: 'winget',
  },
];

describe('RestorePlanStepsTable', () => {
  it('renders resolved package IDs', () => {
    render(<RestorePlanStepsTable steps={STEPS} />);

    expect(screen.getByText('Google.Chrome')).toBeInTheDocument();
  });

  it('flags unresolved package IDs for review', () => {
    render(<RestorePlanStepsTable steps={STEPS} />);

    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });

  it('filters by package ID', () => {
    render(<RestorePlanStepsTable steps={STEPS} />);
    const input = screen.getByRole('searchbox', { name: /search plan steps/i });

    fireEvent.change(input, { target: { value: 'google.chrome' } });

    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.queryByText('Special Vendor Utility')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 steps')).toBeInTheDocument();
  });
});
