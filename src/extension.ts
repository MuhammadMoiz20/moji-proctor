/**
 * Moji Proctor Extension
 *
 * VS Code extension for verified coursework tracking.
 * Produces tamper-evident local artifacts under .verified/
 *
 * Extension activation and service wiring.
 */

import * as vscode from 'vscode';
import {
  EventLog,
  IEventLog,
} from './storage/eventLog';
import {
  CheckpointStore,
  ICheckpointStore,
} from './storage/checkpointStore';
import {
  ReportWriter,
  IReportWriter,
} from './storage/reportWriter';
import {
  TimeTracker,
  ITimeTracker,
} from './services/timeTracker';
import {
  BurstDetector,
  IBurstDetector,
} from './services/burstDetector';
import {
  CheckpointService,
  ICheckpointService,
} from './services/checkpointService';
import {
  IntegrityService,
  IIntegrityService,
} from './services/integrityService';
import {
  ReportGenerator,
  IReportGenerator,
} from './services/reportGenerator';
import {
  createDefaultMatcher,
  IgnoreMatcher,
} from './utils/ignore';
import {
  findGitRoot,
  GitRootNotFoundError,
} from './utils/gitRoot';
import { readAssignmentMetadata } from './utils/assignmentLoader';
import { readConfig } from './utils/configLoader';
import { OnlineSignalsManager, createOnlineSignalsManager } from './services/onlineSignalsManager';
import { EventEnvelope } from './types/events';

/**
 * Extension context
 */
let extensionContext: vscode.ExtensionContext;

/**
 * Service instances
 */
let eventLog: IEventLog;
let checkpointStore: ICheckpointStore;
let reportWriter: IReportWriter;
let ignoreMatcher: IgnoreMatcher;
let timeTracker: ITimeTracker;
let burstDetector: IBurstDetector;
let checkpointService: ICheckpointService;
let integrityService: IIntegrityService;
let reportGenerator: IReportGenerator;
let onlineSignalsManager: OnlineSignalsManager | null = null;

/**
 * Git root path for current workspace
 */
let gitRoot: string | null = null;

/**
 * Current assignment metadata
 */
let currentAssignment: { assignment_id: string; assignment_name: string } | null = null;

/**
 * Status bar item
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * Periodic report timer
 */
let periodicReportTimer: NodeJS.Timeout | null = null;

/**
 * Periodic report interval in milliseconds (1 minute)
 */
const PERIODIC_REPORT_INTERVAL_MS = 60 * 1000;

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;

  // Create status bar immediately so it appears right away
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'Moji Proctor Status';
  statusBarItem.text = '$(loading~spin) Moji Proctor: Loading...';
  statusBarItem.command = 'mojiProctor.showStatus';
  statusBarItem.tooltip = 'Moji Proctor is initializing...';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // Try to initialize for current workspace
  await initializeExtension();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.generateReport', async () => {
      await generateReportCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.showSummary', async () => {
      await showSummaryCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.showStatus', async () => {
      await showStatusCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.endSession', async () => {
      await endSessionCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.flushSignals', async () => {
      await flushSignalsCommand();
    })
  );

  // Watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await initializeExtension();
    })
  );
}

/**
 * Initialize extension services for current workspace
 */
async function initializeExtension(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    updateStatusBar('No workspace', 90);
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Detect git root
  try {
    gitRoot = findGitRoot(workspaceRoot);
  } catch (e) {
    if (e instanceof GitRootNotFoundError) {
      updateStatusBar('Not a git repo', 90);
      return;
    }
    throw e;
  }

  // Read config file (optional)
  const config = await readConfig(workspaceRoot);

  // Check for assignment metadata
  const assignment = await readAssignmentMetadata(gitRoot);
  if (!assignment) {
    updateStatusBar('No assignment', 90);
    return;
  }

  // Store current assignment info for tooltip
  currentAssignment = {
    assignment_id: assignment.assignment_id,
    assignment_name: assignment.assignment_name,
  };

  // Get hide folder setting from assignment config (default: true)
  const hideVerifiedFolder = assignment.hide_verified_folder !== false;

  // Initialize services
  eventLog = new EventLog(gitRoot);
  checkpointStore = new CheckpointStore(gitRoot);
  reportWriter = new ReportWriter(gitRoot, hideVerifiedFolder);
  ignoreMatcher = createDefaultMatcher();

  // Create online signals manager if enabled (before time tracker/burst detector)
  if (config.online_signals?.enabled) {
    const validation = validateOnlineSignalsConfig(config);
    if (!validation.valid) {
      vscode.window.showErrorMessage(
        `Online signals config error: ${validation.error}`
      );
    } else {
      try {
        onlineSignalsManager = createOnlineSignalsManager(
          extensionContext,
          workspaceRoot,
          config.online_signals
        );
        await onlineSignalsManager.start();

        // Wrap eventLog to forward events
        eventLog = createForwardingEventLog(eventLog, onlineSignalsManager);
      } catch (error) {
        console.error('Failed to start online signals manager:', error);
        onlineSignalsManager = null;
      }
    }
  }

  timeTracker = new TimeTracker(eventLog);

  // Convert burst thresholds from config format to BurstDetector format
  // Config uses "edits per minute", BurstDetector uses "edits per window"
  const burstConfig = config.burst_thresholds
    ? {
        thresholds: {
          windowMs: config.burst_thresholds.window_ms || 10000,
          lowEditThreshold: Math.ceil((config.burst_thresholds.low_edits_per_min || 20) * (config.burst_thresholds.window_ms || 10000) / 60000),
          mediumEditThreshold: Math.ceil((config.burst_thresholds.medium_edits_per_min || 40) * (config.burst_thresholds.window_ms || 10000) / 60000),
          highEditThreshold: Math.ceil((config.burst_thresholds.high_edits_per_min || 60) * (config.burst_thresholds.window_ms || 10000) / 60000),
          lowCharThreshold: 100,
          mediumCharThreshold: 500,
          highCharThreshold: 1000,
        },
      }
    : undefined;

  burstDetector = new BurstDetector(eventLog, burstConfig);
  checkpointService = new CheckpointService(
    eventLog,
    checkpointStore,
    ignoreMatcher,
    gitRoot
  );
  integrityService = new IntegrityService(eventLog, checkpointStore, gitRoot);
  reportGenerator = new ReportGenerator(
    eventLog,
    checkpointStore,
    reportWriter,
    integrityService,
    assignment.assignment_id
  );

  // Initialize time tracker with workspace context
  const workspaceName = workspaceFolder.name;
  timeTracker.init(workspaceName, gitRoot);

  // Start session
  await timeTracker.startSession();

  // Set session ID on services that need it
  const sessionId = timeTracker.getSessionId();
  if (sessionId) {
    (burstDetector as BurstDetector).setSessionId(sessionId);
    (reportGenerator as ReportGenerator).setSessionId(sessionId);

    // Check for unverified changes at session start
    await checkpointService.detectUnverifiedChanges(sessionId);
  }
  burstDetector.start();

  if (!onlineSignalsManager) {
    updateStatusBar('Moji Proctor: Active', 100);
  }

  // Start periodic report generation timer
  startPeriodicReportTimer();

  // Register window state change handlers for time tracking
  extensionContext.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (timeTracker) {
        timeTracker.onWindowStateChanged(e.focused);
        if (e.focused) {
          if (onlineSignalsManager) {
            updateStatusBarWithOnlineStatus('Moji Proctor: Active', onlineSignalsManager.isOnline);
          } else {
            updateStatusBar('Moji Proctor: Active', 100);
          }
        } else {
          if (onlineSignalsManager) {
            updateStatusBarWithOnlineStatus('Moji Proctor: Unfocused', false);
          } else {
            updateStatusBar('Moji Proctor: Unfocused', 100);
          }
        }
      }
    })
  );

  // Register user activity handlers for idle detection
  const trackActivity = () => {
    if (timeTracker) {
      timeTracker.onUserActivity();
    }
  };

  extensionContext.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(trackActivity)
  );
  extensionContext.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(trackActivity)
  );

  // Register cleanup on deactivate
  extensionContext.subscriptions.push(
    new vscode.Disposable(async () => {
      // Stop periodic report timer
      stopPeriodicReportTimer();

      // Stop online signals manager
      if (onlineSignalsManager) {
        await onlineSignalsManager.stop();
      }

      // Create checkpoint before session ends
      const sessionId = timeTracker.getSessionId();
      if (sessionId) {
        await checkpointService.createCheckpoint({ sessionId, emitEvents: true });
      }
      await timeTracker.endSession('close').catch(console.error);
      burstDetector.stop();
    })
  );
}

/**
 * Create an event log forwarder that forwards events to online signals
 */
function createForwardingEventLog(originalEventLog: IEventLog, manager: OnlineSignalsManager): IEventLog {
  // Store original appendEvent
  const originalAppendEvent = originalEventLog.appendEvent.bind(originalEventLog);

  // Create wrapper that forwards events
  return new Proxy(originalEventLog, {
    get(target, prop) {
      if (prop === 'appendEvent') {
        return async function (type: any, payload: any, sessionId: string) {
          // Call original
          const event = await originalAppendEvent(type, payload, sessionId);

          // Forward to online signals manager
          if (event) {
            try {
              await manager.processEvent(event);
            } catch (err) {
              console.error('Failed to forward event to online signals:', err);
            }
          }

          return event;
        };
      }
      return (target as any)[prop];
    }
  });
}

/**
 * Validate online signals configuration
 */
function validateOnlineSignalsConfig(config: any): { valid: boolean; error?: string } {
  if (!config.online_signals?.enabled) {
    return { valid: true };
  }

  const { server_url } = config.online_signals;

  if (!server_url || typeof server_url !== 'string') {
    return { valid: false, error: 'online_signals.server_url is required when enabled' };
  }

  try {
    const url = new URL(server_url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, error: 'server_url must use https:// or http://' };
    }
  } catch {
    return { valid: false, error: 'server_url must be a valid URL' };
  }

  return { valid: true };
}

/**
 * Update status bar with online indicator
 */
function updateStatusBarWithOnlineStatus(text: string, isOnline: boolean): void {
  if (!statusBarItem) {
    return;
  }
  const indicator = isOnline ? '🟢' : '🔴';
  statusBarItem.text = `${indicator} ${text}`;
  statusBarItem.command = 'mojiProctor.showStatus';
  updateStatusBarTooltip();
  statusBarItem.show();
}

/**
 * Build rich tooltip for status bar
 */
async function buildStatusBarTooltip(): Promise<vscode.MarkdownString> {
  const tooltip = new vscode.MarkdownString('', true);
  tooltip.isTrusted = {
    enabledCommands: [
      'mojiProctor.signIn',
      'mojiProctor.signOut',
      'mojiProctor.generateReport',
      'mojiProctor.showStatus',
      'mojiProctor.showSummary',
      'mojiProctor.endSession',
    ],
  };
  tooltip.supportHtml = true;

  // Header
  tooltip.appendMarkdown('## $(shield) Moji Proctor\n\n');

  // Assignment info
  if (currentAssignment) {
    tooltip.appendMarkdown(`**Assignment:** ${currentAssignment.assignment_name}\n\n`);
  }

  // Mode indicator
  if (onlineSignalsManager) {
    tooltip.appendMarkdown('**Mode:** $(cloud-upload) Online Signals\n\n');

    // Connection status
    const isOnline = onlineSignalsManager.isOnline;
    const connectionIcon = isOnline ? '$(pass-filled)' : '$(error)';
    const connectionText = isOnline ? 'Connected' : 'Offline';
    tooltip.appendMarkdown(`**Server:** ${connectionIcon} ${connectionText}\n\n`);

    // Auth status
    const authStatus = await onlineSignalsManager.getAuthStatus();
    if (authStatus.authenticated && authStatus.user) {
      tooltip.appendMarkdown(`**User:** $(account) ${authStatus.user.login}\n\n`);
    } else {
      tooltip.appendMarkdown('**User:** $(warning) Not signed in\n\n');
      tooltip.appendMarkdown('*⚠️ Signals will not upload until you sign in*\n\n');
    }

    // Queue status
    const stats = onlineSignalsManager.getStats();
    if (stats.isPaused) {
      tooltip.appendMarkdown(`**Queue:** $(debug-pause) Paused (${stats.queueSize} signals pending)\n\n`);
    } else if (stats.queueSize > 0) {
      tooltip.appendMarkdown(`**Queue:** $(sync) ${stats.queueSize} signals pending\n\n`);
    } else {
      tooltip.appendMarkdown('**Queue:** $(check) All signals uploaded\n\n');
    }
  } else {
    tooltip.appendMarkdown('**Mode:** $(file) Local Only\n\n');
  }

  // Session info
  if (timeTracker && timeTracker.isActive()) {
    const sessionStats = timeTracker.getCurrentStats();
    const focusedMins = Math.floor(sessionStats.total_focused_seconds / 60);
    const activeMins = Math.floor(sessionStats.total_active_seconds / 60);
    tooltip.appendMarkdown('---\n\n');
    tooltip.appendMarkdown('### $(clock) Session\n\n');
    tooltip.appendMarkdown(`**Focused:** ${focusedMins}m | **Active:** ${activeMins}m\n\n`);
  }

  // Separator and actions
  tooltip.appendMarkdown('---\n\n');
  tooltip.appendMarkdown('### $(list-unordered) Actions\n\n');

  // Auth actions
  if (onlineSignalsManager) {
    const authStatus = await onlineSignalsManager.getAuthStatus();
    if (authStatus.authenticated) {
      tooltip.appendMarkdown('$(sign-out) [Sign Out](command:mojiProctor.signOut)\n\n');
    } else {
      tooltip.appendMarkdown('$(sign-in) [Sign In](command:mojiProctor.signIn)\n\n');
    }
  }

  // Common actions
  tooltip.appendMarkdown('$(file-text) [Generate Report](command:mojiProctor.generateReport)\n\n');
  tooltip.appendMarkdown('$(info) [Show Status](command:mojiProctor.showStatus)\n\n');
  tooltip.appendMarkdown('$(open-preview) [View Report](command:mojiProctor.showSummary)\n\n');

  if (timeTracker && timeTracker.isActive()) {
    tooltip.appendMarkdown('$(stop-circle) [End Session](command:mojiProctor.endSession)\n\n');
  }

  return tooltip;
}

/**
 * Update status bar tooltip (async update)
 */
function updateStatusBarTooltip(): void {
  if (!statusBarItem) {
    return;
  }

  // Build tooltip async and update when ready
  buildStatusBarTooltip().then((tooltip) => {
    if (statusBarItem) {
      statusBarItem.tooltip = tooltip;
    }
  }).catch(console.error);
}

/**
 * Generate report command
 */
async function generateReportCommand(): Promise<void> {
  if (!reportGenerator) {
    vscode.window.showWarningMessage(
      'Moji Proctor is not active for this workspace.'
    );
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Generating Moji Proctor report...',
        cancellable: false,
      },
      async () => {
        // Create checkpoint at report generation time
        const sessionId = timeTracker?.getSessionId();
        if (sessionId && checkpointService) {
          await checkpointService.createCheckpoint({ sessionId, emitEvents: true });
        }

        // Generate reports using the interface method
        await reportGenerator.generateReports();

        // Send status update to server if online signals enabled
        if (onlineSignalsManager && timeTracker) {
          // Generate JSON report again for status update
          const jsonReport = await reportGenerator.generateJsonReport();
          const statusPayload = {
            total_focused_seconds: jsonReport.time.total_focused_seconds,
            total_active_seconds: jsonReport.time.total_active_seconds,
            session_count: jsonReport.time.session_count,
            burst_count: jsonReport.bursts.total_count,
            burst_by_severity: jsonReport.bursts.by_severity,
            checkpoint_count: jsonReport.checkpoints.count,
            unverified_change_count: jsonReport.unverified_changes.length,
            integrity_passed: jsonReport.integrity.passed,
            session_active: timeTracker.isActive(),
          };

          await onlineSignalsManager.sendStatusUpdate(statusPayload);
        }
      }
    );

    vscode.window.showInformationMessage(
      'Report generated successfully! See .verified/report.json and .verified/report.md'
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to generate report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Show status command
 */
async function showStatusCommand(): Promise<void> {
  if (!timeTracker || !integrityService) {
    vscode.window.showInformationMessage('Moji Proctor: Not active');
    return;
  }

  const stats = timeTracker.getCurrentStats();
  const integrity = await integrityService.checkIntegrity();

  let message = `
Moji Proctor Status

Active: ${timeTracker.isActive()}
Sessions: ${stats.session_count}
Focused time: ${stats.total_focused_seconds}s
Active time: ${stats.total_active_seconds}s

Integrity: ${integrity.passed ? 'PASSED' : 'FAILED'}
${integrity.issues.length > 0 ? integrity.issues.map((i) => `- ${i.description}`).join('\n') : ''}
  `.trim();

  // Add online signals status if enabled
  if (onlineSignalsManager) {
    const authStatus = await onlineSignalsManager.getAuthStatus();
    const uploadStats = onlineSignalsManager.getStats();

    message += `

Online Signals: ${authStatus.authenticated ? `Connected as ${authStatus.user?.login}` : 'Not signed in (signals will not upload!)'}
Queue: ${uploadStats.queueSize} signals pending${uploadStats.isPaused ? ' (PAUSED)' : ''}
Server: ${onlineSignalsManager.isOnline ? '🟢 Online' : '🔴 Offline'}
    `.trim();

    if (!authStatus.authenticated) {
      message += '\n\n⚠️ Run "Moji Proctor: Sign In" to upload signals to the server.';
    }
  }

  vscode.window.showInformationMessage(message);
}

/**
 * Show summary command - opens report.md
 */
async function showSummaryCommand(): Promise<void> {
  if (!gitRoot) {
    vscode.window.showWarningMessage(
      'Moji Proctor is not active for this workspace.'
    );
    return;
  }

  const reportPath = require('path').join(gitRoot, '.verified', 'report.md');

  try {
    // Check if report exists
    await require('fs/promises').access(reportPath);

    // Open the report in the editor
    const uri = vscode.Uri.file(reportPath);
    await vscode.commands.executeCommand('vscode.openWith', uri, 'markdown.preview');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      vscode.window.showWarningMessage(
        'No report found. Generate a report first using "Moji Proctor: Generate Report".'
      );
    } else {
      vscode.window.showErrorMessage(
        `Failed to open report: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * End session command
 */
async function endSessionCommand(): Promise<void> {
  if (!timeTracker || !timeTracker.isActive()) {
    vscode.window.showWarningMessage(
      'No active Moji Proctor session to end.'
    );
    return;
  }

  try {
    const stats = timeTracker.getCurrentStats();
    const sessionId = timeTracker.getSessionId();

    // Create checkpoint before ending session
    if (sessionId && checkpointService) {
      await checkpointService.createCheckpoint({ sessionId, emitEvents: true });
    }

    await timeTracker.endSession('manual');

    updateStatusBar('Moji Proctor: Session ended', 100);

    vscode.window.showInformationMessage(
      `Session ended. Focused: ${stats.total_focused_seconds}s, Active: ${stats.total_active_seconds}s`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to end session: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Manually flush queued signals command
 */
async function flushSignalsCommand(): Promise<void> {
  if (!onlineSignalsManager) {
    vscode.window.showWarningMessage(
      'Online signals mode is not enabled.'
    );
    return;
  }

  const stats = onlineSignalsManager.getStats();
  if (stats.queueSize === 0) {
    vscode.window.showInformationMessage('No signals queued to upload.');
    return;
  }

  const authStatus = await onlineSignalsManager.getAuthStatus();
  if (!authStatus.authenticated) {
    vscode.window.showWarningMessage(
      'Please sign in first to upload signals.',
      'Sign In'
    ).then(result => {
      if (result === 'Sign In') {
        vscode.commands.executeCommand('mojiProctor.signIn');
      }
    });
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Uploading ${stats.queueSize} signals...`,
        cancellable: false,
      },
      async () => {
        const result = await onlineSignalsManager!.flushSignals();
        return result;
      }
    );

    const newStats = onlineSignalsManager.getStats();
    if (newStats.queueSize === 0) {
      vscode.window.showInformationMessage('All signals uploaded successfully!');
    } else {
      vscode.window.showWarningMessage(
        `Upload partially complete. ${newStats.queueSize} signals still pending.`
      );
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to upload signals: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update status bar
 */
function updateStatusBar(text: string, priority: number): void {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      priority
    );
    statusBarItem.name = 'Moji Proctor Status';
    statusBarItem.command = 'mojiProctor.showStatus';
    extensionContext.subscriptions.push(statusBarItem);
  }
  statusBarItem.text = text;
  updateStatusBarTooltip();
  statusBarItem.show();
}

/**
 * Start the periodic report generation timer
 * Generates reports every minute and sends status updates to server
 */
function startPeriodicReportTimer(): void {
  // Clear any existing timer
  stopPeriodicReportTimer();

  // Start new timer
  periodicReportTimer = setInterval(async () => {
    await generatePeriodicReport();
  }, PERIODIC_REPORT_INTERVAL_MS);
}

/**
 * Stop the periodic report generation timer
 */
function stopPeriodicReportTimer(): void {
  if (periodicReportTimer) {
    clearInterval(periodicReportTimer);
    periodicReportTimer = null;
  }
}

/**
 * Generate a periodic report and send status update to server
 * Called automatically every minute
 */
async function generatePeriodicReport(): Promise<void> {
  if (!reportGenerator || !timeTracker) {
    return;
  }

  try {
    // Create checkpoint at report generation time
    const sessionId = timeTracker?.getSessionId();
    if (sessionId && checkpointService) {
      await checkpointService.createCheckpoint({ sessionId, emitEvents: true });
    }

    // Generate both reports (JSON and MD) using the interface method
    await reportGenerator.generateReports();

    // Generate JSON report again for status update (fast since data is in memory)
    const jsonReport = await reportGenerator.generateJsonReport();

    // Send status update to server if online signals enabled
    if (onlineSignalsManager) {
      const statusPayload = {
        total_focused_seconds: jsonReport.time.total_focused_seconds,
        total_active_seconds: jsonReport.time.total_active_seconds,
        session_count: jsonReport.time.session_count,
        burst_count: jsonReport.bursts.total_count,
        burst_by_severity: jsonReport.bursts.by_severity,
        checkpoint_count: jsonReport.checkpoints.count,
        unverified_change_count: jsonReport.unverified_changes.length,
        integrity_passed: jsonReport.integrity.passed,
        session_active: timeTracker?.isActive() ?? false,
      };

      await onlineSignalsManager.sendStatusUpdate(statusPayload);
    }
  } catch (error) {
    // Silent failure for periodic reports - don't disrupt user
    console.error('Failed to generate periodic report:', error);
  }
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  // Cleanup is handled by Disposables registered in context
}
