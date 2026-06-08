/**
 * `useDeviceDna` — custom hook that encapsulates all Device DNA API calls.
 *
 * Components and pages MUST use this hook to interact with device data.
 * They must NOT import from `src/api/tauri/device.ts` directly (doc 48 AC-FS-04).
 */

import { useCallback } from 'react';
import {
  collectDnaSnapshot,
  getSnapshots,
  getSoftwareInventory,
  getConfigItems,
  getTimelineEvents,
} from '../api/tauri/device';
import { useDeviceStore, type DeviceStore } from '../store/device.store';

export interface UseDeviceDnaReturn {
  snapshots: DeviceStore['snapshots'];
  selectedSnapshotId: DeviceStore['selectedSnapshotId'];
  inventory: DeviceStore['inventory'];
  loadingSnapshots: DeviceStore['loadingSnapshots'];
  loadingInventory: DeviceStore['loadingInventory'];
  configItems: DeviceStore['configItems'];
  loadingConfig: DeviceStore['loadingConfig'];
  timelineEvents: DeviceStore['timelineEvents'];
  loadingTimeline: DeviceStore['loadingTimeline'];
  capturing: DeviceStore['capturing'];
  error: DeviceStore['error'];
  /** Load (or reload) the list of snapshots. Auto-selects the first if none selected. */
  loadSnapshots: () => Promise<void>;
  /** Trigger a new snapshot capture, reload the list, and auto-select the newest. */
  capture: () => Promise<void>;
  /** Select a snapshot by ID and load its software inventory and config items. */
  selectSnapshot: (id: string) => Promise<void>;
  /** Load (or reload) all timeline events. */
  loadTimeline: () => Promise<void>;
}

export function useDeviceDna(): UseDeviceDnaReturn {
  const {
    snapshots,
    selectedSnapshotId,
    inventory,
    loadingSnapshots,
    loadingInventory,
    configItems,
    loadingConfig,
    timelineEvents,
    loadingTimeline,
    capturing,
    error,
    setSnapshots,
    setSelectedSnapshotId,
    setInventory,
    setLoadingSnapshots,
    setLoadingInventory,
    setConfigItems,
    setLoadingConfig,
    setTimelineEvents,
    setLoadingTimeline,
    setCapturing,
    setError,
  } = useDeviceStore();

  const loadInventoryForId = useCallback(
    async (snapshotId: string) => {
      setLoadingInventory(true);
      setError(null);
      try {
        const items = await getSoftwareInventory(snapshotId);
        setInventory(items);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Failed to load software inventory.',
        );
        setInventory([]);
      } finally {
        setLoadingInventory(false);
      }
    },
    [setError, setInventory, setLoadingInventory],
  );

  const loadTimeline = useCallback(async () => {
    setLoadingTimeline(true);
    try {
      const events = await getTimelineEvents();
      setTimelineEvents(events);
    } catch {
      setTimelineEvents([]);
    } finally {
      setLoadingTimeline(false);
    }
  }, [setTimelineEvents, setLoadingTimeline]);

  const loadConfigForId = useCallback(
    async (snapshotId: string) => {
      setLoadingConfig(true);
      try {
        const items = await getConfigItems(snapshotId);
        setConfigItems(items);
      } catch {
        setConfigItems([]);
      } finally {
        setLoadingConfig(false);
      }
    },
    [setConfigItems, setLoadingConfig],
  );

  const loadSnapshots = useCallback(async () => {
    setLoadingSnapshots(true);
    setError(null);
    try {
      const fetched = await getSnapshots();
      setSnapshots(fetched);
      // Auto-select first snapshot (newest) if nothing is currently selected
      // and snapshots are available.
      const currentId = useDeviceStore.getState().selectedSnapshotId;
      if (fetched.length > 0 && currentId === null) {
        const newestId = fetched[0].id;
        setSelectedSnapshotId(newestId);
        await Promise.all([
          loadInventoryForId(newestId),
          loadConfigForId(newestId),
        ]);
      } else if (fetched.length === 0) {
        setSelectedSnapshotId(null);
        setInventory([]);
        setConfigItems([]);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Failed to load snapshots.',
      );
      setSnapshots([]);
    } finally {
      setLoadingSnapshots(false);
    }
    await loadTimeline();
  }, [
    loadInventoryForId,
    loadConfigForId,
    loadTimeline,
    setError,
    setInventory,
    setConfigItems,
    setLoadingSnapshots,
    setSelectedSnapshotId,
    setSnapshots,
  ]);

  const capture = useCallback(async () => {
    setCapturing(true);
    setError(null);
    try {
      await collectDnaSnapshot();
      // Reload snapshots and auto-select the newest one.
      const fetched = await getSnapshots();
      setSnapshots(fetched);
      if (fetched.length > 0) {
        const newestId = fetched[0].id;
        setSelectedSnapshotId(newestId);
        await Promise.all([
          loadInventoryForId(newestId),
          loadConfigForId(newestId),
        ]);
      }
      await loadTimeline();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Snapshot capture failed.',
      );
    } finally {
      setCapturing(false);
    }
  }, [
    loadInventoryForId,
    loadConfigForId,
    loadTimeline,
    setCapturing,
    setError,
    setSelectedSnapshotId,
    setSnapshots,
  ]);

  const selectSnapshot = useCallback(
    async (id: string) => {
      setSelectedSnapshotId(id);
      await Promise.all([loadInventoryForId(id), loadConfigForId(id)]);
    },
    [loadInventoryForId, loadConfigForId, setSelectedSnapshotId],
  );

  return {
    snapshots,
    selectedSnapshotId,
    inventory,
    loadingSnapshots,
    loadingInventory,
    configItems,
    loadingConfig,
    timelineEvents,
    loadingTimeline,
    capturing,
    error,
    loadSnapshots,
    capture,
    selectSnapshot,
    loadTimeline,
  };
}
