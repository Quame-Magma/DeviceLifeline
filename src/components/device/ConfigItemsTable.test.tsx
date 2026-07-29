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
  {
    id: 'cfg-006',
    snapshotId: 'snap-001',
    kind: 'browser_extension',
    name: 'Chrome: React Developer Tools',
    status: 'Default',
    path: 'fmkadmapgofadopljbjfkapdkoienihi @ 5.0.0',
    publisher: null,
    source: 'browser',
  },
  {
    id: 'cfg-007',
    snapshotId: 'snap-001',
    kind: 'dev_tool',
    name: 'Git',
    status: 'detected',
    path: 'C:\\Program Files\\Git\\cmd\\git.exe',
    publisher: null,
    source: 'path',
  },
  {
    id: 'cfg-008',
    snapshotId: 'snap-001',
    kind: 'hardware',
    name: 'CPU',
    status: '16 logical cores',
    path: 'Mock CPU',
    publisher: null,
    source: 'sysinfo',
  },
  {
    id: 'cfg-009',
    snapshotId: 'snap-001',
    kind: 'power',
    name: 'Active power plan',
    status: 'Balanced',
    path: '381b4222-f694-41f0-9685-ff5bb260df2e',
    publisher: null,
    source: 'powercfg',
  },
  {
    id: 'cfg-010',
    snapshotId: 'snap-001',
    kind: 'network',
    name: 'Wi-Fi',
    status: 'Up · 866 Mbps',
    path: 'Mock Wireless Adapter',
    publisher: null,
    source: 'powershell',
  },
];

describe('ConfigItemsTable', () => {
  it('renders the first page of item rows and paginates', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    // Default page size is 5 of 10 mock items.
    expect(screen.getByText('OneDrive')).toBeInTheDocument();
    expect(screen.getByText('Steam')).toBeInTheDocument();
    expect(screen.getByText('Windows Update')).toBeInTheDocument();
    expect(screen.getByText('Print Spooler')).toBeInTheDocument();
    expect(
      screen.getByText('\\Microsoft\\Windows\\Defrag\\ScheduledDefrag'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Chrome: React Developer Tools')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Chrome: React Developer Tools')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('Active power plan')).toBeInTheDocument();
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument();
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
    const browserCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Browser extension',
    );
    const devToolCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Dev tool',
    );
    const hardwareCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Hardware',
    );
    const powerCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Power',
    );
    const networkCells = kindCells.filter((td) =>
      td?.textContent?.trim() === 'Network',
    );
    // Default page size is 5 — only the first page of "All" is rendered.
    // Kind filter buttons still expose every kind; row counts reflect the page.
    expect(startupCells.length + serviceCells.length).toBeGreaterThan(0);
    expect(
      startupCells.length +
        serviceCells.length +
        scheduledCells.length +
        browserCells.length +
        devToolCells.length +
        hardwareCells.length +
        powerCells.length +
        networkCells.length,
    ).toBe(5);

    // Filtering by kind shows the full set for that kind (within page size).
    fireEvent.click(screen.getByRole('button', { name: 'Startup' }));
    expect(
      screen.getAllByRole('cell').filter((td) => td.textContent?.trim() === 'Startup'),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Hardware' }));
    expect(
      screen.getAllByRole('cell').filter((td) => td.textContent?.trim() === 'Hardware'),
    ).toHaveLength(1);
  });

  it('shows "No configuration items found" when items array is empty', () => {
    render(<ConfigItemsTable items={[]} />);
    expect(
      screen.getByText('No configuration items found'),
    ).toBeInTheDocument();
  });

  it('displays the total item count', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          (el.textContent ?? '').includes('of 10 items'),
      ),
    ).toBeInTheDocument();
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

    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          (el.textContent ?? '').includes('of 1 items'),
      ),
    ).toBeInTheDocument();
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

    const tasksBtn = screen.getByRole('button', { name: /^Tasks$/i });
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

  it('filters by dev tool kind', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);

    const devToolsBtn = screen.getByRole('button', { name: /^Dev tools$/i });
    fireEvent.click(devToolsBtn);

    expect(screen.getByText('Git')).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
    expect(screen.queryByText('CPU')).not.toBeInTheDocument();
  });

  it('searches by source', () => {
    render(<ConfigItemsTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', {
      name: /search configuration items/i,
    });

    fireEvent.change(input, { target: { value: 'sysinfo' } });

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.queryByText('OneDrive')).not.toBeInTheDocument();
  });
});
