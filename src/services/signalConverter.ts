/**
 * Signal Converter Service
 *
 * Converts local EventEnvelope events to SignalEnvelope format for upload.
 * Filters out sensitive data and prepares signals for server transmission.
 */

import { EventEnvelope, EventType, BurstFlagPayload, CheckpointCreatedPayload } from '../types/events';
import {
  SignalEnvelope,
  SignalType,
  SignalPayload,
  SessionStartSignalPayload,
  SessionEndSignalPayload,
  BurstFlagSignalPayload,
  UnverifiedChangesSignalPayload,
  IntegrityCompromisedSignalPayload,
  CheckpointCreatedSignalPayload,
} from '../types/signals';
import { OnlineSignalsConfig } from '../types/config';

/**
 * Event types that should be uploaded as signals
 */
const SIGNAL_EVENT_TYPES: Set<SignalType> = new Set<SignalType>([
  'SESSION_START',
  'SESSION_END',
  'BURST_FLAG',
  'CHECKPOINT_CREATED',
  'UNVERIFIED_CHANGES',
  'INTEGRITY_COMPROMISED',
]);

/**
 * Conversion context for signal generation
 */
export interface SignalContext {
  /** Assignment identifier */
  assignmentId: string;
  /** Optional course identifier */
  courseId?: string;
  /** Optional git commit SHA */
  commitSha?: string;
  /** Repository identifier */
  repoIdentifier?: string;
}

/**
 * Signal Converter
 *
 * Converts EventEnvelope events to SignalEnvelope format.
 * Sanitizes payloads to remove sensitive information.
 */
export class SignalConverter {
  constructor(private readonly config: OnlineSignalsConfig) {}

  /**
   * Check if an event type should be uploaded as a signal
   *
   * @param eventType - Event type to check
   * @returns True if event should be uploaded
   */
  shouldUpload(eventType: EventType): boolean {
    return SIGNAL_EVENT_TYPES.has(eventType as SignalType);
  }

  /**
   * Convert an event envelope to a signal envelope
   *
   * @param event - Event to convert
   * @param context - Signal context (assignment, course, etc.)
   * @returns Signal envelope or null if event should not be uploaded
   */
  convertToSignal(event: EventEnvelope, context: SignalContext): SignalEnvelope | null {
    if (!this.shouldUpload(event.type)) {
      return null;
    }

    const payload = this.convertPayload(event.type, event.payload);

    return {
      event_id: event.event_id,
      ts: event.ts,
      session_id: event.session_id,
      type: event.type as SignalType,
      payload,
      assignment_id: context.assignmentId,
      course_id: context.courseId,
      commit_sha: context.commitSha,
      repo_identifier: context.repoIdentifier,
    };
  }

  /**
   * Convert event payload to signal payload
   * Sanitizes sensitive information
   *
   * @param eventType - Event type
   * @param payload - Original event payload
   * @returns Sanitized signal payload
   */
  private convertPayload(eventType: EventType, payload: unknown): SignalPayload {
    switch (eventType) {
      case 'SESSION_START':
        return this.convertSessionStart(payload);

      case 'SESSION_END':
        return this.convertSessionEnd(payload);

      case 'BURST_FLAG':
        return this.convertBurstFlag(payload);

      case 'CHECKPOINT_CREATED':
        return this.convertCheckpointCreated(payload);

      case 'UNVERIFIED_CHANGES':
        return this.convertUnverifiedChanges(payload);

      case 'INTEGRITY_COMPROMISED':
        return this.convertIntegrityCompromised(payload);

      default:
        // Should not happen due to shouldUpload check
        throw new Error(`Cannot convert event type: ${eventType}`);
    }
  }

  /**
   * Convert SESSION_START payload
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertSessionStart(payload: unknown): SessionStartSignalPayload {
    const p = payload as SessionStartSignalPayload;
    return {
      workspace_name: p.workspace_name,
    };
  }

  /**
   * Convert SESSION_END payload
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertSessionEnd(payload: unknown): SessionEndSignalPayload {
    const p = payload as SessionEndSignalPayload;
    return {
      focused_seconds: p.focused_seconds,
      active_seconds: p.active_seconds,
      reason: p.reason,
    };
  }

  /**
   * Convert BURST_FLAG payload
   * Removes full file path, keeps only filename
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertBurstFlag(payload: unknown): BurstFlagSignalPayload {
    const p = payload as BurstFlagPayload;

    // Extract file name and extension from path
    const pathParts = p.file_path.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1] || p.file_path;
    const extMatch = fileName.match(/\.([^.]+)$/);
    const fileExtension = extMatch ? extMatch[1] : '';

    return {
      severity: p.severity,
      edit_count: p.edit_count,
      char_count: p.char_count,
      window_ms: p.window_ms,
      file_name: fileName,
      file_extension: fileExtension,
    };
  }

  /**
   * Convert CHECKPOINT_CREATED payload
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertCheckpointCreated(payload: unknown): CheckpointCreatedSignalPayload {
    const p = payload as CheckpointCreatedPayload;
    return {
      checkpoint_id: p.checkpoint_id,
      file_count: p.file_count,
      log_head_hash: p.log_head_hash,
    };
  }

  /**
   * Convert UNVERIFIED_CHANGES payload
   * Removes file contents, keeps only counts and limited file list
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertUnverifiedChanges(payload: unknown): UnverifiedChangesSignalPayload {
    const p = payload as { changes?: Array<{ path: string; change_type: string }>; last_checkpoint_id?: string | null };

    const changes = p.changes || [];

    // Count by change type
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;

    const topPathsLimit = this.config.top_paths_limit || 10;
    const topPaths: Array<{ path: string; change_type: 'added' | 'modified' | 'deleted' }> = [];

    for (const change of changes) {
      switch (change.change_type) {
        case 'added':
          filesAdded++;
          break;
        case 'modified':
          filesModified++;
          break;
        case 'deleted':
          filesDeleted++;
          break;
      }

      // Add to top paths (limited)
      if (topPaths.length < topPathsLimit) {
        topPaths.push({
          path: change.path,
          change_type: change.change_type as 'added' | 'modified' | 'deleted',
        });
      }
    }

    return {
      files_added: filesAdded,
      files_modified: filesModified,
      files_deleted: filesDeleted,
      lines_added: 0, // Not available in current event structure
      lines_removed: 0,
      last_checkpoint_id: p.last_checkpoint_id || null,
      top_paths: topPaths.length > 0 ? topPaths : undefined,
    };
  }

  /**
   * Convert INTEGRITY_COMPROMISED payload
   *
   * @param payload - Original payload
   * @returns Signal payload
   */
  private convertIntegrityCompromised(payload: unknown): IntegrityCompromisedSignalPayload {
    const p = payload as IntegrityCompromisedSignalPayload;
    return {
      reason: p.reason,
      description: p.description,
    };
  }
}

/**
 * Create a signal converter from config
 *
 * @param config - Online signals config
 * @returns Signal converter instance
 */
export function createSignalConverter(config: OnlineSignalsConfig): SignalConverter {
  return new SignalConverter(config);
}
