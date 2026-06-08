import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RestoreJobResult } from './RestoreJobResult';
import type { RestoreJob, RestoreStepResult } from '../../types/device.types';

const MOCK_JOB_COMPLETED: RestoreJob = {
  id: 'job-001',
  planId: 'plan-001',
  deviceId: 'dev-001',
  status: 'completed',
  startedAt: '2026-06-08T10:00:00Z',
  finishedAt: '2026-06-08T10:05:00Z',
  totalSteps: 3,
  succeededCount: 3,
  failedCount: 0,
  skippedCount: 0,
};

const MOCK_JOB_WITH_ERRORS: RestoreJob = {
  id: 'job-002',
  planId: 'plan-001',
  deviceId: 'dev-001',
  status: 'completed_with_errors',
  startedAt: '2026-06-08T10:00:00Z',
  finishedAt: '2026-06-08T10:05:00Z',
  totalSteps: 3,
  succeededCount: 2,
  failedCount: 1,
  skippedCount: 0,
};

const MOCK_JOB_FAILED: RestoreJob = {
  id: 'job-003',
  planId: 'plan-001',
  deviceId: 'dev-001',
  status: 'failed',
  startedAt: '2026-06-08T10:00:00Z',
  finishedAt: '2026-06-08T10:01:00Z',
  totalSteps: 2,
  succeededCount: 0,
  failedCount: 0,
  skippedCount: 2,
};

const MOCK_STEP_RESULTS: RestoreStepResult[] = [
  {
    id: 'res-001',
    jobId: 'job-002',
    stepId: 'step-001',
    softwareName: 'Google Chrome',
    status: 'succeeded',
    message: null,
  },
  {
    id: 'res-002',
    jobId: 'job-002',
    stepId: 'step-002',
    softwareName: 'Docker Desktop',
    status: 'failed',
    message: 'winget package not found (simulated)',
  },
  {
    id: 'res-003',
    jobId: 'job-002',
    stepId: 'step-003',
    softwareName: 'Visual Studio Code',
    status: 'skipped',
    message: null,
  },
];

describe('RestoreJobResult', () => {
  it('renders the completed status badge', () => {
    render(<RestoreJobResult job={MOCK_JOB_COMPLETED} stepResults={[]} />);
    expect(screen.getByTestId('job-status-badge')).toHaveTextContent(
      'Completed',
    );
  });

  it('renders the completed_with_errors status badge', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={[]} />,
    );
    expect(screen.getByTestId('job-status-badge')).toHaveTextContent(
      'Completed with errors',
    );
  });

  it('renders the failed status badge', () => {
    render(<RestoreJobResult job={MOCK_JOB_FAILED} stepResults={[]} />);
    expect(screen.getByTestId('job-status-badge')).toHaveTextContent('Failed');
  });

  it('renders succeeded count', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={[]} />,
    );
    expect(screen.getByTestId('succeeded-count')).toHaveTextContent(
      '2 succeeded',
    );
  });

  it('renders failed count', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={[]} />,
    );
    expect(screen.getByTestId('failed-count')).toHaveTextContent('1 failed');
  });

  it('renders skipped count', () => {
    render(<RestoreJobResult job={MOCK_JOB_FAILED} stepResults={[]} />);
    expect(screen.getByTestId('skipped-count')).toHaveTextContent('2 skipped');
  });

  it('renders per-step result rows with software names', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={MOCK_STEP_RESULTS} />,
    );
    expect(screen.getByText('Google Chrome')).toBeInTheDocument();
    expect(screen.getByText('Docker Desktop')).toBeInTheDocument();
    expect(screen.getByText('Visual Studio Code')).toBeInTheDocument();
  });

  it('renders succeeded badge for a succeeded step', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={MOCK_STEP_RESULTS} />,
    );
    expect(screen.getByTestId('step-status-badge-res-001')).toHaveTextContent(
      'Succeeded',
    );
  });

  it('renders failed badge for a failed step', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={MOCK_STEP_RESULTS} />,
    );
    expect(screen.getByTestId('step-status-badge-res-002')).toHaveTextContent(
      'Failed',
    );
  });

  it('renders skipped badge for a skipped step', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={MOCK_STEP_RESULTS} />,
    );
    expect(screen.getByTestId('step-status-badge-res-003')).toHaveTextContent(
      'Skipped',
    );
  });

  it('renders the failure message for a failed step', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={MOCK_STEP_RESULTS} />,
    );
    expect(
      screen.getByText('winget package not found (simulated)'),
    ).toBeInTheDocument();
  });

  it('renders no step table when stepResults is empty', () => {
    render(<RestoreJobResult job={MOCK_JOB_COMPLETED} stepResults={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders total steps count', () => {
    render(
      <RestoreJobResult job={MOCK_JOB_WITH_ERRORS} stepResults={[]} />,
    );
    expect(screen.getByText('3 total')).toBeInTheDocument();
  });
});
