/**
 * Typed Tauri IPC wrappers for Universal Search commands.
 *
 * These are the ONLY entry points for Tauri `invoke` calls related to local
 * search. Components and pages MUST NOT call `invoke` directly.
 *
 * Command names are snake_case (Tauri convention).
 */

import { invoke } from '@tauri-apps/api/core';
import type { FileIndexStatus, SearchResult } from '../../types/device.types';

/** Search the local FTS index across findings, software, config, crashes, timeline, files. */
export const searchAll = (query: string): Promise<SearchResult[]> =>
  invoke<SearchResult[]>('search_all', { query });

/** Rebuild the local metadata search index. Returns document count added. */
export const rebuildSearchIndex = (): Promise<number> =>
  invoke<number>('rebuild_search_index');

/** Rebuild the scoped filesystem file index. */
export const rebuildFileIndex = (): Promise<FileIndexStatus> =>
  invoke<FileIndexStatus>('rebuild_file_index');

/** Rebuild metadata index and file index. */
export const rebuildAllSearch = (): Promise<FileIndexStatus> =>
  invoke<FileIndexStatus>('rebuild_all_search');

/** Last file index status (counts, roots, build time). */
export const getFileIndexStatus = (): Promise<FileIndexStatus> =>
  invoke<FileIndexStatus>('get_file_index_status');

/**
 * Rebuild the file index from the NTFS USN journal (or volume walk fallback).
 * Optional `volume` defaults to C: on the backend.
 */
export const rebuildUsnIndex = (
  volume?: string | null,
): Promise<FileIndexStatus> =>
  invoke<FileIndexStatus>('rebuild_usn_index', { volume: volume ?? null });
