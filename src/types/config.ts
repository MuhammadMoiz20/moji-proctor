/**
 * Moji Proctor Configuration Types
 *
 * Schema for moji-proctor.config.json - optional config file in repo root.
 * If missing, extension defaults to local-only mode.
 */

/**
 * Online signals mode configuration
 */
export interface OnlineSignalsConfig {
  /** Enable online signals mode (default: false) */
  enabled: boolean;
  /** Server URL for signal upload (e.g., https://signals.moji-proctor.dev) */
  server_url: string;
  /** Maximum number of events to batch before sending (default: 50) */
  max_batch?: number;
  /** Flush interval in milliseconds - how often to send queued events (default: 60000 = 1 minute) */
  flush_interval_ms?: number;
  /** Maximum queue size before dropping oldest events (default: 1000) */
  max_queue?: number;
  /** Maximum number of file paths to include in UNVERIFIED_CHANGES events (default: 10) */
  top_paths_limit?: number;
}

/**
 * Burst detection threshold overrides
 */
export interface BurstThresholds {
  /** Low severity threshold: edits per minute (default: 20) */
  low_edits_per_min?: number;
  /** Medium severity threshold: edits per minute (default: 40) */
  medium_edits_per_min?: number;
  /** High severity threshold: edits per minute (default: 60) */
  high_edits_per_min?: number;
  /** Detection window duration in milliseconds (default: 10000 = 10 seconds) */
  window_ms?: number;
}

/**
 * Main configuration structure
 */
export interface MojiProctorConfig {
  /** Course identifier (optional, for server grouping) */
  course_id?: string;
  /** Assignment identifier (overrides .verified/assignment.json if present) */
  assignment_id?: string;
  /** File patterns to ignore during tracking */
  ignore?: string[];
  /** Burst detection threshold overrides */
  burst_thresholds?: BurstThresholds;
  /** Online signals mode configuration */
  online_signals?: OnlineSignalsConfig;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<Omit<MojiProctorConfig, 'course_id' | 'assignment_id' | 'ignore' | 'burst_thresholds' | 'online_signals'>> & {
  ignore: string[];
  burst_thresholds: BurstThresholds;
  online_signals: OnlineSignalsConfig;
} = {
  ignore: [],
  burst_thresholds: {
    low_edits_per_min: 20,
    medium_edits_per_min: 40,
    high_edits_per_min: 60,
    window_ms: 10000,
  },
  online_signals: {
    enabled: false,
    server_url: '',
    max_batch: 50,
    flush_interval_ms: 60000,
    max_queue: 1000,
    top_paths_limit: 10,
  },
};
