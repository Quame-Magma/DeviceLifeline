import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HealthAlertList } from './HealthAlertList';
import type { HealthAlert } from '../../types/device.types';

const mk = (id: string, acknowledged: boolean): HealthAlert => ({
  id,
  deviceId: 'd1',
  sampleId: 's1',
  createdAt: '2026-06-08T10:00:00Z',
  kind: 'memory_critical',
  severity: 'critical',
  title: 'Memory critically high',
  detail: 'Memory usage is at 95%.',
  value: 95,
  acknowledged,
});

describe('HealthAlertList', () => {
  it('renders the alert title and detail', () => {
    render(
      <HealthAlertList alerts={[mk('a1', false)]} onAcknowledge={() => {}} />,
    );
    expect(screen.getByText('Memory critically high')).toBeInTheDocument();
    expect(screen.getByText('Memory usage is at 95%.')).toBeInTheDocument();
  });

  it('shows an Acknowledge button for unacknowledged alerts and fires the callback', () => {
    const onAcknowledge = vi.fn();
    render(
      <HealthAlertList
        alerts={[mk('a1', false)]}
        onAcknowledge={onAcknowledge}
      />,
    );
    const button = screen.getByTestId('alert-ack-a1');
    fireEvent.click(button);
    expect(onAcknowledge).toHaveBeenCalledWith('a1');
  });

  it('shows an acknowledged label and no button for acknowledged alerts', () => {
    render(
      <HealthAlertList alerts={[mk('a2', true)]} onAcknowledge={() => {}} />,
    );
    expect(screen.getByTestId('alert-state-a2')).toHaveTextContent(
      'Acknowledged',
    );
    expect(screen.queryByTestId('alert-ack-a2')).not.toBeInTheDocument();
  });
});
