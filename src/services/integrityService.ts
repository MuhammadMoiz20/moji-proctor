/**
 * Integrity Service
 *
 * Verifies hash chain and detects missing logs/checkpoints.
 * Emits INTEGRITY_COMPROMISED events when issues are found.
 *
 * TO BE IMPLEMENTED by another agent.
 * This is a stub placeholder only.
 */

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
 * Integrity service interface
 */
export interface IIntegrityService {
  /** Run full integrity check */
  checkIntegrity(): Promise<IntegrityResult>;
  /** Check if assignment.json exists and is valid */
  hasValidAssignment(): Promise<boolean>;
}

/**
 * Integrity service stub implementation
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
    // STUB: To be implemented
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
    // STUB: To be implemented - check .verified/assignment.json
    return false;
  }
}
