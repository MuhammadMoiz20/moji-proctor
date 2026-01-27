/**
 * Online Signals Types
 *
 * Schema for signals uploaded to the server.
 * Only metadata is transmitted - NO source code or file contents.
 */

import { EventType } from './events';

/**
 * Signal types that are uploaded to server
 * Subset of EventType - excludes TIME_TICK (too frequent)
 * Plus STATUS_UPDATE which is synthesized, not from events
 */
export type SignalType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'BURST_FLAG'
  | 'CHECKPOINT_CREATED'
  | 'UNVERIFIED_CHANGES'
  | 'INTEGRITY_COMPROMISED'
  | 'STATUS_UPDATE';

/**
 * Base signal envelope uploaded to server
 */
export interface SignalEnvelope {
  /** Unique identifier for this signal (UUID v4) */
  event_id: string;
  /** ISO 8601 timestamp */
  ts: string;
  /** Session identifier (UUID v4) */
  session_id: string;
  /** Signal type */
  type: SignalType;
  /** Signal-specific payload (metadata only, no code) */
  payload: SignalPayload;
  /** Assignment identifier */
  assignment_id: string;
  /** Optional course identifier */
  course_id?: string;
  /** Git commit SHA if available */
  commit_sha?: string;
  /** Repository identifier (for disambiguation) */
  repo_identifier?: string;
}

/**
 * Union of all signal payloads
 */
export type SignalPayload =
  | SessionStartSignalPayload
  | SessionEndSignalPayload
  | BurstFlagSignalPayload
  | CheckpointCreatedSignalPayload
  | UnverifiedChangesSignalPayload
  | IntegrityCompromisedSignalPayload
  | StatusUpdateSignalPayload;

/**
 * SESSION_START signal payload
 */
export interface SessionStartSignalPayload {
  /** VS Code workspace name/identifier */
  workspace_name: string;
}

/**
 * SESSION_END signal payload with aggregated time
 */
export interface SessionEndSignalPayload {
  /** Total focused time in seconds */
  focused_seconds: number;
  /** Total active time in seconds */
  active_seconds: number;
  /** Reason for session end */
  reason: 'close' | 'idle_timeout' | 'manual';
}

/**
 * BURST_FLAG signal payload
 */
export interface BurstFlagSignalPayload {
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
  /** Number of edits in the detection window */
  edit_count: number;
  /** Total characters changed in the window */
  char_count: number;
  /** Window duration in milliseconds */
  window_ms: number;
  /** File name only (no full path for privacy) */
  file_name: string;
  /** File extension for categorization */
  file_extension: string;
}

/**
 * CHECKPOINT_CREATED signal payload
 */
export interface CheckpointCreatedSignalPayload {
  /** Checkpoint ID */
  checkpoint_id: string;
  /** Number of files in manifest */
  file_count: number;
  /** Log head hash at checkpoint time */
  log_head_hash: string;
}

/**
 * UNVERIFIED_CHANGES signal payload
 * Contains ONLY counts and limited file info - no diffs or content
 */
export interface UnverifiedChangesSignalPayload {
  /** Number of files added */
  files_added: number;
  /** Number of files modified */
  files_modified: number;
  /** Number of files deleted */
  files_deleted: number;
  /** Git diff stats - lines added (no patch content) */
  lines_added: number;
  /** Git diff stats - lines removed (no patch content) */
  lines_removed: number;
  /** Last checkpoint ID we're comparing against */
  last_checkpoint_id: string | null;
  /** Optional: top N changed file paths (limit configurable, default 10) */
  top_paths?: Array<{
    /** Relative file path */
    path: string;
    /** Brief description of change */
    change_type: 'added' | 'modified' | 'deleted';
  }>;
}

/**
 * INTEGRITY_COMPROMISED signal payload
 */
export interface IntegrityCompromisedSignalPayload {
  /** Reason code for integrity failure */
  reason: 'missing_log' | 'broken_hash_chain' | 'missing_checkpoint' | 'missing_assignment';
  /** Human-readable description */
  description: string;
}

/**
 * STATUS_UPDATE signal payload
 * Periodic summary of current session state
 */
export interface StatusUpdateSignalPayload {
  /** Total focused time in seconds (cumulative for assignment) */
  total_focused_seconds: number;
  /** Total active time in seconds (cumulative for assignment) */
  total_active_seconds: number;
  /** Total number of sessions */
  session_count: number;
  /** Total burst events detected */
  burst_count: number;
  /** Burst counts by severity */
  burst_by_severity: {
    low: number;
    medium: number;
    high: number;
  };
  /** Total checkpoints created */
  checkpoint_count: number;
  /** Number of unverified changes detected */
  unverified_change_count: number;
  /** Whether integrity check passed */
  integrity_passed: boolean;
  /** Current session active status */
  session_active: boolean;
}

/**
 * Device signature for anti-spoofing
 */
export interface DeviceSignature {
  /** Device public key (hex encoded Ed25519) */
  device_pubkey: string;
  /** Monotonic sequence number per device+assignment */
  seq: number;
  /** Signature of the payload (hex encoded Ed25519) */
  sig: string;
}

/**
 * Batch upload request
 */
export interface BatchUploadRequest {
  /** Array of signals to upload */
  signals: Array<SignalEnvelope & DeviceSignature>;
}

/**
 * Batch upload response
 */
export interface BatchUploadResponse {
  /** Number of signals accepted */
  accepted: number;
  /** Number of signals rejected (duplicates, invalid) */
  rejected: number;
  /** Array of rejected event IDs */
  rejected_ids?: string[];
}
