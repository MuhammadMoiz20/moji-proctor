/**
 * Event Log Storage Service
 *
 * CONTRACT: This is the ONLY module that computes event hashes.
 * Single source of truth for prev_hash, hash generation, and canonical JSON.
 *
 * Implements append-only JSONL log with hash chaining.
 *
 * Agent 5 implementation: Full hash chaining with integrity verification.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEnvelope, EventType } from '../types/events';
import { canonicalStringify } from '../utils/canonicalJson';
import { sha256, generateId } from '../utils/hash';

/**
 * Path to the event log file within .verified directory
 */
export const LOG_PATH = '.verified/log.jsonl';

/**
 * Path to the log head hash file
 */
export const HEAD_HASH_PATH = '.verified/log.head';

/**
 * Number of events to verify in "tail mode" for large logs
 */
const TAIL_VERIFY_COUNT = 100;

/**
 * Threshold for using tail verification instead of full verification
 */
const FULL_VERIFY_THRESHOLD = 1000;

/**
 * Integrity check result
 */
export interface IntegrityCheckResult {
  /** Whether the chain is intact */
  valid: boolean;
  /** List of issues found */
  issues: string[];
  /** Whether check was partial (tail only) */
  partial: boolean;
  /** Number of events verified */
  eventsChecked: number;
  /** Total events in log */
  totalEvents: number;
}

/**
 * Event log service interface
 */
export interface IEventLog {
  /** Append an event to the log */
  appendEvent(type: EventType, payload: unknown, sessionId: string): Promise<EventEnvelope>;
  /** Read all events from the log */
  readAllEvents(): Promise<EventEnvelope[]>;
  /** Get the last event's hash (null if log is empty) */
  getLastHash(): Promise<string | null>;
  /** Verify hash chain integrity (full or tail based on size) */
  verifyChain(options?: { forceFull?: boolean }): Promise<IntegrityCheckResult>;
  /** Load stored head hash from disk */
  loadHeadHash(): Promise<string | null>;
  /** Store head hash to disk */
  storeHeadHash(hash: string): Promise<void>;
  /** Check if integrity has been compromised */
  isCompromised(): boolean;
  /** Get the path to the log file */
  getLogPath(): string;
}

/**
 * Event log service implementation
 */
export class EventLog implements IEventLog {
  private readonly logPath: string;
  private readonly headHashPath: string;
  private readonly workspaceRoot: string;
  private compromisedFlag: boolean = false;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.logPath = path.join(workspaceRoot, LOG_PATH);
    this.headHashPath = path.join(workspaceRoot, HEAD_HASH_PATH);
  }

  /**
   * Append an event to the log
   *
   * @param type - Event type
   * @param payload - Event payload
   * @param sessionId - Current session ID
   * @returns The created event envelope
   */
  async appendEvent(type: EventType, payload: unknown, sessionId: string): Promise<EventEnvelope> {
    // Ensure .verified directory exists
    await this.ensureLogDirectory();

    // Get previous hash
    const prevHash = await this.getLastHash();

    // Create event envelope (without hash)
    const eventId = generateId();
    const timestamp = new Date().toISOString();

    const eventWithoutHash: Omit<EventEnvelope, 'hash'> = {
      event_id: eventId,
      ts: timestamp,
      session_id: sessionId,
      type,
      payload,
      prev_hash: prevHash,
    };

    // Compute hash using canonical JSON
    const canonical = canonicalStringify(eventWithoutHash);
    const hash = sha256(canonical);

    const event: EventEnvelope = {
      ...eventWithoutHash,
      hash,
    };

    // Append to log
    const line = canonicalStringify(event) + '\n';
    await fs.appendFile(this.logPath, line, 'utf8');

    return event;
  }

  /**
   * Read all events from the log
   *
   * @returns Array of all events
   */
  async readAllEvents(): Promise<EventEnvelope[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      return lines.map((line) => JSON.parse(line) as EventEnvelope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read the last N events from the log (for tail verification)
   *
   * @param count - Number of events to read from the end
   * @returns Array of the last N events
   */
  async readTailEvents(count: number): Promise<EventEnvelope[]> {
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      const tailLines = lines.slice(-count);
      return tailLines.map((line) => JSON.parse(line) as EventEnvelope);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get the last event's hash
   *
   * @returns Hash of last event, or null if log is empty
   */
  async getLastHash(): Promise<string | null> {
    // Try reading from the end of file for efficiency
    try {
      const content = await fs.readFile(this.logPath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        return null;
      }
      const lastLine = lines[lines.length - 1];
      const lastEvent = JSON.parse(lastLine) as EventEnvelope;
      return lastEvent.hash;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Verify the integrity of the hash chain
   *
   * For small logs (< FULL_VERIFY_THRESHOLD), performs full verification.
   * For large logs, performs tail verification only (last TAIL_VERIFY_COUNT events).
   *
   * @param options - Verification options
   * @returns Validation result with details
   */
  async verifyChain(options: { forceFull?: boolean } = {}): Promise<IntegrityCheckResult> {
    const allEvents = await this.readAllEvents();
    const totalEvents = allEvents.length;

    if (totalEvents === 0) {
      return {
        valid: true,
        issues: [],
        partial: false,
        eventsChecked: 0,
        totalEvents: 0,
      };
    }

    // Determine if we should do tail verification
    const useTailVerification = !options.forceFull && totalEvents > FULL_VERIFY_THRESHOLD;

    let eventsToVerify: EventEnvelope[];
    let startIndex: number;

    if (useTailVerification) {
      // For large logs, verify only the tail
      eventsToVerify = await this.readTailEvents(TAIL_VERIFY_COUNT);
      startIndex = totalEvents - eventsToVerify.length;
    } else {
      // Full verification for small logs or when forced
      eventsToVerify = allEvents;
      startIndex = 0;
    }

    const issues: string[] = [];

    for (let i = 0; i < eventsToVerify.length; i++) {
      const event = eventsToVerify[i];
      const globalIndex = startIndex + i;

      // Verify hash
      const eventWithoutHash: Omit<EventEnvelope, 'hash'> = {
        event_id: event.event_id,
        ts: event.ts,
        session_id: event.session_id,
        type: event.type,
        payload: event.payload,
        prev_hash: event.prev_hash,
      };
      const expectedHash = sha256(canonicalStringify(eventWithoutHash));

      if (event.hash !== expectedHash) {
        issues.push(
          `Event ${globalIndex}: Hash mismatch (expected ${expectedHash.substring(0, 16)}..., got ${event.hash.substring(0, 16)}...)`
        );
      }

      // Verify prev_hash links
      if (globalIndex > 0) {
        // In tail mode, we need to check against the previous event in our subset
        // or against the actual previous event from the full log
        let prevEventHash: string | null;

        if (i > 0) {
          prevEventHash = eventsToVerify[i - 1].hash;
        } else if (useTailVerification && startIndex > 0) {
          // For the first event in tail mode, verify against the event just before our tail
          prevEventHash = allEvents[startIndex - 1].hash;
        } else {
          prevEventHash = null;
        }

        if (event.prev_hash !== prevEventHash) {
          issues.push(
            `Event ${globalIndex}: prev_hash does not match previous event's hash (expected ${prevEventHash?.substring(0, 16)}${prevEventHash === null ? '' : '...'}..., got ${event.prev_hash?.substring(0, 16) || 'null'}...)`
          );
        }
      } else if (event.prev_hash !== null) {
        issues.push(`Event 0: First event should have prev_hash=null, got ${event.prev_hash}`);
      }
    }

    const result: IntegrityCheckResult = {
      valid: issues.length === 0,
      issues,
      partial: useTailVerification,
      eventsChecked: eventsToVerify.length,
      totalEvents,
    };

    // Update compromised flag if issues found
    if (!result.valid) {
      this.compromisedFlag = true;
    }

    return result;
  }

  /**
   * Load stored head hash from disk
   *
   * The head hash file is used by checkpoints to verify the log state
   * at the time the checkpoint was created.
   *
   * @returns Stored head hash, or null if file doesn't exist
   */
  async loadHeadHash(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.headHashPath, 'utf8');
      return content.trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Store head hash to disk
   *
   * This is typically called when creating a checkpoint, so that
   * future integrity checks can verify the log hasn't been tampered with.
   *
   * @param hash - Head hash to store
   */
  async storeHeadHash(hash: string): Promise<void> {
    await this.ensureLogDirectory();
    await fs.writeFile(this.headHashPath, hash, 'utf8');
  }

  /**
   * Check if integrity has been compromised
   *
   * @returns True if integrity issues have been detected
   */
  isCompromised(): boolean {
    return this.compromisedFlag;
  }

  /**
   * Reset the compromised flag
   *
   * This should be called after handling an integrity event.
   */
  resetCompromisedFlag(): void {
    this.compromisedFlag = false;
  }

  /**
   * Get the path to the log file
   *
   * @returns Absolute path to the log file
   */
  getLogPath(): string {
    return this.logPath;
  }

  /**
   * Get the total number of events in the log
   *
   * @returns Number of events
   */
  async getEventCount(): Promise<number> {
    const events = await this.readAllEvents();
    return events.length;
  }

  /**
   * Ensure .verified directory exists
   */
  private async ensureLogDirectory(): Promise<void> {
    const dir = path.dirname(this.logPath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Ignore if already exists
    }
  }
}
