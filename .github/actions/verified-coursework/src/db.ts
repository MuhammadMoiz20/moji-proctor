/**
 * Database adapter for Verified Coursework GitHub Action
 *
 * Writes validated submission records to remote DB (Supabase or webhook).
 * Only writes AFTER all validations pass.
 *
 * This is Action-only - the extension never writes to remote DB.
 */

import type { MachineReport } from './types.js';

/**
 * GitHub context for DB record
 */
export interface GitHubContext {
  repo: { owner: string; repo: string };
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
  mode: 'supabase' | 'webhook' | 'disabled';
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
export function buildRecord(
  report: MachineReport,
  context: GitHubContext,
  lastLogHash: string | null,
  artifactUrl: string | null,
  hashChainOk: boolean
): DbRecord {
  const repo = `${context.repo.owner}/${context.repo.repo}`;

  // Extract course_id from assignment_id if available
  // Format: course-id:assignment-id or just assignment-id
  const assignmentParts = report.assignment_id.split(':');
  const courseId = assignmentParts.length > 1 ? assignmentParts[0] : 'unknown';
  const assignmentId = assignmentParts.length > 1 ? assignmentParts[1] : report.assignment_id;

  return {
    repo,
    pr_number: context.prNumber,
    commit_sha: context.sha,
    course_id: courseId,
    assignment_id: assignmentId,
    generated_at: report.generated_at,
    focused_ms: report.time.total_focused_seconds * 1000,
    active_ms: report.time.total_active_seconds * 1000,
    sessions_count: report.time.session_count,
    bursts_low: report.bursts.by_severity.low,
    bursts_medium: report.bursts.by_severity.medium,
    bursts_high: report.bursts.by_severity.high,
    bursts_total: report.bursts.total_count,
    unverified: report.unverified_changes.length > 0,
    unverified_count: report.unverified_changes.length,
    integrity_compromised: !report.integrity.passed,
    hash_chain_ok: hashChainOk,
    continuity_ok: hashChainOk,
    last_log_hash: lastLogHash,
    workflow_run_url: context.workflowRunUrl,
    artifact_url: artifactUrl,
  };
}

/**
 * Write record to Supabase
 */
export async function writeRecordSupabase(
  record: DbRecord,
  config: DbConfig
): Promise<DbWriteResult> {
  const { supabaseUrl, supabaseKey, supabaseTable = 'verified_reports' } = config;

  if (!supabaseUrl || !supabaseKey) {
    return {
      success: false,
      recordId: null,
      error: 'Missing Supabase URL or key',
    };
  }

  try {
    const url = new URL(`${supabaseUrl}/rest/v1/${supabaseTable}`);
    url.searchParams.set('on_conflict', 'repo,pr_number,commit_sha');

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([record]),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        recordId: null,
        error: `Supabase error (${response.status}): ${errorText}`,
      };
    }

    // Generate deterministic record ID
    const recordId = `${record.repo}:${record.pr_number || 'no-pr'}:${record.commit_sha}`;

    return {
      success: true,
      recordId,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      recordId: null,
      error: (error as Error).message,
    };
  }
}

/**
 * Write record to webhook endpoint
 */
export async function writeRecordWebhook(
  record: DbRecord,
  config: DbConfig
): Promise<DbWriteResult> {
  const { webhookUrl, webhookBearer } = config;

  if (!webhookUrl) {
    return {
      success: false,
      recordId: null,
      error: 'Missing webhook URL',
    };
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (webhookBearer) {
      headers['Authorization'] = `Bearer ${webhookBearer}`;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        recordId: null,
        error: `Webhook error (${response.status}): ${errorText}`,
      };
    }

    // Generate deterministic record ID
    const recordId = `${record.repo}:${record.pr_number || 'no-pr'}:${record.commit_sha}`;

    return {
      success: true,
      recordId,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      recordId: null,
      error: (error as Error).message,
    };
  }
}

/**
 * Write record to configured database
 */
export async function writeRecord(
  record: DbRecord,
  config: DbConfig
): Promise<DbWriteResult> {
  if (config.mode === 'disabled') {
    return {
      success: true,
      recordId: 'disabled',
      error: null,
    };
  }

  if (config.mode === 'supabase') {
    return writeRecordSupabase(record, config);
  }

  if (config.mode === 'webhook') {
    return writeRecordWebhook(record, config);
  }

  return {
    success: false,
    recordId: null,
    error: `Unknown DB mode: ${config.mode}`,
  };
}

/**
 * Load DB config from environment variables
 */
export function loadDbConfig(): DbConfig {
  const mode = (process.env.VERIFIED_DB_MODE || 'disabled') as DbConfig['mode'];

  const config: DbConfig = {
    mode,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseTable: process.env.SUPABASE_TABLE || 'verified_reports',
    webhookUrl: process.env.VERIFIED_WEBHOOK_URL,
    webhookBearer: process.env.VERIFIED_WEBHOOK_BEARER,
    strictMode: process.env.STRICT_DB_WRITE === 'true',
  };

  return config;
}
