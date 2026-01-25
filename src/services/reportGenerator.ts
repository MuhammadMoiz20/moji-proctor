/**
 * Report Generator Service
 *
 * Aggregates data from logs, checkpoints, and integrity checks
 * to produce report.json and report.md.
 */

import { IEventLog } from '../storage/eventLog';
import { ICheckpointStore } from '../storage/checkpointStore';
import { IReportWriter } from '../storage/reportWriter';
import { IIntegrityService } from '../services/integrityService';
import {
  MachineReport,
  IntegrityStatus,
  TimeStats,
  BurstStats,
  CheckpointInfo,
  UnverifiedChange,
} from '../types/report';
import {
  EventEnvelope,
  EventType,
  SessionStartPayload,
  SessionEndPayload,
  TimeTickPayload,
  BurstFlagPayload,
  CheckpointCreatedPayload,
  UnverifiedChangesPayload,
} from '../types/events';
import { CheckpointManifest } from '../types/checkpoints';

/**
 * Report generator interface
 */
export interface IReportGenerator {
  /** Generate both JSON and markdown reports */
  generateReports(): Promise<void>;
  /** Generate only JSON report */
  generateJsonReport(): Promise<MachineReport>;
  /** Generate only markdown report from existing JSON report */
  generateMdReport(): Promise<string>;
  /** Get current session ID for report */
  getCurrentSessionId(): string | null;
}

/**
 * Aggregated time data from events
 */
interface AggregatedTimeData {
  total_focused_seconds: number;
  total_active_seconds: number;
  session_count: number;
  first_session_start: string | null;
  last_session_end: string | null;
}

/**
 * Aggregated burst data from events
 */
interface AggregatedBurstData {
  total_count: number;
  by_severity: {
    low: number;
    medium: number;
    high: number;
  };
}

/**
 * Report generator implementation
 */
export class ReportGenerator implements IReportGenerator {
  private readonly eventLog: IEventLog;
  private readonly checkpointStore: ICheckpointStore;
  private readonly reportWriter: IReportWriter;
  private readonly integrityService: IIntegrityService;
  private readonly assignmentId: string;
  private currentSessionId: string | null = null;

  constructor(
    eventLog: IEventLog,
    checkpointStore: ICheckpointStore,
    reportWriter: IReportWriter,
    integrityService: IIntegrityService,
    assignmentId: string
  ) {
    this.eventLog = eventLog;
    this.checkpointStore = checkpointStore;
    this.reportWriter = reportWriter;
    this.integrityService = integrityService;
    this.assignmentId = assignmentId;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Set the current session ID (called by extension)
   */
  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Generate both JSON and markdown reports
   */
  async generateReports(): Promise<void> {
    const jsonReport = await this.generateJsonReport();
    await this.reportWriter.writeJsonReport(jsonReport);

    const mdReport = await this.generateMdReportFromData(jsonReport);
    await this.reportWriter.writeMdReport(mdReport);
  }

  /**
   * Generate machine-readable JSON report
   * Aggregates data from events, checkpoints, and integrity checks
   */
  async generateJsonReport(): Promise<MachineReport> {
    // Read all events from the log
    const events = await this.eventLog.readAllEvents();

    // Aggregate time data from SESSION_START, SESSION_END, TIME_TICK events
    const timeData = this.aggregateTimeData(events);

    // Aggregate burst data from BURST_FLAG events
    const burstData = this.aggregateBurstData(events);

    // Get checkpoint info
    const checkpointInfo = await this.getCheckpointInfo();

    // Get unverified changes from UNVERIFIED_CHANGES events
    const unverifiedChanges = this.extractUnverifiedChanges(events, checkpointInfo);

    // Run integrity check
    const integrityResult = await this.integrityService.checkIntegrity();
    const integrity: IntegrityStatus = {
      passed: integrityResult.passed,
      issues: integrityResult.issues,
    };

    return {
      schema_version: '0.1.0',
      generated_at: new Date().toISOString(),
      assignment_id: this.assignmentId,
      session_id: this.currentSessionId || 'unknown',
      integrity,
      time: timeData,
      bursts: burstData,
      checkpoints: checkpointInfo,
      unverified_changes: unverifiedChanges,
    };
  }

  /**
   * Generate markdown report from existing JSON report
   * Reads the JSON file and converts to markdown
   */
  async generateMdReport(): Promise<string> {
    // This method generates from the JSON report file
    // For internal use, we use generateMdReportFromData directly
    const jsonReport = await this.generateJsonReport();
    return this.generateMdReportFromData(jsonReport);
  }

  /**
   * Generate human-readable markdown report from MachineReport data
   */
  private generateMdReportFromData(report: MachineReport): string {
    const lines: string[] = [];

    // Header
    lines.push('# Moji Proctor Report');
    lines.push('');
    lines.push(`**Assignment ID:** ${report.assignment_id}`);
    lines.push(`**Generated:** ${formatTimestamp(report.generated_at)}`);
    lines.push(`**Session ID:** ${report.session_id}`);
    lines.push('');

    // Summary Table
    lines.push('## Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Integrity Status | ${report.integrity.passed ? '✅ PASSED' : '❌ FAILED'} |`);
    lines.push(`| Total Sessions | ${report.time.session_count} |`);
    lines.push(`| Total Focused Time | ${formatDuration(report.time.total_focused_seconds)} |`);
    lines.push(`| Total Active Time | ${formatDuration(report.time.total_active_seconds)} |`);
    lines.push(`| Burst Events | ${report.bursts.total_count} |`);
    lines.push(`| Checkpoints | ${report.checkpoints.count} |`);
    lines.push(`| Unverified Changes | ${report.unverified_changes.length} |`);
    lines.push('');

    // Integrity Section
    lines.push('## Integrity');
    lines.push('');
    if (report.integrity.passed) {
      lines.push('✅ **All integrity checks passed.**');
      lines.push('');
      lines.push('The event log hash chain is intact and all required files are present.');
    } else {
      lines.push('❌ **Integrity issues detected.**');
      lines.push('');
      if (report.integrity.issues.length > 0) {
        lines.push('### Issues Found:');
        lines.push('');
        for (const issue of report.integrity.issues) {
          lines.push(`- **${issue.type}**: ${issue.description}`);
          if (issue.event_id) {
            lines.push(`  - Event ID: \`${issue.event_id}\``);
          }
        }
        lines.push('');
      }
    }

    // Time Tracking Section
    lines.push('## Time Tracking');
    lines.push('');
    lines.push('### Session Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Total Sessions | ${report.time.session_count} |`);
    lines.push(`| Total Focused Time | ${formatDuration(report.time.total_focused_seconds)} |`);
    lines.push(`| Total Active Time | ${formatDuration(report.time.total_active_seconds)} |`);

    // Calculate active/focused ratio
    if (report.time.total_focused_seconds > 0) {
      const activeRatio = (report.time.total_active_seconds / report.time.total_focused_seconds * 100).toFixed(1);
      lines.push(`| Active/Focused Ratio | ${activeRatio}% |`);
    }
    lines.push('');

    if (report.time.first_session_start) {
      lines.push(`**First Session Started:** ${formatTimestamp(report.time.first_session_start)}`);
    }
    if (report.time.last_session_end) {
      lines.push(`**Last Session Ended:** ${formatTimestamp(report.time.last_session_end)}`);
    }
    lines.push('');

    // Burst Detection Section
    lines.push('## Burst Detection');
    lines.push('');
    lines.push('Burst events detect periods of unusually rapid editing that may indicate:');
    lines.push('- Copy-pasting large blocks of code');
    lines.push('- Using AI code generation tools');
    lines.push('- Automated transformations');
    lines.push('');
    lines.push('### Summary');
    lines.push('');
    lines.push('| Severity | Count |');
    lines.push('|----------|-------|');
    lines.push(`| Low | ${report.bursts.by_severity.low} |`);
    lines.push(`| Medium | ${report.bursts.by_severity.medium} |`);
    lines.push(`| High | ${report.bursts.by_severity.high} |`);
    lines.push(`| **Total** | **${report.bursts.total_count}** |`);
    lines.push('');

    // Checkpoints Section
    lines.push('## Checkpoints');
    lines.push('');
    lines.push(`**Total Checkpoints:** ${report.checkpoints.count}`);
    if (report.checkpoints.latest_checkpoint_id) {
      lines.push(`**Latest Checkpoint ID:** \`${report.checkpoints.latest_checkpoint_id}\``);
    }
    lines.push('');
    lines.push('Checkpoints are snapshots of file state taken at session boundaries and report generation.');
    lines.push('');

    // Unverified Changes Section
    lines.push('## Unverified Changes');
    lines.push('');
    if (report.unverified_changes.length === 0) {
      lines.push('✅ **No unverified changes detected.**');
      lines.push('');
      lines.push('All file changes have been tracked during active sessions.');
    } else {
      lines.push(`⚠️ **${report.unverified_changes.length} unverified change(s) detected.**`);
      lines.push('');
      lines.push('The following changes were detected between sessions without telemetry:');
      lines.push('');
      lines.push('| File | Change Type | Detected After Checkpoint |');
      lines.push('|------|-------------|---------------------------|');
      for (const change of report.unverified_changes) {
        const changeIcon = change.change_type === 'added' ? '➕' :
                          change.change_type === 'deleted' ? '🗑️' : '✏️';
        lines.push(`| ${change.path} | ${changeIcon} ${change.change_type} | \`${change.detected_after_checkpoint}\` |`);
      }
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push('*This report was generated by Moji Proctor, a VS Code extension for verified coursework tracking.*');
    lines.push('');
    lines.push(`**Schema Version:** ${report.schema_version}`);

    return lines.join('\n');
  }

  /**
   * Aggregate time statistics from events
   */
  private aggregateTimeData(events: EventEnvelope[]): TimeStats {
    let total_focused_seconds = 0;
    let total_active_seconds = 0;
    let session_count = 0;
    let first_session_start: string | null = null;
    let last_session_end: string | null = null;

    // Track totals per session to avoid double counting
    const sessionTotals = new Map<string, { focused: number; active: number }>();

    for (const event of events) {
      switch (event.type) {
        case 'SESSION_START': {
          session_count++;
          if (!first_session_start) {
            first_session_start = event.ts;
          }
          break;
        }
        case 'SESSION_END': {
          last_session_end = event.ts;
          const payload = event.payload as SessionEndPayload;
          sessionTotals.set(event.session_id, {
            focused: payload.focused_seconds,
            active: payload.active_seconds,
          });
          break;
        }
        case 'TIME_TICK': {
          // Also aggregate TIME_TICK events for sessions that haven't ended yet
          const payload = event.payload as TimeTickPayload;
          const current = sessionTotals.get(event.session_id) || { focused: 0, active: 0 };
          sessionTotals.set(event.session_id, {
            focused: current.focused + payload.focused_delta_seconds,
            active: current.active + payload.active_delta_seconds,
          });
          break;
        }
      }
    }

    // Sum up all session totals
    for (const totals of sessionTotals.values()) {
      total_focused_seconds += totals.focused;
      total_active_seconds += totals.active;
    }

    return {
      total_focused_seconds,
      total_active_seconds,
      session_count,
      first_session_start,
      last_session_end,
    };
  }

  /**
   * Aggregate burst statistics from events
   */
  private aggregateBurstData(events: EventEnvelope[]): BurstStats {
    let total_count = 0;
    const by_severity = { low: 0, medium: 0, high: 0 };

    for (const event of events) {
      if (event.type === 'BURST_FLAG') {
        total_count++;
        const payload = event.payload as BurstFlagPayload;
        by_severity[payload.severity]++;
      }
    }

    return {
      total_count,
      by_severity,
    };
  }

  /**
   * Get checkpoint information
   */
  private async getCheckpointInfo(): Promise<CheckpointInfo> {
    const checkpoints = await this.checkpointStore.listCheckpoints();
    const latest = await this.checkpointStore.getLatestCheckpoint();

    return {
      count: checkpoints.length,
      latest_checkpoint_id: latest?.checkpoint_id ?? null,
    };
  }

  /**
   * Extract unverified changes from events
   * Maps each change to the checkpoint it was detected after
   */
  private extractUnverifiedChanges(
    events: EventEnvelope[],
    checkpointInfo: CheckpointInfo
  ): UnverifiedChange[] {
    const changes: UnverifiedChange[] = [];

    for (const event of events) {
      if (event.type === 'UNVERIFIED_CHANGES') {
        const payload = event.payload as UnverifiedChangesPayload;

        for (const change of payload.changes) {
          changes.push({
            path: change.path,
            change_type: change.change_type,
            detected_after_checkpoint: payload.last_checkpoint_id || 'unknown',
          });
        }
      }
    }

    return changes;
  }
}

/**
 * Format timestamp for human-readable display
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * Format duration in seconds to human-readable format
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}
