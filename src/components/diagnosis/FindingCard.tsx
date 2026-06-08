import { Card } from '../common/Card';
import type { DiagnosisFinding } from '../../types/device.types';

interface FindingCardProps {
  finding: DiagnosisFinding;
}

/** Bar color by confidence band. */
function confidenceColor(confidence: number): string {
  if (confidence >= 75) {
    return 'bg-status-success';
  }
  if (confidence >= 50) {
    return 'bg-status-warning';
  }
  return 'bg-text-muted';
}

/** A single diagnosis finding: title, confidence, cause, evidence, action. */
export function FindingCard({ finding }: FindingCardProps) {
  const confidence = Math.min(Math.max(Math.round(finding.confidence), 0), 100);

  return (
    <Card padding="md" data-testid={`finding-${finding.id}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-text-primary">
          {finding.title}
        </p>
        <span
          data-testid={`finding-confidence-${finding.id}`}
          className="whitespace-nowrap text-2xs font-medium text-text-secondary"
        >
          {confidence}% confidence
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
        <div
          className={['h-full rounded-full', confidenceColor(confidence)].join(' ')}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-text-secondary">{finding.cause}</p>
      <p className="mt-2 text-2xs text-text-muted">Evidence: {finding.evidence}</p>
      <p className="mt-2 text-xs text-text-primary">
        <span className="font-medium">Suggested action:</span>{' '}
        {finding.suggestedAction}
      </p>
    </Card>
  );
}
