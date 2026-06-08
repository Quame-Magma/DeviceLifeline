import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosisHistory } from './DiagnosisHistory';
import type { DiagnosisSession } from '../../types/device.types';

const session = (id: string, query: string): DiagnosisSession => ({
  id,
  deviceId: 'd1',
  query,
  createdAt: '2026-06-08T10:00:00Z',
  summary: 's',
  context: {
    healthScore: null,
    cpuUsage: null,
    memoryPct: null,
    diskPct: null,
    activeAlertKinds: [],
    recentCrashCategories: [],
    recentChangeTitles: [],
    softwareCount: 0,
  },
  findingCount: 2,
});

describe('DiagnosisHistory', () => {
  it('shows an empty message when there are no sessions', () => {
    render(
      <DiagnosisHistory sessions={[]} selectedId={null} onSelect={() => {}} />,
    );
    expect(screen.getByText('No past questions yet.')).toBeInTheDocument();
  });

  it('renders a row per session with the query text', () => {
    render(
      <DiagnosisHistory
        sessions={[session('s1', 'why slow?'), session('s2', 'why crash?')]}
        selectedId={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('why slow?')).toBeInTheDocument();
    expect(screen.getByText('why crash?')).toBeInTheDocument();
  });

  it('fires onSelect with the session when clicked', () => {
    const onSelect = vi.fn();
    const s1 = session('s1', 'why slow?');
    render(
      <DiagnosisHistory sessions={[s1]} selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.click(screen.getByTestId('history-s1'));
    expect(onSelect).toHaveBeenCalledWith(s1);
  });
});
