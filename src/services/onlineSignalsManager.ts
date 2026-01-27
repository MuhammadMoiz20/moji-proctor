/**
 * Online Signals Manager
 *
 * Coordinates all online signals mode services:
 * - Authentication
 * - Device keypair management
 * - Signal conversion and batching
 *
 * Integrates with the extension to upload signals when enabled.
 */

import * as vscode from 'vscode';
import { EventEnvelope } from '../types/events';
import { SignalEnvelope } from '../types/signals';
import { OnlineSignalsConfig } from '../types/config';
import { AuthService, createAuthService } from './authService';
import { DeviceKeyManager } from './deviceKeyManager';
import { SignalConverter, createSignalConverter } from './signalConverter';
import { SignalBatcher, createDefaultBatcherOptions } from './signalBatcher';
import { readAssignmentMetadata } from '../utils/assignmentLoader';
import { findGitRoot } from '../utils/gitRoot';
import { execSync } from 'child_process';
import { httpClient, HttpError } from '../utils/httpClient';
import { generateId } from '../utils/hash';

/**
 * Context for signal generation
 */
interface SignalContext {
  assignmentId: string;
  courseId?: string;
  commitSha?: string;
  repoIdentifier?: string;
}

/**
 * Online Signals Manager
 *
 * Main service for online signals mode.
 */
export class OnlineSignalsManager {
  private authService: AuthService;
  private deviceKeyManager: DeviceKeyManager;
  private signalConverter: SignalConverter;
  private signalBatcher: SignalBatcher | null = null;
  private signalContext: SignalContext | null = null;

  private isStarted: boolean = false;
  private _isOnline: boolean = true;
  private networkCheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceRoot: string,
    private readonly config: OnlineSignalsConfig
  ) {
    // Initialize services - wrap VS Code SecretStorage to match expected interface
    const secretStorage = {
      get: (key: string) => Promise.resolve(context.secrets.get(key)),
      store: (key: string, value: string) => Promise.resolve(context.secrets.store(key, value)),
      delete: (key: string) => Promise.resolve(context.secrets.delete(key)),
    };

    this.deviceKeyManager = new DeviceKeyManager(secretStorage);
    this.authService = createAuthService(context, config.server_url);
    this.signalConverter = createSignalConverter(config);

    // Monitor network status
    this.startNetworkMonitoring();
  }

  /**
   * Check if online signals mode is enabled
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Check if currently online
   */
  get isOnline(): boolean {
    return this._isOnline;
  }

  /**
   * Start the online signals manager
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Get assignment metadata
    const gitRoot = findGitRoot(this.workspaceRoot);
    const assignment = await readAssignmentMetadata(gitRoot);
    if (!assignment) {
      throw new Error('No assignment metadata found');
    }

    // Initialize device key manager
    await this.deviceKeyManager.initialize();

    // Build signal context
    this.signalContext = await this.buildSignalContext(gitRoot, assignment.assignment_id);

    // Check authentication (async now)
    const authStatus = await this.authService.getStatus();
    if (!authStatus.authenticated) {
      // Not authenticated - signal batcher will be paused
      vscode.window.showInformationMessage(
        'Moji Proctor: Online Signals enabled. Sign in to upload signals.',
        'Sign In'
      ).then(result => {
        if (result === 'Sign In') {
          vscode.commands.executeCommand('mojiProctor.signIn');
        }
      });
    }

    // Create and start signal batcher
    const batcherOptions = createDefaultBatcherOptions(this.config);
    this.signalBatcher = new SignalBatcher(
      this.context,
      this.deviceKeyManager,
      this.config,
      batcherOptions,
      () => this.authService.getAccessToken() // Token provider
    );

    // Listen for batcher events
    this.signalBatcher.on('uploadFailed', (data: { error: string; retryCount: number }) => {
      console.error('Signal upload failed:', data.error, 'retry:', data.retryCount);
      if (data.retryCount >= 3) {
        vscode.window.showWarningMessage(
          `Moji Proctor: Signal upload failing (${data.error}). Will retry automatically.`
        );
      }
    });

    this.signalBatcher.on('authError', async (data: { status: number; message: string }) => {
      console.error('Signal upload auth error:', data.status, data.message);
      
      // Clear the invalid tokens so we don't keep trying with them
      // This forces a fresh sign-in
      try {
        await this.authService.signOut();
      } catch (e) {
        console.error('Failed to sign out after auth error:', e);
      }
      
      vscode.window.showErrorMessage(
        `Moji Proctor: Authentication error (${data.status}). Your session has expired. Please sign in again.`,
        'Sign In'
      ).then(result => {
        if (result === 'Sign In') {
          vscode.commands.executeCommand('mojiProctor.signIn');
        }
      });
    });

    this.signalBatcher.on('uploaded', (data: { uploaded: number; rejected: number; remaining: number }) => {
      if (data.uploaded > 0) {
        console.log(`Uploaded ${data.uploaded} signals, ${data.remaining} remaining`);
      }
    });

    this.signalBatcher.start(this.signalContext.assignmentId);

    // Resume or pause based on authentication status
    if (authStatus.authenticated) {
      // User is authenticated - ensure batcher is resumed (in case it was persisted as paused)
      this.signalBatcher.resume();
    } else {
      this.signalBatcher.pause();
    }

    // Register event handlers
    this.registerEventHandlers();

    this.isStarted = true;
  }

  /**
   * Stop the online signals manager
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    if (this.signalBatcher) {
      await this.signalBatcher.stop();
    }

    this.isStarted = false;
  }

  /**
   * Process an event from the local event log
   *
   * @param event - Event to process
   */
  async processEvent(event: EventEnvelope): Promise<void> {
    if (!this.isStarted || !this.signalBatcher) {
      return;
    }

    // Check if event should be uploaded
    if (!this.signalConverter.shouldUpload(event.type)) {
      return;
    }

    // Convert event to signal
    if (!this.signalContext) {
      return;
    }

    const signal = this.signalConverter.convertToSignal(event, this.signalContext);
    if (signal) {
      await this.signalBatcher.addSignal(signal);
    }
  }

  /**
   * Send a STATUS_UPDATE signal with current aggregated stats
   *
   * @param stats - Current stats from the report generator
   */
  async sendStatusUpdate(stats: {
    total_focused_seconds: number;
    total_active_seconds: number;
    session_count: number;
    burst_count: number;
    burst_by_severity: { low: number; medium: number; high: number };
    checkpoint_count: number;
    unverified_change_count: number;
    integrity_passed: boolean;
    session_active: boolean;
  }): Promise<void> {
    if (!this.isStarted || !this.signalBatcher || !this.signalContext) {
      return;
    }

    const signal: SignalEnvelope = {
      event_id: generateId(),
      ts: new Date().toISOString(),
      session_id: generateId(), // Use a unique ID for status updates
      type: 'STATUS_UPDATE',
      payload: stats,
      assignment_id: this.signalContext.assignmentId,
      course_id: this.signalContext.courseId,
      commit_sha: this.signalContext.commitSha,
      repo_identifier: this.signalContext.repoIdentifier,
    };

    await this.signalBatcher.addSignal(signal);
    // Force an immediate flush to ensure status is sent promptly
    await this.signalBatcher.flushAll({ force: true });
  }

  /**
   * Get current authentication status
   */
  getAuthStatus() {
    return this.authService.getStatus();
  }

  /**
   * Sign in to the server
   */
  async signIn(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Signing in to Moji Proctor...',
          cancellable: true,
        },
        async (progress, token) => {
          const user = await this.authService.signIn((message) => {
            progress.report({ message });
          });

          if (this.signalBatcher) {
            // Force resume - clear any paused state from previous auth errors
            console.log('[OnlineSignalsManager] Sign-in successful, resuming batcher');
            this.signalBatcher.resume();
            // Force an immediate flush to test connection
            this.signalBatcher.flush().catch(err => {
              console.error('[OnlineSignalsManager] Initial flush after sign-in failed:', err);
            });
          }

          vscode.window.showInformationMessage(`Signed in as ${user.login}. Signals will now upload.`);
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Sign in failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clear any paused state and resume uploads (debug command)
   */
  async forceResume(): Promise<void> {
    if (this.signalBatcher) {
      console.log('[OnlineSignalsManager] Force resuming batcher');
      this.signalBatcher.resume();
      const result = await this.signalBatcher.flushAll({ force: true });
      console.log('[OnlineSignalsManager] Force flush result:', result);
      return;
    }
    console.log('[OnlineSignalsManager] No batcher to resume');
  }

  /**
   * Sign out from the server
   */
  async signOut(): Promise<void> {
    await this.authService.signOut();
    if (this.signalBatcher) {
      this.signalBatcher.pause();
    }
    vscode.window.showInformationMessage('Signed out from Moji Proctor');
  }

  /**
   * Manually flush queued signals
   */
  async flushSignals(): Promise<{ uploaded: number; rejected: number; remaining: number }> {
    if (!this.signalBatcher) {
      return { uploaded: 0, rejected: 0, remaining: 0 };
    }
    return this.signalBatcher.flushAll({ force: true });
  }

  /**
   * Get upload statistics
   */
  getStats() {
    if (!this.signalBatcher) {
      return { queueSize: 0, isPaused: false };
    }
    return {
      queueSize: this.signalBatcher.getQueueSize(),
      isPaused: this.signalBatcher.isPaused(),
      pauseReason: this.signalBatcher.getPauseReason(),
    };
  }

  /**
   * Build signal context from git and assignment info
   */
  private async buildSignalContext(
    gitRoot: string,
    assignmentId: string
  ): Promise<SignalContext> {
    const context: SignalContext = {
      assignmentId,
    };

    // Try to get commit SHA
    try {
      const commitSha = execSync('git rev-parse HEAD', {
        cwd: gitRoot,
        encoding: 'utf8',
      }).trim();
      context.commitSha = commitSha;
    } catch {
      // Not a git repo or no commits
    }

    // Try to get remote URL for repo identifier
    try {
      const remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: gitRoot,
        encoding: 'utf8',
      }).trim();
      // Extract repo name from URL
      const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/\.]+)/);
      if (match) {
        context.repoIdentifier = match[1];
      }
    } catch {
      // No remote configured
    }

    return context;
  }

  /**
   * Register event handlers
   */
  private registerEventHandlers(): void {
    // Listen for sign in command
    const signInDisposable = vscode.commands.registerCommand(
      'mojiProctor.signIn',
      () => this.signIn()
    );

    // Listen for sign out command
    const signOutDisposable = vscode.commands.registerCommand(
      'mojiProctor.signOut',
      () => this.signOut()
    );

    // Force resume command (debug/recovery)
    const forceResumeDisposable = vscode.commands.registerCommand(
      'mojiProctor.forceResume',
      async () => {
        const authStatus = await this.getAuthStatus();
        if (!authStatus.authenticated) {
          vscode.window.showWarningMessage('Please sign in first before resuming uploads.');
          return;
        }
        await this.forceResume();
        const stats = this.getStats();
        vscode.window.showInformationMessage(
          `Batcher resumed. Queue: ${stats.queueSize} signals, Paused: ${stats.isPaused}`
        );
      }
    );

    // Auth service emits these commands; keep them registered to avoid unhandled rejections
    const signedInDisposable = vscode.commands.registerCommand(
      'mojiProctor.signedIn',
      async () => {
        if (!this.isStarted || !this.signalBatcher) {
          return;
        }
        console.log('[OnlineSignalsManager] signedIn event received, resuming batcher');
        this.signalBatcher.resume();
        await this.signalBatcher.flushAll({ force: true });
      }
    );

    const signedOutDisposable = vscode.commands.registerCommand(
      'mojiProctor.signedOut',
      () => {
        if (!this.isStarted || !this.signalBatcher) {
          return;
        }
        this.signalBatcher.pause();
      }
    );

    // Add to subscriptions
    this.context.subscriptions.push(
      signInDisposable,
      signOutDisposable,
      signedInDisposable,
      signedOutDisposable,
      forceResumeDisposable
    );
  }

  /**
   * Start monitoring network status
   */
  private startNetworkMonitoring(): void {
    // Clear existing timer if any
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
    }

    // Simple monitoring - pause batcher when offline
    this.networkCheckTimer = setInterval(() => {
      // Check if we can reach the server
      httpClient(`${this.config.server_url}/health`, {
        method: 'HEAD',
        timeout: 5000,
      })
        .then((response) => {
          if (response.ok && !this._isOnline) {
            this._isOnline = true;
            if (this.signalBatcher) {
              // Only resume if paused due to offline status, NOT due to auth error
              // Auth errors require user to re-authenticate
              const pauseReason = this.signalBatcher.getPauseReason();
              if (pauseReason === 'offline' || pauseReason === null) {
                console.log('[OnlineSignalsManager] Network restored, resuming batcher');
                this.signalBatcher.resume();
              } else {
                console.log('[OnlineSignalsManager] Network restored but batcher paused for:', pauseReason);
              }
            }
          }
        })
        .catch(() => {
          if (this._isOnline) {
            this._isOnline = false;
            if (this.signalBatcher) {
              // Only pause if not already paused for a more serious reason (auth_error)
              const pauseReason = this.signalBatcher.getPauseReason();
              if (!pauseReason || pauseReason === 'offline') {
                this.signalBatcher.pause('offline');
              }
            }
          }
        });
    }, 60000); // Check every minute
  }

  /**
   * Cleanup
   */
  dispose(): void {
    // Clear network check timer
    if (this.networkCheckTimer) {
      clearInterval(this.networkCheckTimer);
      this.networkCheckTimer = null;
    }
    this.stop();
    this.authService.dispose();
  }
}

/**
 * Create an online signals manager
 *
 * @param context - Extension context
 * @param workspaceRoot - Workspace root path
 * @param config - Online signals config
 * @returns Online signals manager instance
 */
export function createOnlineSignalsManager(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  config: OnlineSignalsConfig
): OnlineSignalsManager {
  return new OnlineSignalsManager(context, workspaceRoot, config);
}
