/**
 * Status bar helpers
 *
 * Builds status bar text and tooltip markdown.
 */

export type ExtensionMode = 'loading' | 'disabled' | 'active';

export interface StatusBarState {
  extensionMode: ExtensionMode;
  activityLabel: string;
  onlineEnabled: boolean;
  onlineAuthenticated: boolean;
  onlineUser?: string;
  onlineServerUrl?: string;
  assignmentName?: string;
  isOnline: boolean;
  queueSize: number;
  isUploading: boolean;
  isBackoff: boolean;
  isPaused: boolean;
  pauseReason?: string | null;
  lastFlushAt?: string | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
  lastUploadAt?: string | null;
  integrityPassed: boolean | null;
  integrityIssues?: string[];
  integrityLastCheckedAt?: string | null;
  tamperDetected: boolean;
  unverifiedCount: number;
  unverifiedLastDetectedAt?: string | null;
  sessionId?: string | null;
  focusedSecondsToday: number;
  activeSecondsToday: number;
  burstCountToday: number;
}

const EMOJI = {
  ok: '🤩',
  signedOut: '😤',
  uploading: '🚀😄',
  offline: '😵‍💫',
  integrity: '🤨',
  tamper: '😱',
  disabled: '🥱',
};

/**
 * Pick status emoji based on state.
 */
export function getStatusEmoji(state: StatusBarState): string {
  if (state.extensionMode !== 'active') {
    return EMOJI.disabled;
  }

  if (state.tamperDetected) {
    return EMOJI.tamper;
  }

  if (state.integrityPassed === false) {
    return EMOJI.integrity;
  }

  if (state.onlineEnabled) {
    if (!state.onlineAuthenticated) {
      return EMOJI.signedOut;
    }
    if (!state.isOnline || state.isBackoff) {
      return EMOJI.offline;
    }
    if (state.queueSize > 0 || state.isUploading) {
      return EMOJI.uploading;
    }
  }

  return EMOJI.ok;
}

/**
 * Build status bar text.
 */
export function buildStatusBarText(state: StatusBarState): string {
  const emoji = getStatusEmoji(state);
  const label = state.activityLabel ? `: ${state.activityLabel}` : '';
  return `${emoji} Moji Proctor${label}`;
}

/**
 * Build tooltip markdown.
 */
export function buildStatusBarTooltipMarkdown(state: StatusBarState): string {
  const lines: string[] = [];
  lines.push('## $(shield) Moji Proctor');
  lines.push('');

  if (state.assignmentName) {
    lines.push(`**Assignment:** ${state.assignmentName}`);
  }

  const modeLabel = state.onlineEnabled
    ? 'Online Signals Enabled'
    : state.extensionMode === 'active'
      ? 'Local-only'
      : 'Disabled';
  lines.push(`**Mode:** ${modeLabel}`);

  const authLabel = state.onlineEnabled
    ? state.onlineAuthenticated
      ? `Signed in as ${state.onlineUser ?? 'unknown'}`
      : 'Signed out'
    : 'Signed out';
  lines.push(`**Auth:** ${authLabel}`);

  lines.push(`**Server:** ${state.onlineServerUrl || '—'}`);

  const queueParts = [
    `${state.queueSize} pending`,
    `last flush: ${formatTimestamp(state.lastFlushAt)}`,
    `last error: ${state.lastError ? truncate(state.lastError, 80) : 'none'}`,
  ];
  lines.push(`**Queue:** ${queueParts.join(' | ')}`);

  const sessionId = state.sessionId ?? 'none';
  const focused = formatDuration(state.focusedSecondsToday);
  const active = formatDuration(state.activeSecondsToday);
  lines.push(`**Session:** ${sessionId} | focused ${focused} | active ${active} | bursts ${state.burstCountToday}`);

  const integritySummary = state.integrityPassed === null
    ? 'Unknown'
    : state.integrityPassed
      ? 'Passed'
      : 'Issues detected';
  const integrityDetail = state.integrityIssues && state.integrityIssues.length > 0
    ? ` (${truncate(state.integrityIssues.join('; '), 120)})`
    : '';
  const integrityTime = state.integrityLastCheckedAt
    ? ` | last check: ${formatTimestamp(state.integrityLastCheckedAt)}`
    : '';
  lines.push(`**Integrity:** ${integritySummary}${integrityDetail}${integrityTime}`);

  const unverifiedLast = formatTimestamp(state.unverifiedLastDetectedAt);
  lines.push(`**Unverified changes:** ${state.unverifiedCount} | last detected: ${unverifiedLast}`);

  lines.push('');
  lines.push('### $(list-unordered) Actions');
  lines.push('');

  if (state.onlineEnabled) {
    if (state.onlineAuthenticated) {
      lines.push('$(sign-out) [Sign Out](command:mojiProctor.signOut)');
    } else {
      lines.push('$(sign-in) [Sign In](command:mojiProctor.signIn)');
    }
  } else {
    lines.push('$(sign-in) [Sign In](command:mojiProctor.signIn)');
  }

  lines.push('$(radio-tower) [Show Online Signals Status](command:mojiProctor.showOnlineSignalsStatus)');
  lines.push('$(sync) [Retry Upload Now](command:mojiProctor.retryUploadNow)');
  lines.push('$(file-text) [Generate Report](command:mojiProctor.generateReport)');
  lines.push('$(open-preview) [Show Summary](command:mojiProctor.showSummary)');

  return lines.join('\n');
}

function formatTimestamp(ts?: string | null): string {
  if (!ts) {
    return '—';
  }
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function formatDuration(seconds: number): string {
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

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return text.substring(0, maxLen - 3) + '...';
}
