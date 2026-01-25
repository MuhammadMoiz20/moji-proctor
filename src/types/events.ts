/**
 * Shared event type definitions
 *
 * Contract freeze: Do not modify event envelope structure without coordination.
 * See .verified-dev/CONTRACTS.md for canonical JSON and hash rules.
 */

/**
 * Event envelope written to .verified/log.jsonl
 *
 * Hash rule: hash = sha256(canonicalJson({event_id, ts, session_id, type, payload, prev_hash}))
 */
export interface EventEnvelope {
  /** Unique identifier for this event (UUID v4) */
  event_id: string;
  /** ISO 8601 timestamp */
  ts: string;
  /** Session identifier (UUID v4) - shared across events in a single editing session */
  session_id: string;
  /** Event type discriminator */
  type: EventType;
  /** Event-specific data */
  payload: unknown;
  /** Hash of previous event in chain, or null for first event */
  prev_hash: string | null;
  /** SHA-256 hash of this event (excluding this field) */
  hash: string;
}

/**
 * Known event types
 *
 * Add new types only with coordination across all agents.
 */
export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'TIME_TICK'
  | 'BURST_FLAG'
  | 'CHECKPOINT_CREATED'
  | 'UNVERIFIED_CHANGES'
  | 'INTEGRITY_COMPROMISED';

/**
 * SESSION_START payload
 */
export interface SessionStartPayload {
  /** VS Code workspace name/identifier */
  workspace_name: string;
  /** Git root path (relative to workspace) */
  git_root: string;
}

/**
 * SESSION_END payload
 */
export interface SessionEndPayload {
  /** Total focused time in seconds */
  focused_seconds: number;
  /** Total active time in seconds */
  active_seconds: number;
  /** Reason for session end (close, idle timeout, manual) */
  reason: 'close' | 'idle_timeout' | 'manual';
}

/**
 * TIME_TICK payload
 */
export interface TimeTickPayload {
  /** Accumulated focused time in seconds since last tick */
  focused_delta_seconds: number;
  /** Accumulated active time in seconds since last tick */
  active_delta_seconds: number;
}

/**
 * BURST_FLAG payload
 */
export interface BurstFlagPayload {
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
  /** Number of edits in the detection window */
  edit_count: number;
  /** Total characters changed in the window */
  char_count: number;
  /** Window duration in milliseconds */
  window_ms: number;
  /** File path where burst was detected */
  file_path: string;
}

/**
 * CHECKPOINT_CREATED payload
 */
export interface CheckpointCreatedPayload {
  /** Checkpoint ID */
  checkpoint_id: string;
  /** Number of files in manifest */
  file_count: number;
  /** Log head hash at checkpoint time */
  log_head_hash: string;
}

/**
 * UNVERIFIED_CHANGES payload
 */
export interface UnverifiedChangesPayload {
  /** List of files that changed between sessions without telemetry */
  changes: Array<{
    path: string;
    /** Brief description of change (added, modified, deleted) */
    change_type: 'added' | 'modified' | 'deleted';
  }>;
  /** Last checkpoint ID we're comparing against */
  last_checkpoint_id: string | null;
}

/**
 * INTEGRITY_COMPROMISED payload
 */
export interface IntegrityCompromisedPayload {
  /** Reason code for integrity failure */
  reason: 'missing_log' | 'broken_hash_chain' | 'missing_checkpoint' | 'missing_assignment';
  /** Human-readable description */
  description: string;
  /** Event ID where issue was detected (if applicable) */
  event_id: string | null;
}
