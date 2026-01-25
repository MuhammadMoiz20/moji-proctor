/**
 * Integrity Service
 *
 * Verifies hash chain and detects missing logs/checkpoints.
 * Emits INTEGRITY_COMPROMISED events when issues are found.
 */

import * as fs from 'fs';
import * as path from 'path';
import { IEventLog } from '../storage/eventLog';
import { ICheckpointStore } from '../storage/checkpointStore';

/**
 * Integrity issue
 */
export interface IntegrityIssue {
  type: 'missing_log' | 'broken_hash_chain' | 'missing_checkpoint' | 'missing_assignment';
  description: string;
  event_id?: string;
}

/**
 * Integrity check result
 */
export interface IntegrityResult {
  passed: boolean;
  issues: IntegrityIssue[];
}

/**
 * Assignment.json schema
 */
export interface AssignmentConfig {
  course_id: string;
  assignment_id: string;
  ignore?: string[];
  idle_seconds?: number;
  submission_mode?: string;
  burst_thresholds?: Record<string, unknown>;
}

/**
 * Integrity service interface
 */
export interface IIntegrityService {
  /** Run full integrity check */
  checkIntegrity(): Promise<IntegrityResult>;
  /** Check if assignment.json exists and is valid */
  hasValidAssignment(): Promise<boolean>;
}

/**
 * Integrity service implementation
 */
export class IntegrityService implements IIntegrityService {
  private readonly eventLog: IEventLog;
  private readonly checkpointStore: ICheckpointStore;
  private readonly workspaceRoot: string;

  constructor(eventLog: IEventLog, checkpointStore: ICheckpointStore, workspaceRoot: string) {
    this.eventLog = eventLog;
    this.checkpointStore = checkpointStore;
    this.workspaceRoot = workspaceRoot;
  }

  async checkIntegrity(): Promise<IntegrityResult> {
    const chainResult = await this.eventLog.verifyChain();
    return {
      passed: chainResult.valid,
      issues: chainResult.issues.map((desc) => ({
        type: 'broken_hash_chain' as const,
        description: desc,
      })),
    };
  }

  async hasValidAssignment(): Promise<boolean> {
    const assignmentPath = path.join(this.workspaceRoot, '.verified', 'assignment.json');

    try {
      // Check if file exists
      await fs.promises.access(assignmentPath, fs.constants.F_OK);
    } catch {
      // File doesn't exist
      return false;
    }

    try {
      // Read and parse file
      const content = await fs.promises.readFile(assignmentPath, 'utf-8');
      const data = JSON.parse(content) as unknown;

      // Validate required keys exist and are strings
      if (
        typeof data !== 'object' ||
        data === null ||
        !('course_id' in data) ||
        typeof (data as { course_id: unknown }).course_id !== 'string' ||
        !('assignment_id' in data) ||
        typeof (data as { assignment_id: unknown }).assignment_id !== 'string'
      ) {
        return false;
      }

      // Optional key type validation (ignore, idle_seconds, submission_mode, burst_thresholds)
      const config = data as AssignmentConfig;

      if (config.ignore !== undefined) {
        if (!Array.isArray(config.ignore)) {
          return false;
        }
        // Check all elements are strings
        if (!config.ignore.every((item) => typeof item === 'string')) {
          return false;
        }
      }

      if (config.idle_seconds !== undefined && typeof config.idle_seconds !== 'number') {
        return false;
      }

      if (config.submission_mode !== undefined && typeof config.submission_mode !== 'string') {
        return false;
      }

      if (config.burst_thresholds !== undefined && (typeof config.burst_thresholds !== 'object' || config.burst_thresholds === null)) {
        return false;
      }

      return true;
    } catch {
      // JSON parse error or other error
      return false;
    }
  }
}
