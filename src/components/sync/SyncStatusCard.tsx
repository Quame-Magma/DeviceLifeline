import { useEffect } from 'react';
import { useSync } from '../../hooks/use-sync';
import { syncStatusLabel } from '../../lib/sync';
import { Button } from '../common/Button';
import { Card } from '../common/Card';

/**
 * Cloud-sync status tile. Shows the local queue state and a "Sync now" action.
 * Until a Supabase backend is configured, items stay queued locally.
 */
export function SyncStatusCard() {
  const { status, syncing, error, loadStatus, sync } = useSync();

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Cloud sync
          </p>
          <p
            data-testid="sync-status-label"
            className="mt-1 text-sm text-text-primary"
          >
            {error ?? (status ? syncStatusLabel(status) : 'Checking…')}
          </p>
          {status && !status.configured && (
            <p className="mt-0.5 text-2xs text-text-muted">
              Snapshots and samples are queued locally; connect a Supabase
              project to sync them.
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={syncing}
          onClick={() => void sync()}
          disabled={syncing}
        >
          Sync now
        </Button>
      </div>
    </Card>
  );
}
