/**
 * Burst Detection Service
 *
 * Detects rapid edits that may indicate copy-paste or AI-generated code.
 * Emits BURST_FLAG events when thresholds are exceeded.
 *
 * Uses rolling window algorithm to track edit velocity.
 */

import * as vscode from 'vscode';
import { IEventLog } from '../storage/eventLog';
import { BurstFlagPayload } from '../types/events';

/**
 * Severity levels for burst detection
 */
export type BurstSeverity = 'low' | 'medium' | 'high';

/**
 * Single edit event tracked in the rolling window
 */
interface EditEvent {
  /** Timestamp when edit occurred */
  timestamp: number;
  /** Number of lines added */
  linesAdded: number;
  /** Number of lines removed */
  linesRemoved: number;
  /** Number of characters changed */
  charsChanged: number;
  /** File path where edit occurred */
  filePath: string;
}

/**
 * Rolling window state for a single file
 */
interface FileWindow {
  /** File path */
  filePath: string;
  /** Edit events within the window */
  events: EditEvent[];
  /** Window start time (oldest event timestamp to keep) */
  windowStart: number;
}

/**
 * Burst event summary
 */
export interface BurstSummary {
  total_count: number;
  by_severity: {
    low: number;
    medium: number;
    high: number;
  };
}

/**
 * Burst detection thresholds
 */
interface Thresholds {
  /** Window size in milliseconds */
  windowMs: number;
  /** Minimum edits for low severity */
  lowEditThreshold: number;
  /** Minimum edits for medium severity */
  mediumEditThreshold: number;
  /** Minimum edits for high severity */
  highEditThreshold: number;
  /** Minimum character change threshold */
  lowCharThreshold: number;
  /** Minimum character change for medium severity */
  mediumCharThreshold: number;
  /** Minimum character change for high severity */
  highCharThreshold: number;
}

/**
 * Default thresholds for burst detection
 */
const DEFAULT_THRESHOLDS: Thresholds = {
  windowMs: 5000, // 5 seconds
  lowEditThreshold: 3,
  mediumEditThreshold: 5,
  highEditThreshold: 10,
  lowCharThreshold: 100,
  mediumCharThreshold: 500,
  highCharThreshold: 1000,
};

/**
 * Minimum edit size to track (in characters)
 * Ignore single-character typo fixes
 */
const MIN_EDIT_SIZE = 10;

/**
 * Minimum time between burst flags for the same file (ms)
 * Prevents spamming burst events
 */
const BURST_COOLDOWN = 10000;

/**
 * Burst detector configuration
 */
export interface BurstDetectorConfig {
  /** Detection thresholds */
  thresholds?: Partial<Thresholds>;
  /** Minimum edit size to track */
  minEditSize?: number;
  /** Cooldown between burst events per file */
  burstCooldown?: number;
}

/**
 * Burst detector interface
 */
export interface IBurstDetector {
  /** Start monitoring document changes */
  start(): void;
  /** Stop monitoring */
  stop(): void;
  /** Get burst summary */
  getSummary(): BurstSummary;
  /** Reset burst statistics */
  reset(): void;
}

/**
 * Burst detector implementation
 *
 * Uses a per-file rolling window to track edit velocity.
 * When thresholds are exceeded, emits BURST_FLAG events.
 */
export class BurstDetector implements IBurstDetector {
  private _running = false;
  private readonly eventLog: IEventLog;
  private readonly thresholds: Thresholds;
  private readonly minEditSize: number;
  private readonly burstCooldown: number;
  private readonly fileWindows: Map<string, FileWindow>;
  private readonly lastBurstTime: Map<string, number>;
  private readonly burstCounts: Map<BurstSeverity, number>;
  private disposable: vscode.Disposable | null = null;
  private sessionId: string | null = null;

  constructor(eventLog: IEventLog, config?: BurstDetectorConfig) {
    this.eventLog = eventLog;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...config?.thresholds };
    this.minEditSize = config?.minEditSize ?? MIN_EDIT_SIZE;
    this.burstCooldown = config?.burstCooldown ?? BURST_COOLDOWN;
    this.fileWindows = new Map();
    this.lastBurstTime = new Map();
    this.burstCounts = new Map([
      ['low', 0],
      ['medium', 0],
      ['high', 0],
    ]);
  }

  /**
   * Set the current session ID for event logging
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Start monitoring document changes
   */
  start(): void {
    if (this._running) {
      return;
    }

    this._running = true;

    // Listen for text document changes
    this.disposable = vscode.workspace.onDidChangeTextDocument((e) => {
      if (this._running) {
        this.handleDocumentChange(e);
      }
    });
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this._running = false;
    if (this.disposable) {
      this.disposable.dispose();
      this.disposable = null;
    }
  }

  /**
   * Get burst summary
   */
  getSummary(): BurstSummary {
    return {
      total_count:
        (this.burstCounts.get('low') ?? 0) +
        (this.burstCounts.get('medium') ?? 0) +
        (this.burstCounts.get('high') ?? 0),
      by_severity: {
        low: this.burstCounts.get('low') ?? 0,
        medium: this.burstCounts.get('medium') ?? 0,
        high: this.burstCounts.get('high') ?? 0,
      },
    };
  }

  /**
   * Reset burst statistics
   */
  reset(): void {
    this.fileWindows.clear();
    this.lastBurstTime.clear();
    this.burstCounts.set('low', 0);
    this.burstCounts.set('medium', 0);
    this.burstCounts.set('high', 0);
  }

  /**
   * Handle a text document change event
   */
  private handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    if (!event.document.uri.scheme.startsWith('file')) {
      return; // Only track real files
    }

    const filePath = event.document.uri.fsPath;
    const now = Date.now();

    // Calculate changes from all content changes in this event
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    let totalCharsChanged = 0;

    for (const change of event.contentChanges) {
      const { linesAdded, linesRemoved, charsChanged } = this.computeChangeStats(
        change,
        event.document
      );
      totalLinesAdded += linesAdded;
      totalLinesRemoved += linesRemoved;
      totalCharsChanged += charsChanged;
    }

    // Ignore tiny edits (typos, etc.)
    if (totalCharsChanged < this.minEditSize) {
      return;
    }

    // Add to rolling window
    this.addToWindow(filePath, {
      timestamp: now,
      linesAdded: totalLinesAdded,
      linesRemoved: totalLinesRemoved,
      charsChanged: totalCharsChanged,
      filePath,
    });

    // Check for burst
    this.checkForBurst(filePath, now);
  }

  /**
   * Compute change statistics from a TextDocumentContentChangeEvent
   */
  private computeChangeStats(
    change: vscode.TextDocumentContentChangeEvent,
    document: vscode.TextDocument
  ): { linesAdded: number; linesRemoved: number; charsChanged: number } {
    // Count newlines in added text to determine lines added
    const linesAdded = (change.text.match(/\n/g) || []).length + 1;

    // For removed text, count newlines in the range
    const range = change.range;
    const linesRemoved = range.end.line - range.start.line;

    // Character change: added length + removed length
    const charsAdded = change.text.length;
    const charsRemoved = range.end.character - range.start.character +
      (linesRemoved > 0 ? document.lineAt(range.start.line).text.length - range.start.character : 0) +
      (linesRemoved > 1
        ? // Approximate: full lines between start and end
          Array.from({ length: linesRemoved - 1 }, (_, i) =>
            document.lineAt(range.start.line + i + 1).text.length + 1 // +1 for newline
          ).reduce((a, b) => a + b, 0)
        : 0);

    return {
      linesAdded,
      linesRemoved: Math.max(0, linesRemoved),
      charsChanged: charsAdded + Math.max(0, charsRemoved),
    };
  }

  /**
   * Add an edit event to the rolling window for a file
   */
  private addToWindow(filePath: string, event: EditEvent): void {
    const now = event.timestamp;
    let window = this.fileWindows.get(filePath);

    if (!window) {
      window = {
        filePath,
        events: [],
        windowStart: now - this.thresholds.windowMs,
      };
      this.fileWindows.set(filePath, window);
    }

    // Add new event
    window.events.push(event);

    // Prune old events outside the window
    const cutoff = now - this.thresholds.windowMs;
    window.events = window.events.filter((e) => e.timestamp >= cutoff);
    window.windowStart = cutoff;

    // Clean up empty windows
    if (window.events.length === 0) {
      this.fileWindows.delete(filePath);
    }
  }

  /**
   * Check if a burst has occurred for the given file
   */
  private checkForBurst(filePath: string, now: number): void {
    const window = this.fileWindows.get(filePath);
    if (!window || window.events.length < 2) {
      return; // Not enough data for a burst
    }

    // Check cooldown
    const lastBurst = this.lastBurstTime.get(filePath) ?? 0;
    if (now - lastBurst < this.burstCooldown) {
      return; // Still in cooldown
    }

    // Aggregate window statistics
    let editCount = 0;
    let charCount = 0;
    let windowDuration = 0;

    if (window.events.length > 0) {
      const oldest = window.events[0].timestamp;
      const newest = window.events[window.events.length - 1].timestamp;
      windowDuration = newest - oldest;

      for (const event of window.events) {
        editCount++;
        charCount += event.charsChanged;
      }
    }

    // Classify severity
    const severity = this.classifySeverity(editCount, charCount, windowDuration);

    if (severity) {
      this.emitBurstFlag(filePath, severity, editCount, charCount, windowDuration || this.thresholds.windowMs);
      this.lastBurstTime.set(filePath, now);
    }
  }

  /**
   * Classify burst severity based on thresholds
   */
  private classifySeverity(
    editCount: number,
    charCount: number,
    windowDuration: number
  ): BurstSeverity | null {
    // Scale thresholds based on actual window duration vs configured window
    const durationFactor = this.thresholds.windowMs / Math.max(windowDuration, 1);
    const scaledEditThreshold = (threshold: number) => Math.ceil(threshold * durationFactor);
    const scaledCharThreshold = (threshold: number) => Math.ceil(threshold * durationFactor);

    // Check high severity first
    if (
      editCount >= scaledEditThreshold(this.thresholds.highEditThreshold) &&
      charCount >= scaledCharThreshold(this.thresholds.highCharThreshold)
    ) {
      return 'high';
    }

    // Check medium severity
    if (
      editCount >= scaledEditThreshold(this.thresholds.mediumEditThreshold) &&
      charCount >= scaledCharThreshold(this.thresholds.mediumCharThreshold)
    ) {
      return 'medium';
    }

    // Check low severity
    if (
      editCount >= scaledEditThreshold(this.thresholds.lowEditThreshold) &&
      charCount >= scaledCharThreshold(this.thresholds.lowCharThreshold)
    ) {
      return 'low';
    }

    return null;
  }

  /**
   * Emit a BURST_FLAG event
   */
  private async emitBurstFlag(
    filePath: string,
    severity: BurstSeverity,
    editCount: number,
    charCount: number,
    windowMs: number
  ): Promise<void> {
    if (!this.sessionId) {
      return; // Cannot emit without session
    }

    const payload: BurstFlagPayload = {
      severity,
      edit_count: editCount,
      char_count: charCount,
      window_ms: windowMs,
      file_path: filePath,
    };

    try {
      await this.eventLog.appendEvent('BURST_FLAG', payload, this.sessionId);

      // Update statistics
      const current = this.burstCounts.get(severity) ?? 0;
      this.burstCounts.set(severity, current + 1);
    } catch (error) {
      // Log error but don't crash - best-effort tracking
      console.error('Failed to emit BURST_FLAG event:', error);
    }
  }
}

/**
 * Create a burst detector with default configuration
 */
export function createBurstDetector(eventLog: IEventLog, config?: BurstDetectorConfig): IBurstDetector {
  return new BurstDetector(eventLog, config);
}
