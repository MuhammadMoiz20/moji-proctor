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
import { CONFIG_FILENAME, readConfig, validateOnlineSignalsConfig } from './utils/configLoader';
import { OnlineSignalsManager, createOnlineSignalsManager } from './services/onlineSignalsManager';
import { EventEnvelope } from './types/events';
import { buildStatusBarText, buildStatusBarTooltipMarkdown, StatusBarState, ExtensionMode } from './services/statusBar';

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
 * Output channel for diagnostics
 */
let outputChannel: vscode.OutputChannel;

/**
 * Extension status mode
 */
let extensionMode: ExtensionMode = 'loading';

/**
 * Current activity label for status bar
 */
let activityLabel = 'Loading...';

/**
 * Current config snapshot
 */
let currentConfig: Awaited<ReturnType<typeof readConfig>> | null = null;

/**
 * Debounced status update timer
 */
let statusUpdateTimer: NodeJS.Timeout | null = null;

/**
 * Event log sink registry for forwarding
 */
type EventSink = (event: EventEnvelope) => void | Promise<void>;
let eventLogDispatcher: {
  eventLog: IEventLog;
  addSink: (sink: EventSink) => void;
  removeSink: (sink: EventSink) => void;
} | null = null;
let onlineSignalsSink: EventSink | null = null;
let statusEventSink: EventSink | null = null;

/**
 * Cached event stats for status bar
 */
const EVENT_STATS_TTL_MS = 30000;
let eventStatsDirty = true;
let eventStatsCache: {
  dateKey: string;
  focusedSecondsToday: number;
  activeSecondsToday: number;
  burstCountToday: number;
  unverifiedCount: number;
  unverifiedLastDetectedAt: string | null;
  integrityCompromisedAt: string | null;
  integrityCompromisedReason: string | null;
  computedAt: number;
} | null = null;

/**
 * Cached integrity snapshot
 */
const INTEGRITY_CACHE_TTL_MS = 60000;
let integrityCache: {
  passed: boolean;
  issues: string[];
  checkedAt: string;
  computedAt: number;
} | null = null;

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
  outputChannel = vscode.window.createOutputChannel('Moji Proctor');
  context.subscriptions.push(outputChannel);

  // Create status bar immediately so it appears right away
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.name = 'Moji Proctor Status';
  statusBarItem.text = '😴 Moji Proctor: Loading...';
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

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.retryUploadNow', async () => {
      await retryUploadNowCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.showOnlineSignalsStatus', async () => {
      await showOnlineSignalsStatusCommand();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.signIn', async () => {
      if (!onlineSignalsManager) {
        vscode.window.showWarningMessage('Online Signals mode is not enabled.');
        return;
      }
      await onlineSignalsManager.signIn();
      scheduleStatusBarUpdate('sign-in');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.signOut', async () => {
      if (!onlineSignalsManager) {
        vscode.window.showWarningMessage('Online Signals mode is not enabled.');
        return;
      }
      await onlineSignalsManager.signOut();
      scheduleStatusBarUpdate('sign-out');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.forceResume', async () => {
      if (!onlineSignalsManager) {
        vscode.window.showWarningMessage('Online Signals mode is not enabled.');
        return;
      }
      const authStatus = await onlineSignalsManager.getAuthStatus();
      if (!authStatus.authenticated) {
        vscode.window.showWarningMessage('Please sign in first before resuming uploads.');
        return;
      }
      await onlineSignalsManager.forceResume();
      scheduleStatusBarUpdate('force-resume');
    })
  );

  // Internal auth event hooks
  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.signedIn', async () => {
      if (onlineSignalsManager) {
        await onlineSignalsManager.handleSignedIn();
        scheduleStatusBarUpdate('signed-in');
      }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('mojiProctor.signedOut', () => {
      if (onlineSignalsManager) {
        onlineSignalsManager.handleSignedOut();
        scheduleStatusBarUpdate('signed-out');
      }
    })
  );

  // Watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      await initializeExtension();
    })
  );

  const configWatcher = vscode.workspace.createFileSystemWatcher(`**/${CONFIG_FILENAME}`);
  configWatcher.onDidChange(() => {
    void handleConfigChange();
  });
  configWatcher.onDidCreate(() => {
    void handleConfigChange();
  });
  configWatcher.onDidDelete(() => {
    void handleConfigChange();
  });
  context.subscriptions.push(configWatcher);
}

/**
 * Initialize extension services for current workspace
 */
async function initializeExtension(): Promise<void> {
  setExtensionMode('loading', 'Loading...');
  if (onlineSignalsManager) {
    await onlineSignalsManager.stop();
    onlineSignalsManager.dispose();
    onlineSignalsManager = null;
    if (eventLogDispatcher && onlineSignalsSink) {
      eventLogDispatcher.removeSink(onlineSignalsSink);
      onlineSignalsSink = null;
    }
  }
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    setExtensionMode('disabled', 'No workspace');
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;

  // Detect git root
  try {
    gitRoot = findGitRoot(workspaceRoot);
  } catch (e) {
    if (e instanceof GitRootNotFoundError) {
      setExtensionMode('disabled', 'Not a git repo');
      return;
    }
    throw e;
  }

  // Read config file (optional)
  const config = await readConfig(workspaceRoot);
  currentConfig = config;

  // Check for assignment metadata
  const assignment = await readAssignmentMetadata(gitRoot);
  if (!assignment) {
    setExtensionMode('disabled', 'No assignment');
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
  const baseEventLog = new EventLog(gitRoot);
  eventLogDispatcher = createEventLogDispatcher(baseEventLog);
  eventLog = eventLogDispatcher.eventLog;
  statusEventSink = handleStatusEvent;
  eventLogDispatcher.addSink(statusEventSink);
  eventStatsDirty = true;
  integrityCache = null;
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
          config.online_signals,
          outputChannel
        );
        await onlineSignalsManager.start();

        // Forward events to online signals manager
        onlineSignalsSink = (event: EventEnvelope) => onlineSignalsManager?.processEvent(event);
        eventLogDispatcher.addSink(onlineSignalsSink);

        const statusDisposable = onlineSignalsManager.onDidChangeStatus(() => {
          scheduleStatusBarUpdate('online-signals');
        });
        extensionContext.subscriptions.push(statusDisposable);
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

  setExtensionMode('active', 'Active');

  // Start periodic report generation timer
  startPeriodicReportTimer();

  // Register window state change handlers for time tracking
  extensionContext.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (timeTracker) {
        timeTracker.onWindowStateChanged(e.focused);
        if (e.focused) {
          setActivityLabel('Active');
        } else {
          setActivityLabel('Unfocused');
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
        onlineSignalsManager.dispose();
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
 * Handle config changes and refresh online signals manager
 */
async function handleConfigChange(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  const newConfig = await readConfig(workspaceRoot);
  const previousConfig = currentConfig;
  currentConfig = newConfig;

  const wasEnabled = previousConfig?.online_signals?.enabled ?? false;
  const isEnabled = newConfig.online_signals?.enabled ?? false;
  const serverChanged = previousConfig?.online_signals?.server_url !== newConfig.online_signals?.server_url ||
    previousConfig?.online_signals?.api_base_path !== newConfig.online_signals?.api_base_path;

  if (onlineSignalsManager && (!isEnabled || serverChanged)) {
    await onlineSignalsManager.stop();
    onlineSignalsManager.dispose();
    onlineSignalsManager = null;
    if (eventLogDispatcher && onlineSignalsSink) {
      eventLogDispatcher.removeSink(onlineSignalsSink);
      onlineSignalsSink = null;
    }
  }

  if (!onlineSignalsManager && isEnabled && eventLogDispatcher && gitRoot) {
    const validation = validateOnlineSignalsConfig(newConfig);
    if (!validation.valid) {
      vscode.window.showErrorMessage(`Online signals config error: ${validation.error}`);
    } else {
      try {
        onlineSignalsManager = createOnlineSignalsManager(
          extensionContext,
          workspaceRoot,
          newConfig.online_signals!,
          outputChannel
        );
        await onlineSignalsManager.start();
        onlineSignalsSink = (event: EventEnvelope) => onlineSignalsManager?.processEvent(event);
        eventLogDispatcher.addSink(onlineSignalsSink);
        const statusDisposable = onlineSignalsManager.onDidChangeStatus(() => scheduleStatusBarUpdate('online-signals'));
        extensionContext.subscriptions.push(statusDisposable);
      } catch (error) {
        console.error('Failed to start online signals manager after config change:', error);
        onlineSignalsManager = null;
      }
    }
  }

  scheduleStatusBarUpdate('config-change');
}

/**
 * Create a proxy event log with pluggable sinks.
 */
function createEventLogDispatcher(originalEventLog: IEventLog): {
  eventLog: IEventLog;
  addSink: (sink: EventSink) => void;
  removeSink: (sink: EventSink) => void;
} {
  const sinks = new Set<EventSink>();
  const originalAppendEvent = originalEventLog.appendEvent.bind(originalEventLog);

  const proxy = new Proxy(originalEventLog, {
    get(target, prop) {
      if (prop === 'appendEvent') {
        return async function (type: any, payload: any, sessionId: string) {
          const event = await originalAppendEvent(type, payload, sessionId);

          if (event) {
            for (const sink of Array.from(sinks)) {
              try {
                await sink(event);
              } catch (err) {
                console.error('Event sink error:', err);
              }
            }
          }

          return event;
        };
      }
      return (target as any)[prop];
    }
  });

  return {
    eventLog: proxy as IEventLog,
    addSink: (sink) => sinks.add(sink),
    removeSink: (sink) => sinks.delete(sink),
  };
}

/**
 * Handle events for status cache updates.
 */
function handleStatusEvent(event: EventEnvelope): void {
  if (event.type === 'BURST_FLAG' || event.type === 'TIME_TICK' || event.type === 'SESSION_END' || event.type === 'UNVERIFIED_CHANGES' || event.type === 'INTEGRITY_COMPROMISED') {
    eventStatsDirty = true;
    if (event.type === 'INTEGRITY_COMPROMISED') {
      integrityCache = null;
    }
    scheduleStatusBarUpdate('event');
  }
}

/**
 * Build rich tooltip for status bar
 */
async function buildStatusBarTooltip(state?: StatusBarState): Promise<vscode.MarkdownString> {
  const tooltip = new vscode.MarkdownString('', true);
  tooltip.isTrusted = {
    enabledCommands: [
      'mojiProctor.signIn',
      'mojiProctor.signOut',
      'mojiProctor.showOnlineSignalsStatus',
      'mojiProctor.retryUploadNow',
      'mojiProctor.generateReport',
      'mojiProctor.showSummary',
      'mojiProctor.showStatus',
    ],
  };

  const resolvedState = state ?? await collectStatusBarState();
  tooltip.appendMarkdown(buildStatusBarTooltipMarkdown(resolvedState));

  return tooltip;
}

/**
 * Schedule a debounced status bar refresh
 */
function scheduleStatusBarUpdate(_reason?: string): void {
  if (statusUpdateTimer) {
    return;
  }
  statusUpdateTimer = setTimeout(() => {
    statusUpdateTimer = null;
    void refreshStatusBar();
  }, 250);
}

/**
 * Refresh status bar text and tooltip
 */
async function refreshStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }

  const state = await collectStatusBarState();
  statusBarItem.text = buildStatusBarText(state);
  statusBarItem.command = 'mojiProctor.showStatus';
  statusBarItem.tooltip = await buildStatusBarTooltip(state);
  statusBarItem.show();
}

/**
 * Collect current status bar state
 */
async function collectStatusBarState(): Promise<StatusBarState> {
  const onlineEnabled = currentConfig?.online_signals?.enabled ?? false;
  const authStatus = onlineSignalsManager ? await onlineSignalsManager.getAuthStatus() : { authenticated: false, user: undefined };
  const stats = onlineSignalsManager ? onlineSignalsManager.getStats() : { queueSize: 0, isPaused: false, pauseReason: null };
  const eventStats = await getEventStats();
  const integritySnapshot = await getIntegritySnapshot();

  const integrityIssues = [...integritySnapshot.issues];
  if (eventStats.unverifiedCount > 0) {
    integrityIssues.push(`${eventStats.unverifiedCount} unverified change(s) detected`);
  }
  if (eventStats.integrityCompromisedReason) {
    integrityIssues.push(eventStats.integrityCompromisedReason);
  }

  const integrityPassed = integritySnapshot.passed && eventStats.unverifiedCount === 0 && !eventStats.integrityCompromisedAt;
  const tamperDetected = integritySnapshot.issues.length > 0 || Boolean(eventStats.integrityCompromisedAt) || Boolean(eventLog && eventLog.isCompromised());

  return {
    extensionMode,
    activityLabel,
    onlineEnabled,
    onlineAuthenticated: Boolean(authStatus.authenticated),
    onlineUser: authStatus.user?.login,
    onlineServerUrl: currentConfig?.online_signals?.server_url || '',
    assignmentName: currentAssignment?.assignment_name,
    isOnline: onlineSignalsManager ? onlineSignalsManager.isOnline : false,
    queueSize: stats.queueSize ?? 0,
    isUploading: (stats as any).isUploading ?? false,
    isBackoff: (stats as any).isBackoffActive ?? false,
    isPaused: stats.isPaused ?? false,
    pauseReason: stats.pauseReason ?? null,
    lastFlushAt: (stats as any).lastFlushAt ?? null,
    lastError: (stats as any).lastError ?? null,
    lastErrorAt: (stats as any).lastErrorAt ?? null,
    lastUploadAt: (stats as any).lastUploadAt ?? null,
    integrityPassed,
    integrityIssues,
    integrityLastCheckedAt: integritySnapshot.checkedAt,
    tamperDetected,
    unverifiedCount: eventStats.unverifiedCount,
    unverifiedLastDetectedAt: eventStats.unverifiedLastDetectedAt,
    sessionId: timeTracker?.isActive() ? timeTracker.getSessionId() : null,
    focusedSecondsToday: eventStats.focusedSecondsToday,
    activeSecondsToday: eventStats.activeSecondsToday,
    burstCountToday: eventStats.burstCountToday,
  };
}

async function getEventStats(): Promise<{
  dateKey: string;
  focusedSecondsToday: number;
  activeSecondsToday: number;
  burstCountToday: number;
  unverifiedCount: number;
  unverifiedLastDetectedAt: string | null;
  integrityCompromisedAt: string | null;
  integrityCompromisedReason: string | null;
}> {
  const now = Date.now();
  const todayKey = getDateKey(new Date());

  if (eventStatsCache && !eventStatsDirty && eventStatsCache.dateKey === todayKey && now - eventStatsCache.computedAt < EVENT_STATS_TTL_MS) {
    return eventStatsCache;
  }

  const fallback = {
    dateKey: todayKey,
    focusedSecondsToday: 0,
    activeSecondsToday: 0,
    burstCountToday: 0,
    unverifiedCount: 0,
    unverifiedLastDetectedAt: null,
    integrityCompromisedAt: null,
    integrityCompromisedReason: null,
  };

  if (!eventLog) {
    return fallback;
  }

  const events = await eventLog.readAllEvents();
  let focusedSecondsToday = 0;
  let activeSecondsToday = 0;
  let burstCountToday = 0;
  let unverifiedCount = 0;
  let unverifiedLastDetectedAt: string | null = null;
  let integrityCompromisedAt: string | null = null;
  let integrityCompromisedReason: string | null = null;
  const sessionsWithTicks = new Set<string>();

  for (const event of events) {
    const eventDate = new Date(event.ts);
    if (Number.isNaN(eventDate.getTime())) {
      continue;
    }
    const eventKey = getDateKey(eventDate);

    if (eventKey === todayKey) {
      if (event.type === 'TIME_TICK') {
        const payload = event.payload as { focused_delta_seconds?: number; active_delta_seconds?: number };
        if (typeof payload.focused_delta_seconds === 'number') {
          focusedSecondsToday += payload.focused_delta_seconds;
        }
        if (typeof payload.active_delta_seconds === 'number') {
          activeSecondsToday += payload.active_delta_seconds;
        }
        sessionsWithTicks.add(event.session_id);
      } else if (event.type === 'SESSION_END') {
        if (!sessionsWithTicks.has(event.session_id)) {
          const payload = event.payload as { focused_seconds?: number; active_seconds?: number };
          if (typeof payload.focused_seconds === 'number') {
            focusedSecondsToday += payload.focused_seconds;
          }
          if (typeof payload.active_seconds === 'number') {
            activeSecondsToday += payload.active_seconds;
          }
        }
      } else if (event.type === 'BURST_FLAG') {
        burstCountToday += 1;
      }
    }

    if (event.type === 'UNVERIFIED_CHANGES') {
      const payload = event.payload as { changes?: Array<unknown> };
      const count = Array.isArray(payload.changes) ? payload.changes.length : 0;
      if (!unverifiedLastDetectedAt || event.ts > unverifiedLastDetectedAt) {
        unverifiedLastDetectedAt = event.ts;
        unverifiedCount = count;
      }
    }

    if (event.type === 'INTEGRITY_COMPROMISED') {
      const payload = event.payload as { description?: string; reason?: string };
      if (!integrityCompromisedAt || event.ts > integrityCompromisedAt) {
        integrityCompromisedAt = event.ts;
        integrityCompromisedReason = payload.description || payload.reason || 'Integrity compromised';
      }
    }
  }

  eventStatsCache = {
    dateKey: todayKey,
    focusedSecondsToday,
    activeSecondsToday,
    burstCountToday,
    unverifiedCount,
    unverifiedLastDetectedAt,
    integrityCompromisedAt,
    integrityCompromisedReason,
    computedAt: now,
  };
  eventStatsDirty = false;

  return eventStatsCache;
}

async function getIntegritySnapshot(): Promise<{ passed: boolean; issues: string[]; checkedAt: string }> {
  const now = Date.now();
  if (integrityCache && now - integrityCache.computedAt < INTEGRITY_CACHE_TTL_MS) {
    return integrityCache;
  }

  if (!integrityService) {
    const checkedAt = new Date().toISOString();
    integrityCache = { passed: true, issues: [], checkedAt, computedAt: now };
    return integrityCache;
  }

  const result = await integrityService.checkIntegrity();
  const checkedAt = new Date().toISOString();
  integrityCache = {
    passed: result.passed,
    issues: result.issues.map((issue) => issue.description),
    checkedAt,
    computedAt: now,
  };
  return integrityCache;
}

function setActivityLabel(label: string): void {
  activityLabel = normalizeActivityLabel(label);
  scheduleStatusBarUpdate('activity');
}

function setExtensionMode(mode: ExtensionMode, label?: string): void {
  extensionMode = mode;
  if (label) {
    activityLabel = normalizeActivityLabel(label);
  }
  scheduleStatusBarUpdate('mode');
}

function normalizeActivityLabel(label: string): string {
  return label.replace(/^Moji Proctor:\s*/i, '').trim();
}

function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
 * Show status command - displays status info in a QuickPick menu with actions
 */
async function showStatusCommand(): Promise<void> {
  const state = await collectStatusBarState();
  const markdownContent = buildStatusBarTooltipMarkdown(state);
  
  // Show the same content in the output channel, then show action buttons
  outputChannel.clear();
  outputChannel.appendLine('═══════════════════════════════════════════════════════════');
  outputChannel.appendLine('                    MOJI PROCTOR STATUS');
  outputChannel.appendLine('═══════════════════════════════════════════════════════════');
  outputChannel.appendLine('');
  
  if (state.assignmentName) {
    outputChannel.appendLine(`📚 Assignment: ${state.assignmentName}`);
  }
  
  const modeLabel = state.onlineEnabled ? 'Online Signals Enabled' : state.extensionMode === 'active' ? 'Local-only' : 'Disabled';
  outputChannel.appendLine(`📡 Mode: ${modeLabel}`);
  
  const authLabel = state.onlineEnabled
    ? state.onlineAuthenticated
      ? `Signed in as ${state.onlineUser ?? 'unknown'}`
      : 'Signed out'
    : 'Signed out';
  outputChannel.appendLine(`🔐 Auth: ${authLabel}`);
  
  outputChannel.appendLine(`🌐 Server: ${state.onlineServerUrl || '—'}`);
  
  const lastFlush = state.lastFlushAt ? new Date(state.lastFlushAt).toLocaleString() : '—';
  const lastError = state.lastError ? state.lastError.substring(0, 80) : 'none';
  outputChannel.appendLine(`📤 Queue: ${state.queueSize} pending | last flush: ${lastFlush} | last error: ${lastError}`);
  
  const focused = formatDurationForOutput(state.focusedSecondsToday);
  const active = formatDurationForOutput(state.activeSecondsToday);
  outputChannel.appendLine(`⏱️  Session: ${state.sessionId ?? 'none'} | focused ${focused} | active ${active} | bursts ${state.burstCountToday}`);
  
  const integritySummary = state.integrityPassed === null ? 'Unknown' : state.integrityPassed ? 'Passed' : 'Issues detected';
  const integrityDetail = state.integrityIssues && state.integrityIssues.length > 0 ? ` (${state.integrityIssues.join('; ').substring(0, 120)})` : '';
  const integrityTime = state.integrityLastCheckedAt ? ` | last check: ${new Date(state.integrityLastCheckedAt).toLocaleString()}` : '';
  outputChannel.appendLine(`🛡️  Integrity: ${integritySummary}${integrityDetail}${integrityTime}`);
  
  const unverifiedLast = state.unverifiedLastDetectedAt ? new Date(state.unverifiedLastDetectedAt).toLocaleString() : '—';
  outputChannel.appendLine(`⚠️  Unverified changes: ${state.unverifiedCount} | last detected: ${unverifiedLast}`);
  
  outputChannel.appendLine('');
  outputChannel.appendLine('───────────────────────────────────────────────────────────');
  outputChannel.appendLine('Use the buttons below or run commands from Command Palette');
  outputChannel.appendLine('───────────────────────────────────────────────────────────');
  
  outputChannel.show(true);
  
  // Build action buttons based on state
  const actions: string[] = [];
  if (state.extensionMode === 'active') {
    actions.push('Generate Report');
    actions.push('Show Summary');
    if (state.onlineEnabled) {
      if (state.onlineAuthenticated) {
        actions.push('Sign Out');
        actions.push('Retry Upload');
      } else {
        actions.push('Sign In');
      }
    }
  }
  
  if (actions.length > 0) {
    const selected = await vscode.window.showInformationMessage(
      'Moji Proctor Status — See Output panel for details',
      ...actions
    );
    
    if (selected === 'Generate Report') {
      await vscode.commands.executeCommand('mojiProctor.generateReport');
    } else if (selected === 'Show Summary') {
      await vscode.commands.executeCommand('mojiProctor.showSummary');
    } else if (selected === 'Sign Out') {
      await vscode.commands.executeCommand('mojiProctor.signOut');
    } else if (selected === 'Sign In') {
      await vscode.commands.executeCommand('mojiProctor.signIn');
    } else if (selected === 'Retry Upload') {
      await vscode.commands.executeCommand('mojiProctor.retryUploadNow');
    }
  }
}

/**
 * Format duration for output display
 */
function formatDurationForOutput(seconds: number): string {
  const rounded = Math.max(0, Math.floor(seconds));
  if (rounded < 60) {
    return `${rounded}s`;
  }
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins < 60) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

/**
 * Show online signals status command
 */
async function showOnlineSignalsStatusCommand(): Promise<void> {
  if (!onlineSignalsManager) {
    vscode.window.showInformationMessage('Online signals mode is not enabled.');
    return;
  }

  const authStatus = await onlineSignalsManager.getAuthStatus();
  const stats = onlineSignalsManager.getStats();
  const statusInfo = onlineSignalsManager.getLastStatusInfo();

  outputChannel.clear();
  outputChannel.appendLine('Moji Proctor - Online Signals Status');
  outputChannel.appendLine('');
  outputChannel.appendLine(`Server: ${currentConfig?.online_signals?.server_url || '—'}`);
  outputChannel.appendLine(`Online: ${onlineSignalsManager.isOnline ? 'Yes' : 'No'}`);
  outputChannel.appendLine(`Auth: ${authStatus.authenticated ? `Signed in as ${authStatus.user?.login ?? 'unknown'}` : 'Signed out'}`);
  outputChannel.appendLine(`Queue: ${stats.queueSize} pending${stats.isPaused ? ' (paused)' : ''}`);
  outputChannel.appendLine(`Last upload: ${statusInfo.lastUploadAt ?? '—'}`);
  outputChannel.appendLine(`Last flush: ${statusInfo.lastFlushAt ?? '—'}`);
  outputChannel.appendLine(`Last error: ${statusInfo.lastError ?? '—'}`);
  outputChannel.appendLine('');
  outputChannel.appendLine('Commands:');
  outputChannel.appendLine('- Moji Proctor: Sign In / Sign Out');
  outputChannel.appendLine('- Moji Proctor: Retry Upload Now');
  outputChannel.show(true);
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
 * Open the config file in the editor if present
 */
async function openConfigFile(): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showWarningMessage('No workspace folder open.');
    return;
  }

  const configPath = require('path').join(workspaceFolder.uri.fsPath, CONFIG_FILENAME);
  try {
    await require('fs/promises').access(configPath);
    const uri = vscode.Uri.file(configPath);
    await vscode.window.showTextDocument(uri);
  } catch {
    vscode.window.showWarningMessage('Config file not found. Create moji-proctor.config.json at the workspace root.');
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
  await retryUploadNowCommand();
}

/**
 * Retry upload now command
 */
async function retryUploadNowCommand(): Promise<void> {
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
  void priority;
  setActivityLabel(text);
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
