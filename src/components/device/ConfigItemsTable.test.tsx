import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigItemsTable } from './ConfigItemsTable';
import type { ConfigItem } from '../../types/device.types';

const MOCK_ITEMS: ConfigItem[] = [
  {
    id: 'cfg-001',
    snapshotId: 'snap-001',
    kind: 'startup',
    name: 'OneDrive',
    status: 'enabled',
    path: 'C:\\Users\\user\\AppData\\Local\\Microsoft\\OneDrive\\OneDrive.exe',
    publisher: null,
    source: 'registry',
  },
  {
    id: 'cfg-002',
    snapshotId: 'snap-001',
    kind: 'startup',
    name: 'Steam',
    status: 'enabled',
    path: 'C:\\Program Files (x86)\\Steam\\steam.exe',
    publisher: null,
    source: 'registry',
  },
  {
    id: 'cfg-003',
    snapshotId: 'snap-001',
    kind: 'service',
    name: 'Windows Update',
    status: 'automatic',
    path: null,
    publisher: null,
    source: 'registry',
  },
  {
    id: 'cfg-004',
    snapshotId: 'snap-001',
    kind: 'service',
    name: 'Print Spooler',
    status: 'automatic',
    path: null,
    publisher: null,
    source: 'registry',
  },
  {
    id: 'cfg-005',
    snapshotId: 'snap-001',
    kind: 'scheduled_task',
    name: '\\Microsoft\\Windows\\Defrag\\ScheduledDefrag',
    status: null,
    path: null,
    publisher: null,
    source: 'registry',
  },
];

describe('ConfigItemsTable', () => {
  it('renders all item rows', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.getByText('Steam')).toBeInTheDocument();
    expect(screen.getByText('Windows Update')).toBeInTheDocument();
    expect(screen.getByText('Print Spooler')).toBeInTheDocument();
    expect(
      screen.getByText('\\Microsoft\\Windows\\Defrag\\ScheduledDefrag'),
    ).toBeInTheDocument();
  });

  it('renders kind badges for all item kinds', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    // Kind badges live inside <td> cells; the filter buttons are <button> elements.
    // Query within the table body to count only badge instances.
    const table = screen.getByRole('table');
    const tbody = table.querySelector('tbody');
    expect(tbody).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const rows = Array.from(tbody!.querySelectorAll('tr'));
    const kindCells = rows.map((row) => row.querySelectorAll('td')[0]);
    const startupCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Startup',
    );
    const serviceCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Service',
    );
    const scheduledCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Scheduled task',
    );
    expect(startupCells).toHaveLength(2);
    expect(serviceCells).toHaveLength(2);
    expect(scheduledCells).toHaveLength(1);
  });

  it('shows "No configuration items found" when items array is empty', () => {
    render(<ConfigItemsTable items={[]} />);
    expect(
      screen.getByText('No configuration items found'),
    ).toBeInTheDocument();
  });

  it('displays the total item count', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    expect(screen.getByText('5 items')).toBeInTheDocument();
  });

  it('filters rows based on the search input', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });

    fireEvent.change(input, { target: { value: 'OneDrive' } });

    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.queryByText('Steam')).not.toBeInTheDocument();
    expect(screen.queryByText('Windows Update')).not.toBeInTheDocument();
  });

  it('filters by status via search', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });

    fireEvent.change(input, { target: { value: 'automatic' } });

    expect(screen.getByText('Windows Update')).toBeInTheDocument();
    expect(screen.getByText('Print Spooler')).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
  });

  it('shows "No results" empty state when search matches nothing', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });

    fireEvent.change(input, { target: { value: 'zzz-nonexistent' } });

    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('updates item count when search filters results', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });

    fireEvent.change(input, { target: { value: 'OneDrive' } });

    expect(screen.getByText('1 of 5 items')).toBeInTheDocument();
  });

  it('filters by kind when clicking a kind filter button', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const servicesBtn = screen.getByRole('button', { name: /^Services$/i });
    fireEvent.click(servicesBtn);

    expect(screen.getByText('Windows Update')).toBeInTheDocument();
    expect(screen.getByText('Print Spooler')).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
    expect(screen.queryByText('Steam')).not.toBeInTheDocument();
    expect(
      screen.queryByText('\\Microsoft\\Windows\\Defrag\\ScheduledDefrag'),
    ).not.toBeInTheDocument();
  });

  it('filters by startup kind', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const startupBtn = screen.getByRole('button', { name: /^Startup$/i });
    fireEvent.click(startupBtn);

    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.getByText('Steam')).toBeInTheDocument();
    expect(screen.queryByText('Windows Update')).not.toBeInTheDocument();
  });

  it('filters by scheduled tasks kind', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const tasksBtn = screen.getByRole('button', { name: /^Scheduled tasks$/i });
    fireEvent.click(tasksBtn);

    expect(
      screen.getByText('\\Microsoft\\Windows\\Defrag\\ScheduledDefrag'),
    ).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
    expect(screen.queryByText('Windows Update')).not.toBeInTheDocument();
  });

  it('combining kind filter and search narrows results', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const servicesBtn = screen.getByRole('button', { name: /^Services$/i });
    fireEvent.click(servicesBtn);

    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });
    fireEvent.change(input, { target: { value: 'print' } });

    expect(screen.getByText('Print Spooler')).toBeInTheDocument();
    expect(screen.queryByText('Windows Update')).not.toBeInTheDocument();
  });

  it('returns to All results when clicking All filter', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const servicesBtn = screen.getByRole('button', { name: /^Services$/i });
    fireEvent.click(servicesBtn);
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();

    const allBtn = screen.getByRole('button', { name: /^All$/i });
    fireEvent.click(allBtn);
    expect(screen.getByText('OneDrive')).toBeInTheDocument();
  });
});
