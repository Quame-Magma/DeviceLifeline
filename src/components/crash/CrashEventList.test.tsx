import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CrashEventList } from './CrashEventList';
import type { CrashEvent } from '../../types/device.types';

const EVENTS: CrashEvent[] = [
  {
    id: 'e1',
    deviceId: 'd1',
    occurredAt: '2026-06-07T03:12:45Z',
    capturedAt: '2026-06-08T00:00:00Z',
    category: 'bsod',
    severity: 'critical',
    source: 'BugCheck',
    title: 'System crash (BSOD / bugcheck)',
    detail: 'BugCheck 0x0000007E',
    eventId: 1001,
  },
  {
    id: 'e2',
    deviceId: 'd1',
    occurredAt: '2026-06-07T09:41:02Z',
    capturedAt: '2026-06-08T00:00:00Z',
    category: 'app_crash',
    severity: 'error',
    source: 'Application Error',
    title: 'Application crash',
    detail: null,
    eventId: 1000,
  },
];

describe('CrashEventList', () => {
  it('shows an empty state when there are no events', () => {
    render(<CrashEventList events={[]} />);
    expect(screen.getByText('No crashes detected')).toBeInTheDocument();
  });

  it('renders a card per event', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-event-e1')).toBeInTheDocument();
    expect(screen.getByTestId('crash-event-e2')).toBeInTheDocument();
  });

  it('renders the severity badge label', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-severity-e1')).toHaveTextContent(
      'Critical',
    );
    expect(screen.getByTestId('crash-severity-e2')).toHaveTextContent('Error');
  });

  it('renders the plain-English explanation and category label', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-event-e1')).toHaveTextContent(
      'Windows crashed and restarted',
    );
    expect(screen.getByTestId('crash-event-e1')).toHaveTextContent(
      'Recorded as: System crash (BSOD / bugcheck)',
    );
    expect(screen.getByText('Blue screen (BSOD)')).toBeInTheDocument();
  });

  it('shows the event id when present', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-event-e1')).toHaveTextContent(
      'Event ID 1001',
    );
  });
});
