/**
 * Checkpoint type definitions
 *
 * Checkpoints are written to .verified/checkpoints/*.json
 * They embed the log head hash to enable tamper detection between sessions.
 */

/**
 * Checkpoint manifest
 *
 * Written to .verified/checkpoints/checkpoint-<id>.json
 */
export interface CheckpointManifest {
  /** Unique checkpoint identifier (UUID v4) */
  checkpoint_id: string;
  /** ISO 8601 timestamp when checkpoint was created */
  created_at: string;
  /** Hash of the last event in log.jsonl at checkpoint time */
  log_head_hash: string;
  /** List of all tracked files with their metadata */
  files: FileEntry[];
  /** Session ID that created this checkpoint */
  session_id: string;
}

/**
 * File entry in checkpoint manifest
 */
export interface FileEntry {
  /** Path relative to git root */
  path: string;
  /** SHA-256 hash of file contents */
  sha256: string;
  /** File size in bytes */
  size: number;
  /** Unix timestamp of last file modification (seconds since epoch) */
  mtime: number;
  /** Line count (for text files) */
  lineCount: number;
}

/**
 * Checkpoint summary for reports
 */
export interface CheckpointSummary {
  checkpoint_id: string;
  created_at: string;
  file_count: number;
  total_size: number;
}
