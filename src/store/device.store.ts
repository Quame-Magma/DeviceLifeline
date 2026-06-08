/**
 * Zustand store for Device DNA state.
 *
 * This store holds all shared state for snapshots and software inventory.
 * It must NOT contain API calls — those live in `hooks/use-device-dna.ts`.
 */

import { create } from 'zustand';
import type {
  DeviceDnaSnapshot,
  SoftwareInventoryItem,
  ConfigItem,
} from '../types/device.types';

export interface DeviceStore {
  /** All available snapshots, newest first. */
  snapshots: DeviceDnaSnapshot[];
  /** The ID of the currently selected snapshot, or null if none. */
  selectedSnapshotId: string | null;
  /** Software inventory for the selected snapshot. */
  inventory: SoftwareInventoryItem[];
  /** True while fetching the snapshot list. */
  loadingSnapshots: boolean;
  /** True while fetching the software inventory. */
  loadingInventory: boolean;
  /** System-configuration items for the selected snapshot. */
  configItems: ConfigItem[];
  /** True while fetching the system-configuration items. */
  loadingConfig: boolean;
  /** True while a capture operation is in progress. */
  capturing: boolean;
  /** Error message from the most recent failed operation, or null. */
  error: string | null;

  // Actions
  setSnapshots: (snapshots: DeviceDnaSnapshot[]) => void;
  setSelectedSnapshotId: (id: string | null) => void;
  setInventory: (inventory: SoftwareInventoryItem[]) => void;
  setLoadingSnapshots: (loading: boolean) => void;
  setLoadingInventory: (loading: boolean) => void;
  setConfigItems: (configItems: ConfigItem[]) => void;
  setLoadingConfig: (loading: boolean) => void;
  setCapturing: (capturing: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  snapshots: [],
  selectedSnapshotId: null,
  inventory: [],
  loadingSnapshots: false,
  loadingInventory: false,
  configItems: [],
  loadingConfig: false,
  capturing: false,
  error: null,

  setSnapshots: (snapshots) => set({ snapshots }),
  setSelectedSnapshotId: (id) => set({ selectedSnapshotId: id }),
  setInventory: (inventory) => set({ inventory }),
  setLoadingSnapshots: (loading) => set({ loadingSnapshots: loading }),
  setLoadingInventory: (loading) => set({ loadingInventory: loading }),
  setConfigItems: (configItems) => set({ configItems }),
  setLoadingConfig: (loading) => set({ loadingConfig: loading }),
  setCapturing: (capturing) => set({ capturing }),
  setError: (error) => set({ error }),
}));
