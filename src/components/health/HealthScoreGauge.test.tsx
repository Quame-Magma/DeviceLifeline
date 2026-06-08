import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthScoreGauge } from './HealthScoreGauge';

describe('HealthScoreGauge', () => {
  it('renders the score value', () => {
    render(<HealthScoreGauge score={88} />);
    expect(screen.getByTestId('health-score-value')).toHaveTextContent('88');
  });

  it('rounds and clamps an out-of-range score', () => {
    render(<HealthScoreGauge score={142} />);
    expect(screen.getByTestId('health-score-value')).toHaveTextContent('100');
  });

  it('labels a high score as Healthy', () => {
    render(<HealthScoreGauge score={90} />);
    expect(screen.getByTestId('health-score-band')).toHaveTextContent(
      'Healthy',
    );
  });

  it('labels a mid score as Fair', () => {
    render(<HealthScoreGauge score={60} />);
    expect(screen.getByTestId('health-score-band')).toHaveTextContent('Fair');
  });

  it('labels a low score as At risk', () => {
    render(<HealthScoreGauge score={30} />);
    expect(screen.getByTestId('health-score-band')).toHaveTextContent(
      'At risk',
    );
  });
});
