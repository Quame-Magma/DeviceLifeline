/**
 * Domain type definitions for the Device DNA feature.
 * These interfaces MUST match the Rust serde structs exactly (camelCase via
 * `#[serde(rename_all = "camelCase")]`).
 */

/** A physical or virtual device registered in the system. */
export interface Device {
  id: string;
  hostname: string;
  osName: string;
  osVersion: string;
  createdAt: string;
}

/**
 * A point-in-time snapshot of a device's installed software inventory.
 * `softwareCount` is the number of items captured in this snapshot.
 */
export interface DeviceDnaSnapshot {
  id: string;
  deviceId: string;
  capturedAt: string;
  schemaVersion: number;
  source: string;
  softwareCount: number;
}

/**
 * A single software item captured in a `DeviceDnaSnapshot`.
 * Optional fields are null when unavailable from the OS source.
 */
export interface SoftwareInventoryItem {
  id: string;
  snapshotId: string;
  name: string;
  version: string | null;
  publisher: string | null;
  installDate: string | null;
  source: string;
  installLocation: string | null;
}
