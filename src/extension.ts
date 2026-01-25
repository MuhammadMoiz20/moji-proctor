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

/**
 * Git root path for current workspace
 */
let gitRoot: string | null = null;

/**
 * Status bar item
 */
let statusBarItem: vscode.StatusBarItem;

/**
 * Activate the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  extensionContext = context;

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

  // Check for assignment metadata
  const assignment = await readAssignmentMetadata(gitRoot);
  if (!assignment) {
    updateStatusBar('No assignment', 90);
    return;
  }

  // Create status bar item
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    extensionContext.subscriptions.push(statusBarItem);
  }
  statusBarItem.show();

  // Initialize services
  eventLog = new EventLog(gitRoot);
  checkpointStore = new CheckpointStore(gitRoot);
  reportWriter = new ReportWriter(gitRoot);
  ignoreMatcher = createDefaultMatcher();
  timeTracker = new TimeTracker(eventLog);
  burstDetector = new BurstDetector(eventLog);
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

  updateStatusBar('Moji Proctor: Active', 100);

  // Register window state change handlers for time tracking
  extensionContext.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (timeTracker) {
        timeTracker.onWindowStateChanged(e.focused);
        if (e.focused) {
          updateStatusBar('Moji Proctor: Active', 100);
        } else {
          updateStatusBar('Moji Proctor: Unfocused', 100);
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

        await reportGenerator.generateReports();
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

  const message = `
Moji Proctor Status

Active: ${timeTracker.isActive()}
Sessions: ${stats.session_count}
Focused time: ${stats.total_focused_seconds}s
Active time: ${stats.total_active_seconds}s

Integrity: ${integrity.passed ? 'PASSED' : 'FAILED'}
${integrity.issues.length > 0 ? integrity.issues.map((i) => `- ${i.description}`).join('\n') : ''}
  `.trim();

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
 * Update status bar
 */
function updateStatusBar(text: string, priority: number): void {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      priority
    );
    extensionContext.subscriptions.push(statusBarItem);
  }
  statusBarItem.text = text;
  statusBarItem.show();
}

/**
 * Deactivate the extension
 */
export function deactivate(): void {
  // Cleanup is handled by Disposables registered in context
}
