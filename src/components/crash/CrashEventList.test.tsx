import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders a row per event', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-event-e1')).toBeInTheDocument();
    expect(screen.getByTestId('crash-event-e2')).toBeInTheDocument();
  });

  it('shows severity and title when collapsed', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(screen.getByTestId('crash-severity-e1')).toHaveTextContent(
      'Critical',
    );
    expect(screen.getByTestId('crash-severity-e2')).toHaveTextContent('Error');
    expect(screen.getByTestId('crash-event-e1')).toHaveTextContent(
      'Windows crashed and restarted',
    );
    expect(screen.getByTestId('crash-event-e1')).toHaveTextContent(
      'Blue screen (BSOD)',
    );
  });

  it('hides details until expanded', () => {
    render(<CrashEventList events={EVENTS} />);
    expect(
      screen.queryByText('Recorded as: System crash (BSOD / bugcheck)'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Event ID 1001')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Windows crashed/i }));

    expect(
      screen.getByText('Recorded as: System crash (BSOD / bugcheck)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Event ID 1001')).toBeInTheDocument();
    expect(screen.getByText('BugCheck 0x0000007E')).toBeInTheDocument();
  });

  it('collapses details when clicked again', () => {
    render(<CrashEventList events={EVENTS} />);
    const header = screen.getByRole('button', { name: /Windows crashed/i });
    fireEvent.click(header);
    expect(screen.getByText('Event ID 1001')).toBeInTheDocument();
    fireEvent.click(header);
    expect(screen.queryByText('Event ID 1001')).not.toBeInTheDocument();
  });
});
