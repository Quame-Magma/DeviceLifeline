import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResourceUsageBars } from './ResourceUsageBars';
import type { HealthSample } from '../../types/device.types';

const SAMPLE: HealthSample = {
  id: 'h1',
  deviceId: 'd1',
  capturedAt: '2026-06-08T10:00:00Z',
  cpuUsage: 25,
  memoryTotal: 16 * 1024 ** 3, // 16 GB
  memoryUsed: 8 * 1024 ** 3, // 8 GB
  diskTotal: 500 * 1024 ** 3,
  diskUsed: 250 * 1024 ** 3,
  diskName: 'D:\\',
  diskCount: 2,
  healthScore: 70,
};

describe('ResourceUsageBars', () => {
  it('renders the CPU percentage', () => {
    render(<ResourceUsageBars sample={SAMPLE} />);
    expect(screen.getByTestId('usage-pct-cpu')).toHaveTextContent('25%');
  });

  it('renders the memory percentage from used/total', () => {
    render(<ResourceUsageBars sample={SAMPLE} />);
    expect(screen.getByTestId('usage-pct-memory')).toHaveTextContent('50%');
  });

  it('renders the disk percentage from used/total', () => {
    render(<ResourceUsageBars sample={SAMPLE} />);
    expect(screen.getByTestId('usage-pct-disk')).toHaveTextContent('50%');
  });

  it('explains when the disk row is the highest usage across multiple disks', () => {
    render(<ResourceUsageBars sample={SAMPLE} />);
    expect(screen.getByText('Most constrained disk')).toBeInTheDocument();
    expect(screen.getByTestId('usage-detail-disk')).toHaveTextContent(
      'highest usage across 2 disks',
    );
  });

  it('renders the memory detail with human-readable bytes', () => {
    render(<ResourceUsageBars sample={SAMPLE} />);
    expect(screen.getByTestId('usage-detail-memory')).toHaveTextContent(
      '8.0 GB / 16.0 GB',
    );
  });

  it('guards against a zero total without dividing by zero', () => {
    const empty: HealthSample = { ...SAMPLE, diskTotal: 0, diskUsed: 0 };
    render(<ResourceUsageBars sample={empty} />);
    expect(screen.getByTestId('usage-pct-disk')).toHaveTextContent('0%');
  });
});
