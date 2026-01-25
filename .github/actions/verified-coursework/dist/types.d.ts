/**
 * Type definitions for the Verified Coursework GitHub Action
 *
 * These mirror the extension types for consistent validation
 */
/**
 * Event envelope from .verified/log.jsonl
 */
export interface EventEnvelope {
    event_id: string;
    ts: string;
    session_id: string;
    type: EventType;
    payload: unknown;
    prev_hash: string | null;
    hash: string;
}
/**
 * Known event types
 */
export type EventType = 'SESSION_START' | 'SESSION_END' | 'TIME_TICK' | 'BURST_FLAG' | 'CHECKPOINT_CREATED' | 'UNVERIFIED_CHANGES' | 'INTEGRITY_COMPROMISED';
/**
 * Machine-readable report from .verified/report.json
 */
export interface MachineReport {
    schema_version: '0.1.0';
    generated_at: string;
    assignment_id: string;
    session_id: string;
    integrity: IntegrityStatus;
    time: TimeStats;
    bursts: BurstStats;
    checkpoints: CheckpointInfo;
    unverified_changes: UnverifiedChange[];
}
/**
 * Integrity status in report
 */
export interface IntegrityStatus {
    passed: boolean;
    issues: IntegrityIssue[];
}
/**
 * Individual integrity issue
 */
export interface IntegrityIssue {
    type: 'missing_log' | 'broken_hash_chain' | 'missing_checkpoint' | 'missing_assignment';
    description: string;
    event_id?: string;
}
/**
 * Time statistics in report
 */
export interface TimeStats {
    total_focused_seconds: number;
    total_active_seconds: number;
    session_count: number;
    first_session_start: string | null;
    last_session_end: string | null;
}
/**
 * Burst detection statistics in report
 */
export interface BurstStats {
    total_count: number;
    by_severity: {
        low: number;
        medium: number;
        high: number;
    };
}
/**
 * Checkpoint information in report
 */
export interface CheckpointInfo {
    count: number;
    latest_checkpoint_id: string | null;
}
/**
 * Unverified change entry in report
 */
export interface UnverifiedChange {
    path: string;
    change_type: 'added' | 'modified' | 'deleted';
    detected_after_checkpoint: string;
}
/**
 * Assignment metadata from .verified/assignment.json
 */
export interface AssignmentMetadata {
    assignment_id: string;
    assignment_name: string;
    created_at: string;
    expected_files?: string[];
}
/**
 * Validation result
 */
export interface ValidationResult {
    success: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Hash chain validation result
 */
export interface HashChainResult {
    valid: boolean;
    totalEvents: number;
    brokenAt: number | null;
    expectedHash: string | null;
    actualHash: string | null;
}
/**
 * Check run summary
 */
export interface CheckRunSummary {
    title: string;
    summary: string;
    conclusions: 'success' | 'failure';
}
/**
 * Verified data files
 */
export interface VerifiedData {
    report: MachineReport | null;
    log: EventEnvelope[] | null;
    assignment: AssignmentMetadata | null;
    reportMd: string | null;
}
