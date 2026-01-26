/**
 * Database adapter for Verified Coursework GitHub Action
 *
 * Writes validated submission records to remote DB (Supabase, Firebase, or webhook).
 * Only writes AFTER all validations pass.
 *
 * This is Action-only - the extension never writes to remote DB.
 */
import type { MachineReport } from './types.js';
/**
 * GitHub context for DB record
 */
export interface GitHubContext {
    repo: {
        owner: string;
        repo: string;
    };
    sha: string;
    prNumber: number | null;
    baseBranch: string | null;
    actor: string;
    workflowRunUrl: string;
}
/**
 * Record to write to database (flattened to match README schema)
 */
export interface DbRecord {
    repo: string;
    pr_number: number | null;
    commit_sha: string;
    course_id: string;
    assignment_id: string;
    generated_at: string;
    focused_ms: number;
    active_ms: number;
    sessions_count: number;
    bursts_low: number;
    bursts_medium: number;
    bursts_high: number;
    bursts_total: number;
    unverified: boolean;
    unverified_count: number;
    integrity_compromised: boolean;
    hash_chain_ok: boolean;
    continuity_ok: boolean;
    last_log_hash: string | null;
    workflow_run_url: string;
    artifact_url: string | null;
}
/**
 * DB write result
 */
export interface DbWriteResult {
    success: boolean;
    recordId: string | null;
    error: string | null;
}
/**
 * Configuration for DB operations
 */
export interface DbConfig {
    mode: 'supabase' | 'firebase' | 'webhook' | 'disabled';
    supabaseUrl?: string;
    supabaseKey?: string;
    supabaseTable?: string;
    webhookUrl?: string;
    webhookBearer?: string;
    strictMode?: boolean;
}
/**
 * Build a DB record from report and context
 */
export declare function buildRecord(report: MachineReport, context: GitHubContext, lastLogHash: string | null, artifactUrl: string | null, hashChainOk: boolean): DbRecord;
/**
 * Write record to Supabase
 */
export declare function writeRecordSupabase(record: DbRecord, config: DbConfig): Promise<DbWriteResult>;
/**
 * Write record to webhook endpoint
 */
export declare function writeRecordWebhook(record: DbRecord, config: DbConfig): Promise<DbWriteResult>;
/**
 * Write record to configured database
 */
export declare function writeRecord(record: DbRecord, config: DbConfig): Promise<DbWriteResult>;
/**
 * Load DB config from environment variables
 */
export declare function loadDbConfig(): DbConfig;
