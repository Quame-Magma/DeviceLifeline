import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrashSummary } from './CrashSummary';
import type { CrashEvent } from '../../types/device.types';

const mk = (id: string, severity: string): CrashEvent => ({
  id,
  deviceId: 'd1',
  occurredAt: '2026-06-07T03:12:45Z',
  capturedAt: '2026-06-08T00:00:00Z',
  category: 'app_crash',
  severity,
  source: 'mock',
  title: 'x',
  detail: null,
  eventId: null,
});

describe('CrashSummary', () => {
  const events = [
    mk('1', 'critical'),
    mk('2', 'error'),
    mk('3', 'error'),
    mk('4', 'warning'),
  ];

  it('renders the total count', () => {
    render(<CrashSummary events={events} />);
    expect(screen.getByTestId('crash-summary-total')).toHaveTextContent(
      '4 total',
    );
  });

  it('counts events by severity', () => {
    render(<CrashSummary events={events} />);
    expect(screen.getByTestId('crash-summary-critical')).toHaveTextContent(
      '1 critical',
    );
    expect(screen.getByTestId('crash-summary-error')).toHaveTextContent(
      '2 error',
    );
    expect(screen.getByTestId('crash-summary-warning')).toHaveTextContent(
      '1 warning',
    );
  });

  it('renders zeros for an empty list', () => {
    render(<CrashSummary events={[]} />);
    expect(screen.getByTestId('crash-summary-total')).toHaveTextContent(
      '0 total',
    );
    expect(screen.getByTestId('crash-summary-critical')).toHaveTextContent(
      '0 critical',
    );
  });
});
