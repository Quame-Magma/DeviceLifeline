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
  setCapturing: (capturing: boolean) => void;
  setError: (error: string | null) => void;
}

export const useDeviceStore = create<DeviceStore>((set) => ({
  snapshots: [],
  selectedSnapshotId: null,
  inventory: [],
  loadingSnapshots: false,
  loadingInventory: false,
  capturing: false,
  error: null,

  setSnapshots: (snapshots) => set({ snapshots }),
  setSelectedSnapshotId: (id) => set({ selectedSnapshotId: id }),
  setInventory: (inventory) => set({ inventory }),
  setLoadingSnapshots: (loading) => set({ loadingSnapshots: loading }),
  setLoadingInventory: (loading) => set({ loadingInventory: loading }),
  setCapturing: (capturing) => set({ capturing }),
  setError: (error) => set({ error }),
}));
