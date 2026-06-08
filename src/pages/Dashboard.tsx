import { APP_NAME, APP_TAGLINE } from '../lib/constants';
import { Card } from '../components/common/Card';

/**
 * Dashboard page — minimal placeholder for Increment 1.
 * Full implementation is out of scope for this slice.
 */
export function Dashboard() {
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-text-primary">{APP_NAME}</h1>
        <p className="text-sm text-text-secondary mt-1">{APP_TAGLINE}</p>
      </div>

      {/* Placeholder card */}
      <Card className="max-w-md">
        <h2 className="text-base font-semibold text-text-primary mb-2">
          Welcome to DeviceLifeline
        </h2>
        <p className="text-sm text-text-secondary">
          Navigate to{' '}
          <span className="font-medium text-accent">Device DNA</span> in the
          sidebar to capture your first software snapshot.
        </p>
      </Card>

      {/* Feature placeholder grid */}
      <div className="grid grid-cols-3 gap-4 max-w-2xl">
        {[
          { label: 'Device DNA', desc: 'Active', status: 'active' },
          { label: 'Performance Timeline', desc: 'Coming soon', status: 'soon' },
          { label: 'AI Detective', desc: 'Coming soon', status: 'soon' },
        ].map(({ label, desc, status }) => (
          <Card key={label} padding="md">
            <p className="text-sm font-medium text-text-primary">{label}</p>
            <p
              className={
                status === 'active'
                  ? 'text-xs text-status-success mt-1'
                  : 'text-xs text-text-muted mt-1'
              }
            >
              {desc}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
