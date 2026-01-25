/**
 * Time Tracking Service
 *
 * Tracks focused time, active time, and session lifecycle.
 * Emits SESSION_START, SESSION_END, and TIME_TICK events.
 *
 * Agent 1 Implementation:
 * - Focused time: VS Code window focused + assignment active
 * - Active time: focused + not idle (idle after idle_seconds, default 120)
 * - Sessions: start on activation, end on deactivate or explicit End Session,
 *             plus long-unfocus timeout (30m)
 */

import * as vscode from 'vscode';
import { IEventLog } from '../storage/eventLog';
import { generateId } from '../utils/hash';
import type {
  SessionStartPayload,
  SessionEndPayload,
  TimeTickPayload,
} from '../types/events';

/**
 * Configuration constants
 */
const DEFAULT_IDLE_SECONDS = 120; // 2 minutes of inactivity = idle
const UNFOCUS_TIMEOUT_SECONDS = 1800; // 30 minutes unfocused = session end
const TICK_INTERVAL_SECONDS = 10; // Emit TIME_TICK every 10 seconds
const IDLE_CHECK_INTERVAL_MS = 1000; // Check for idle every second

/**
 * Time statistics summary
 */
export interface TimeStats {
  total_focused_seconds: number;
  total_active_seconds: number;
  session_count: number;
}

/**
 * Time tracker configuration
 */
export interface TimeTrackerConfig {
  /** Seconds of inactivity before considered idle (default: 120) */
  idle_seconds?: number;
  /** Seconds of window unfocus before session ends (default: 1800) */
  unfocus_timeout_seconds?: number;
  /** Seconds between TIME_TICK events (default: 10) */
  tick_interval_seconds?: number;
}

/**
 * Time tracker interface
 */
export interface ITimeTracker {
  /** Initialize with workspace context (must be called before startSession) */
  init(workspaceName: string, gitRoot: string): void;
  /** Start tracking a new session */
  startSession(): Promise<void>;
  /** End the current session */
  endSession(reason: 'close' | 'idle_timeout' | 'manual'): Promise<void>;
  /** Get current session time stats */
  getCurrentStats(): TimeStats;
  /** Check if currently tracking */
  isActive(): boolean;
  /** Get current session ID */
  getSessionId(): string | null;
  /** Handle window state change (called by extension) */
  onWindowStateChanged(focused: boolean): void;
  /** Handle user activity (reset idle timer) */
  onUserActivity(): void;
  /** Dispose of resources */
  dispose(): void;
}

/**
 * Internal state for tracking time
 */
interface TrackingState {
  focused_seconds: number;
  active_seconds: number;
  is_focused: boolean;
  is_idle: boolean;
  last_activity_time: number; // timestamp
  session_start_time: number; // timestamp
  unfocus_start_time: number | null; // timestamp or null
}

/**
 * Time tracker implementation
 *
 * Focused time: Window is focused AND session is active
 * Active time: Focused AND not idle (user activity within idle_seconds)
 */
export class TimeTracker implements ITimeTracker {
  private _active = false;
  private _sessionId: string | null = null;
  private readonly eventLog: IEventLog;
  private readonly config: Required<TimeTrackerConfig>;

  // In-memory totals (reset each session)
  private state: TrackingState = {
    focused_seconds: 0,
    active_seconds: 0,
    is_focused: false,
    is_idle: false,
    last_activity_time: Date.now(),
    session_start_time: Date.now(),
    unfocus_start_time: null,
  };

  // Totals across all sessions (lifetime)
  private lifetimeStats: TimeStats = {
    total_focused_seconds: 0,
    total_active_seconds: 0,
    session_count: 0,
  };

  // Disposables
  private disposables: vscode.Disposable[] = [];

  // Timer references
  private tickTimer: NodeJS.Timeout | null = null;
  private idleCheckTimer: NodeJS.Timeout | null = null;
  private unfocusTimer: NodeJS.Timeout | null = null;

  // Workspace info for SESSION_START
  private workspaceName = '';
  private gitRoot = '';

  constructor(eventLog: IEventLog, config: TimeTrackerConfig = {}) {
    this.eventLog = eventLog;
    this.config = {
      idle_seconds: config.idle_seconds ?? DEFAULT_IDLE_SECONDS,
      unfocus_timeout_seconds: config.unfocus_timeout_seconds ?? UNFOCUS_TIMEOUT_SECONDS,
      tick_interval_seconds: config.tick_interval_seconds ?? TICK_INTERVAL_SECONDS,
    };
  }

  /**
   * Initialize with workspace context
   * Must be called before startSession()
   */
  init(workspaceName: string, gitRoot: string): void {
    this.workspaceName = workspaceName;
    this.gitRoot = gitRoot;
  }

  /**
   * Start a new tracking session
   * Emits SESSION_START event
   */
  async startSession(): Promise<void> {
    if (this._active) {
      return; // Already active
    }

    // Generate new session ID
    this._sessionId = generateId();
    this._active = true;

    // Reset session state
    const now = Date.now();
    this.state = {
      focused_seconds: 0,
      active_seconds: 0,
      is_focused: true, // Assume focused when starting
      is_idle: false,
      last_activity_time: now,
      session_start_time: now,
      unfocus_start_time: null,
    };

    // Emit SESSION_START event
    const payload: SessionStartPayload = {
      workspace_name: this.workspaceName || 'unknown',
      git_root: this.gitRoot || '',
    };

    await this.eventLog.appendEvent('SESSION_START', payload, this._sessionId);

    // Start tracking timers
    this.startTickTimer();
    this.startIdleCheckTimer();

    // Increment session count
    this.lifetimeStats.session_count++;
  }

  /**
   * End the current session
   * Emits SESSION_END event with final totals
   */
  async endSession(reason: 'close' | 'idle_timeout' | 'manual'): Promise<void> {
    if (!this._active) {
      return; // Not active
    }

    // Clear all timers
    this.clearTimers();

    // Final time tick to capture any remaining time
    this.tick();

    // Emit SESSION_END event
    const payload: SessionEndPayload = {
      focused_seconds: this.state.focused_seconds,
      active_seconds: this.state.active_seconds,
      reason,
    };

    await this.eventLog.appendEvent('SESSION_END', payload, this._sessionId!);

    // Update lifetime totals
    this.lifetimeStats.total_focused_seconds += this.state.focused_seconds;
    this.lifetimeStats.total_active_seconds += this.state.active_seconds;

    // Mark inactive
    this._active = false;
    this._sessionId = null;
  }

  /**
   * Get current session time stats
   */
  getCurrentStats(): TimeStats {
    if (!this._active) {
      return this.lifetimeStats;
    }

    return {
      total_focused_seconds: this.lifetimeStats.total_focused_seconds + this.state.focused_seconds,
      total_active_seconds: this.lifetimeStats.total_active_seconds + this.state.active_seconds,
      session_count: this.lifetimeStats.session_count,
    };
  }

  /**
   * Check if currently tracking
   */
  isActive(): boolean {
    return this._active;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Handle window state changes
   * Called when VS Code window gains or loses focus
   */
  onWindowStateChanged(focused: boolean): void {
    if (!this._active) {
      return;
    }

    this.state.is_focused = focused;

    if (focused) {
      // Window regained focus
      this.state.unfocus_start_time = null;
      this.clearUnfocusTimer();
      this.onUserActivity(); // Reset idle timer
    } else {
      // Window lost focus - start unfocus timeout
      this.state.unfocus_start_time = Date.now();
      this.startUnfocusTimer();
    }
  }

  /**
   * Handle user activity
   * Resets the idle timer
   */
  onUserActivity(): void {
    if (!this._active) {
      return;
    }

    this.state.last_activity_time = Date.now();

    if (this.state.is_idle) {
      // Was idle, now active again
      this.state.is_idle = false;
    }
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearTimers();
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }

  /**
   * Start the periodic time tick timer
   */
  private startTickTimer(): void {
    this.tickTimer = setInterval(() => {
      this.tick();
    }, this.config.tick_interval_seconds * 1000);
  }

  /**
   * Start the idle detection timer
   */
  private startIdleCheckTimer(): void {
    this.idleCheckTimer = setInterval(() => {
      this.checkIdle();
    }, IDLE_CHECK_INTERVAL_MS);
  }

  /**
   * Start the unfocus timeout timer
   */
  private startUnfocusTimer(): void {
    this.clearUnfocusTimer();

    this.unfocusTimer = setTimeout(async () => {
      if (this._active && !this.state.is_focused) {
        // Session ended due to long unfocus
        await this.endSession('idle_timeout');
      }
    }, this.config.unfocus_timeout_seconds * 1000);
  }

  /**
   * Clear the unfocus timer
   */
  private clearUnfocusTimer(): void {
    if (this.unfocusTimer) {
      clearTimeout(this.unfocusTimer);
      this.unfocusTimer = null;
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
    this.clearUnfocusTimer();
  }

  /**
   * Check if user is idle and update state
   */
  private checkIdle(): void {
    if (!this._active) {
      return;
    }

    const now = Date.now();
    const idleTime = (now - this.state.last_activity_time) / 1000;

    if (idleTime >= this.config.idle_seconds && !this.state.is_idle) {
      // User became idle
      this.state.is_idle = true;
    }
  }

  /**
   * Time tick - accumulates time and emits TIME_TICK event
   * Called periodically by the tick timer
   */
  private tick(): void {
    if (!this._active) {
      return;
    }

    // Calculate deltas for this tick
    const focused_delta = this.state.is_focused ? this.config.tick_interval_seconds : 0;
    const active_delta = (this.state.is_focused && !this.state.is_idle) ? this.config.tick_interval_seconds : 0;

    // Only emit and accumulate if there's focused time
    if (focused_delta > 0) {
      this.state.focused_seconds += focused_delta;
      this.state.active_seconds += active_delta;

      // Emit TIME_TICK event
      const payload: TimeTickPayload = {
        focused_delta_seconds: focused_delta,
        active_delta_seconds: active_delta,
      };

      this.eventLog.appendEvent('TIME_TICK', payload, this._sessionId!).catch(err => {
        // Log error but don't throw - time tracking should be resilient
        console.error('Failed to emit TIME_TICK event:', err);
      });
    }
  }
}
