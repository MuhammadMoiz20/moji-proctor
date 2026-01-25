/**
 * Validator for Verified Coursework data
 *
 * Performs:
 * - JSON Schema validation
 * - Hash chain verification
 * - Report consistency checks
 */

import Ajv from 'ajv';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { canonicalStringify, sha256, formatSeconds, formatDate } from './utils.js';
import type {
  EventEnvelope,
  MachineReport,
  AssignmentMetadata,
  ValidationResult,
  HashChainResult,
  CheckRunSummary,
  VerifiedData
} from './types.js';
import {
  eventEnvelopeSchema,
  machineReportSchema,
  assignmentSchema
} from './schemas.js';

const ajv = new Ajv({ allErrors: true });

/**
 * Main validator class
 */
export class Validator {
  private verifiedPath: string;
  private data: VerifiedData;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(verifiedPath: string) {
    this.verifiedPath = verifiedPath;
    this.data = {
      report: null,
      log: null,
      assignment: null,
      reportMd: null
    };
  }

  /**
   * Load all verification data files
   */
  loadData(): ValidationResult {
    this.errors = [];
    this.warnings = [];

    // Load report.json
    const reportPath = join(this.verifiedPath, 'report.json');
    if (existsSync(reportPath)) {
      try {
        const reportContent = readFileSync(reportPath, 'utf8');
        this.data.report = JSON.parse(reportContent) as MachineReport;
      } catch (e) {
        this.errors.push(`Failed to read report.json: ${(e as Error).message}`);
      }
    } else {
      this.errors.push('report.json not found');
    }

    // Load log.jsonl
    const logPath = join(this.verifiedPath, 'log.jsonl');
    if (existsSync(logPath)) {
      try {
        const logContent = readFileSync(logPath, 'utf8');
        this.data.log = this.parseJsonl(logContent) as EventEnvelope[];
      } catch (e) {
        this.errors.push(`Failed to read log.jsonl: ${(e as Error).message}`);
      }
    } else {
      this.errors.push('log.jsonl not found');
    }

    // Load assignment.json
    const assignmentPath = join(this.verifiedPath, 'assignment.json');
    if (existsSync(assignmentPath)) {
      try {
        const assignmentContent = readFileSync(assignmentPath, 'utf8');
        this.data.assignment = JSON.parse(assignmentContent) as AssignmentMetadata;
      } catch (e) {
        this.warnings.push(`Failed to read assignment.json: ${(e as Error).message}`);
      }
    } else {
      this.warnings.push('assignment.json not found (may be optional for student submissions)');
    }

    // Load report.md
    const reportMdPath = join(this.verifiedPath, 'report.md');
    if (existsSync(reportMdPath)) {
      try {
        this.data.reportMd = readFileSync(reportMdPath, 'utf8');
      } catch {
        this.warnings.push('Failed to read report.md');
      }
    }

    // Load checkpoint manifests
    const checkpointsPath = join(this.verifiedPath, 'checkpoints');
    if (existsSync(checkpointsPath)) {
      const files = readdirSync(checkpointsPath);
      this.warnings.push(`Found ${files.length} checkpoint file(s)`);
    }

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * Parse JSONL content into array of objects
   */
  private parseJsonl(content: string): unknown[] {
    const lines = content.trim().split('\n');
    const result: unknown[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        result.push(JSON.parse(line));
      } catch (e) {
        this.errors.push(`Invalid JSON on line ${i + 1}: ${(e as Error).message}`);
      }
    }

    return result;
  }

  /**
   * Validate JSON schemas
   */
  validateSchemas(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate report schema
    if (this.data.report) {
      const validateReport = ajv.compile(machineReportSchema);
      if (!validateReport(this.data.report)) {
        const reportErrors = ajv.errorsText(validateReport.errors, { separator: '\n' });
        errors.push(`report.json schema validation failed:\n${reportErrors}`);
      }
    }

    // Validate event envelopes
    if (this.data.log && Array.isArray(this.data.log)) {
      const validateEvent = ajv.compile(eventEnvelopeSchema);
      for (let i = 0; i < this.data.log.length; i++) {
        if (!validateEvent(this.data.log[i])) {
          const eventErrors = ajv.errorsText(validateEvent.errors, { dataVar: `event[${i}]` });
          errors.push(`log.jsonl event ${i} validation failed: ${eventErrors}`);
        }
      }
    }

    // Validate assignment schema
    if (this.data.assignment) {
      const validateAssignment = ajv.compile(assignmentSchema);
      if (!validateAssignment(this.data.assignment)) {
        const assignmentErrors = ajv.errorsText(validateAssignment.errors);
        errors.push(`assignment.json schema validation failed: ${assignmentErrors}`);
      }
    }

    return { success: errors.length === 0, errors, warnings };
  }

  /**
   * Verify hash chain integrity
   */
  verifyHashChain(): HashChainResult {
    if (!this.data.log || !Array.isArray(this.data.log) || this.data.log.length === 0) {
      return {
        valid: false,
        totalEvents: 0,
        brokenAt: null,
        expectedHash: null,
        actualHash: null
      };
    }

    const events = this.data.log as EventEnvelope[];
    let previousHash: string | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      // Verify prev_hash matches previous event's hash
      if (event.prev_hash !== previousHash) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenAt: i,
          expectedHash: previousHash,
          actualHash: event.prev_hash
        };
      }

      // Recompute and verify this event's hash
      const eventForHash = {
        event_id: event.event_id,
        ts: event.ts,
        session_id: event.session_id,
        type: event.type,
        payload: event.payload,
        prev_hash: event.prev_hash
      };
      const computedHash = sha256(canonicalStringify(eventForHash));

      if (computedHash !== event.hash) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenAt: i,
          expectedHash: computedHash,
          actualHash: event.hash
        };
      }

      previousHash = event.hash;
    }

    return {
      valid: true,
      totalEvents: events.length,
      brokenAt: null,
      expectedHash: null,
      actualHash: null
    };
  }

  /**
   * Verify report matches log data
   */
  verifyReportConsistency(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.data.report) {
      errors.push('No report to verify');
      return { success: false, errors, warnings };
    }

    if (!this.data.log || !Array.isArray(this.data.log)) {
      errors.push('No log data to verify against');
      return { success: false, errors, warnings };
    }

    const events = this.data.log as EventEnvelope[];

    // Verify session count
    const sessions = new Set(events.map((e) => e.session_id));
    if (sessions.size !== this.data.report.time.session_count) {
      warnings.push(
        `Session count mismatch: report says ${this.data.report.time.session_count}, log has ${sessions.size}`
      );
    }

    // Verify integrity status matches our hash chain check
    const hashResult = this.verifyHashChain();
    if (hashResult.valid !== this.data.report.integrity.passed) {
      errors.push(
        `Integrity status mismatch: report says ${this.data.report.integrity.passed}, verification found ${hashResult.valid}`
      );
    }

    return { success: errors.length === 0, errors, warnings };
  }

  /**
   * Generate a comprehensive check run summary
   */
  generateSummary(): CheckRunSummary {
    const hashResult = this.verifyHashChain();
    const hasUnverifiedChanges = this.data.report
      ? this.data.report.unverified_changes.length > 0
      : false;
    const reportIntegrityPassed = this.data.report?.integrity.passed ?? false;
    const integrityPassed = hashResult.valid && reportIntegrityPassed;

    let summary = '# Verified Coursework Report\n\n';

    // Overall status
    summary += `## Status\n\n`;
    summary += `**Hash Chain**: ${hashResult.valid ? '✅ OK' : '❌ FAIL'}\n`;
    summary += `**Unverified Changes**: ${hasUnverifiedChanges ? '⚠️ YES' : '✅ NO'}\n`;
    summary += `**Overall Integrity**: ${integrityPassed ? '✅ OK' : '⚠️ FLAGGED'}\n\n`;

    // Hash chain status
    summary += `## Hash Chain Verification\n\n`;
    summary += `- **Events Processed**: ${hashResult.totalEvents}\n`;
    summary += `- **Status**: ${hashResult.valid ? '✅ Valid' : '❌ Broken'}\n`;
    if (!hashResult.valid && hashResult.brokenAt !== null) {
      summary += `- **Broken at Event**: ${hashResult.brokenAt}\n`;
      summary += `- **Expected Hash**: \`${hashResult.expectedHash}\`\n`;
      summary += `- **Actual Hash**: \`${hashResult.actualHash}\`\n`;
    }
    summary += '\n';

    // Report data if available
    if (this.data.report) {
      const r = this.data.report;

      // Time statistics
      summary += `## Time Statistics\n\n`;
      summary += `- **Total Focused Time**: ${formatSeconds(r.time.total_focused_seconds)}\n`;
      summary += `- **Total Active Time**: ${formatSeconds(r.time.total_active_seconds)}\n`;
      summary += `- **Sessions**: ${r.time.session_count}\n`;
      if (r.time.first_session_start) {
        summary += `- **First Session**: ${formatDate(r.time.first_session_start)}\n`;
      }
      if (r.time.last_session_end) {
        summary += `- **Last Session**: ${formatDate(r.time.last_session_end)}\n`;
      }
      summary += '\n';

      // Burst detection
      summary += `## Burst Detection\n\n`;
      summary += `- **Total Bursts**: ${r.bursts.total_count}\n`;
      summary += `- **Low Severity**: ${r.bursts.by_severity.low}\n`;
      summary += `- **Medium Severity**: ${r.bursts.by_severity.medium}\n`;
      summary += `- **High Severity**: ${r.bursts.by_severity.high}\n`;
      summary += '\n';

      // Unverified changes
      summary += `## Unverified Changes\n\n`;
      if (r.unverified_changes.length === 0) {
        summary += `✅ No unverified changes detected\n`;
      } else {
        summary += `⚠️ ${r.unverified_changes.length} unverified change(s) detected:\n\n`;
        for (const change of r.unverified_changes) {
          summary += `- \`${change.path}\` (${change.change_type})\n`;
        }
      }
      summary += '\n';

      // Integrity issues from report
      if (r.integrity.issues.length > 0) {
        summary += `## Integrity Issues\n\n`;
        for (const issue of r.integrity.issues) {
          summary += `- **${issue.type}**: ${issue.description}\n`;
        }
        summary += '\n';
      }
    }

    // Assignment info if available
    if (this.data.assignment) {
      summary += `## Assignment\n\n`;
      summary += `- **ID**: ${this.data.assignment.assignment_id}\n`;
      summary += `- **Name**: ${this.data.assignment.assignment_name}\n`;
      summary += `- **Created**: ${formatDate(this.data.assignment.created_at)}\n`;
      summary += '\n';
    }

    // Warnings and errors
    if (this.warnings.length > 0) {
      summary += `## Warnings\n\n`;
      for (const warning of this.warnings) {
        summary += `- ⚠️ ${warning}\n`;
      }
      summary += '\n';
    }

    if (this.errors.length > 0) {
      summary += `## Errors\n\n`;
      for (const error of this.errors) {
        summary += `- ❌ ${error}\n`;
      }
      summary += '\n';
    }

    return {
      title: integrityPassed ? 'Verified Coursework: Passed' : 'Verified Coursework: Failed',
      summary,
      conclusions: integrityPassed ? 'success' : 'failure'
    };
  }

  /**
   * Get the loaded data
   */
  getData(): VerifiedData {
    return this.data;
  }

  /**
   * Get errors
   */
  getErrors(): string[] {
    return this.errors;
  }

  /**
   * Get warnings
   */
  getWarnings(): string[] {
    return this.warnings;
  }

  /**
   * Get the last log hash from the event chain
   */
  getLastLogHash(): string | null {
    if (!this.data.log || !Array.isArray(this.data.log) || this.data.log.length === 0) {
      return null;
    }
    const events = this.data.log as EventEnvelope[];
    return events[events.length - 1].hash;
  }
}
