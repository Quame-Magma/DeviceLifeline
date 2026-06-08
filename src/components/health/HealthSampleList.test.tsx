import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthSampleList } from './HealthSampleList';
import type { HealthSample } from '../../types/device.types';

const SAMPLES: HealthSample[] = [
  {
    id: 'h2',
    deviceId: 'd1',
    capturedAt: '2026-06-08T11:00:00Z',
    cpuUsage: 10,
    memoryTotal: 100,
    memoryUsed: 30,
    diskTotal: 200,
    diskUsed: 100,
    healthScore: 82,
  },
  {
    id: 'h1',
    deviceId: 'd1',
    capturedAt: '2026-06-08T10:00:00Z',
    cpuUsage: 90,
    memoryTotal: 100,
    memoryUsed: 95,
    diskTotal: 200,
    diskUsed: 180,
    healthScore: 24,
  },
];

describe('HealthSampleList', () => {
  it('shows an empty state when there are no samples', () => {
    render(<HealthSampleList samples={[]} />);
    expect(screen.getByText('No samples yet')).toBeInTheDocument();
    expect(screen.queryByTestId('health-sample-table')).not.toBeInTheDocument();
  });

  it('renders a row per sample', () => {
    render(<HealthSampleList samples={SAMPLES} />);
    expect(screen.getByTestId('health-sample-row-h2')).toBeInTheDocument();
    expect(screen.getByTestId('health-sample-row-h1')).toBeInTheDocument();
  });

  it('renders each sample health score', () => {
    render(<HealthSampleList samples={SAMPLES} />);
    expect(screen.getByTestId('health-sample-row-h2')).toHaveTextContent('82');
    expect(screen.getByTestId('health-sample-row-h1')).toHaveTextContent('24');
  });

  it('renders the table when samples exist', () => {
    render(<HealthSampleList samples={SAMPLES} />);
    expect(screen.getByTestId('health-sample-table')).toBeInTheDocument();
  });
});
