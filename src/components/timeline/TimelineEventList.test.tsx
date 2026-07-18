import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimelineEventList } from './TimelineEventList';
import type { TimelineEvent } from '../../types/device.types';

const MOCK_EVENTS: TimelineEvent[] = [
  {
    id: 'evt-001',
    deviceId: 'dev-001',
    snapshotId: 'snap-002',
    previousSnapshotId: 'snap-001',
    eventType: 'software_install',
    category: 'software',
    title: 'Installed Node.js',
    detail: '20.11.0',
    occurredAt: '2026-06-07T10:00:00Z',
  },
  {
    id: 'evt-002',
    deviceId: 'dev-001',
    snapshotId: 'snap-002',
    previousSnapshotId: 'snap-001',
    eventType: 'software_removal',
    category: 'software',
    title: 'Removed Python 2.7',
    detail: '2.7.18',
    occurredAt: '2026-06-07T10:00:00Z',
  },
  {
    id: 'evt-003',
    deviceId: 'dev-001',
    snapshotId: 'snap-002',
    previousSnapshotId: 'snap-001',
    eventType: 'config_added',
    category: 'config',
    title: 'Added service: sshd',
    detail: 'running',
    occurredAt: '2026-06-07T10:00:00Z',
  },
  {
    id: 'evt-004',
    deviceId: 'dev-001',
    snapshotId: 'snap-002',
    previousSnapshotId: 'snap-001',
    eventType: 'software_update',
    category: 'software',
    title: 'Updated Visual Studio Code',
    detail: '1.88.0 → 1.89.0',
    occurredAt: '2026-06-07T10:00:00Z',
  },
];

describe('TimelineEventList', () => {
  it('renders all events from props', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    expect(screen.getByText('Installed Node.js')).toBeInTheDocument();
    expect(screen.getByText('Removed Python 2.7')).toBeInTheDocument();
    expect(screen.getByText('Added service: sshd')).toBeInTheDocument();
    expect(screen.getByText('Updated Visual Studio Code')).toBeInTheDocument();
  });

  it('renders event type badges', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    expect(screen.getByText('Install')).toBeInTheDocument();
    expect(screen.getByText('Removal')).toBeInTheDocument();
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Update')).toBeInTheDocument();
  });

  it('renders event detail text', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    expect(screen.getByText('20.11.0')).toBeInTheDocument();
    expect(screen.getByText('2.7.18')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('1.88.0 → 1.89.0')).toBeInTheDocument();
  });

  it('shows empty state when no events are provided', () => {
    render(<TimelineEventList events={[]} />);
    expect(
      screen.getByText(
        'No changes recorded yet — capture a snapshot after making changes.',
      ),
    ).toBeInTheDocument();
  });

  it('shows all events count', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          (el.textContent ?? '').includes('of 4 events'),
      ),
    ).toBeInTheDocument();
  });

  it('filters to software category', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    const softwareBtn = screen.getByRole('button', { name: /software/i });
    fireEvent.click(softwareBtn);

    expect(screen.getByText('Installed Node.js')).toBeInTheDocument();
    expect(screen.getByText('Removed Python 2.7')).toBeInTheDocument();
    expect(screen.getByText('Updated Visual Studio Code')).toBeInTheDocument();
    expect(screen.queryByText('Added service: sshd')).not.toBeInTheDocument();
  });

  it('filters to config category', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    const configBtn = screen.getByRole('button', { name: /^config$/i });
    fireEvent.click(configBtn);

    expect(screen.getByText('Added service: sshd')).toBeInTheDocument();
    expect(screen.queryByText('Installed Node.js')).not.toBeInTheDocument();
    expect(screen.queryByText('Removed Python 2.7')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Updated Visual Studio Code'),
    ).not.toBeInTheDocument();
  });

  it('shows filtered count when a category is selected', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    const configBtn = screen.getByRole('button', { name: /^config$/i });
    fireEvent.click(configBtn);

    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          (el.textContent ?? '').includes('of 1 events'),
      ),
    ).toBeInTheDocument();
  });

  it('shows no category events message when filter has no matches', () => {
    const softwareOnlyEvents = MOCK_EVENTS.filter(
      (e) => e.category === 'software',
    );
    render(<TimelineEventList events={softwareOnlyEvents} />);
    const configBtn = screen.getByRole('button', { name: /^config$/i });
    fireEvent.click(configBtn);

    expect(
      screen.getByText('No events in this category.'),
    ).toBeInTheDocument();
  });

  it('returns to all events when All filter is clicked', () => {
    render(<TimelineEventList events={MOCK_EVENTS} />);
    const softwareBtn = screen.getByRole('button', { name: /software/i });
    fireEvent.click(softwareBtn);

    const allBtn = screen.getByRole('button', { name: /^all$/i });
    fireEvent.click(allBtn);

    expect(screen.getByText('Installed Node.js')).toBeInTheDocument();
    expect(screen.getByText('Added service: sshd')).toBeInTheDocument();
  });

  it('renders event with null detail without crashing', () => {
    const eventsWithNullDetail: TimelineEvent[] = [
      {
        id: 'evt-005',
        deviceId: 'dev-001',
        snapshotId: 'snap-002',
        previousSnapshotId: 'snap-001',
        eventType: 'config_removed',
        category: 'config',
        title: 'Removed service: telnet',
        detail: null,
        occurredAt: '2026-06-07T10:00:00Z',
      },
    ];
    render(<TimelineEventList events={eventsWithNullDetail} />);
    expect(screen.getByText('Removed service: telnet')).toBeInTheDocument();
  });
});
