import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SoftwareInventoryTable } from './SoftwareInventoryTable';
import type { SoftwareInventoryItem } from '../../types/device.types';

const MOCK_ITEMS: SoftwareInventoryItem[] = [
  {
    id: 'id-001',
    snapshotId: 'snap-001',
    name: 'Google Chrome',
    version: '124.0.6367.208',
    publisher: 'Google LLC',
    installDate: '2026-05-01',
    source: 'registry',
    installLocation: 'C:\\Program Files\\Google\\Chrome',
  },
  {
    id: 'id-002',
    snapshotId: 'snap-001',
    name: 'Visual Studio Code',
    version: '1.89.0',
    publisher: 'Microsoft Corporation',
    installDate: null,
    source: 'registry',
    installLocation: null,
  },
  {
    id: 'id-003',
    snapshotId: 'snap-001',
    name: '7-Zip 23.01 (x64)',
    version: '23.01',
    publisher: 'Igor Pavlov',
    installDate: '2026-03-15',
    source: 'mock',
    installLocation: null,
  },
];

describe('SoftwareInventoryTable', () => {
  it('renders all item rows', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.getByText('Visual Studio Code')).toBeInTheDocument();
    expect(screen.getByText('7-Zip 23.01 (x64)')).toBeInTheDocument();
  });

  it('renders version and publisher columns', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    expect(screen.getByText('124.0.6367.208')).toBeInTheDocument();
    expect(screen.getByText('Google LLC')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Corporation')).toBeInTheDocument();
  });

  it('renders source badges', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    // "registry" appears twice; getAll should find both
    const registryBadges = screen.getAllByText('registry');
    expect(registryBadges).toHaveLength(2);
    expect(screen.getByText('mock')).toBeInTheDocument();
  });

  it('filters rows based on the search input', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', { name: /search software/i });

    fireEvent.change(input, { target: { value: 'chrome' } });

    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.queryByText('Visual Studio Code')).not.toBeInTheDocument();
    expect(screen.queryByText('7-Zip 23.01 (x64)')).not.toBeInTheDocument();
  });

  it('filters by publisher', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', { name: /search software/i });

    fireEvent.change(input, { target: { value: 'microsoft' } });

    expect(screen.getByText('Visual Studio Code')).toBeInTheDocument();
    expect(screen.queryByText('Google Chrome')).not.toBeInTheDocument();
  });

  it('shows "No results" empty state when filter matches nothing', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', { name: /search software/i });

    fireEvent.change(input, { target: { value: 'zzz-nonexistent' } });

    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('shows "No software found" empty state when items array is empty', () => {
    render(<SoftwareInventoryTable items={[]} />);
    expect(screen.getByText('No software found')).toBeInTheDocument();
  });

  it('displays the item count', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('updates the item count when filtering', () => {
    render(<SoftwareInventoryTable items={MOCK_ITEMS} />);
    const input = screen.getByRole('searchbox', { name: /search software/i });

    fireEvent.change(input, { target: { value: 'chrome' } });

    expect(screen.getByText('1 of 3 items')).toBeInTheDocument();
  });
});
