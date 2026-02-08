import { describe, it, expect } from 'vitest';
import { buildStatusBarTooltipMarkdown, getStatusEmoji, StatusBarState } from './statusBar';

function baseState(overrides: Partial<StatusBarState> = {}): StatusBarState {
  return {
    extensionMode: 'active',
    activityLabel: 'Active',
    onlineEnabled: false,
    onlineAuthenticated: false,
    onlineUser: undefined,
    onlineServerUrl: 'http://localhost:3000',
    isOnline: true,
    queueSize: 0,
    isUploading: false,
    isBackoff: false,
    isPaused: false,
    pauseReason: null,
    lastFlushAt: null,
    lastError: null,
    lastErrorAt: null,
    lastUploadAt: null,
    integrityPassed: true,
    integrityIssues: [],
    integrityLastCheckedAt: null,
    tamperDetected: false,
    unverifiedCount: 0,
    unverifiedLastDetectedAt: null,
    sessionId: null,
    focusedSecondsToday: 0,
    activeSecondsToday: 0,
    burstCountToday: 0,
    ...overrides,
  };
}

describe('Status bar emoji', () => {
  it('shows ok emoji for local-only', () => {
    const emoji = getStatusEmoji(baseState());
    expect(emoji).toBe('🤩');
  });

  it('shows signed-out emoji when online enabled and signed out', () => {
    const emoji = getStatusEmoji(baseState({ onlineEnabled: true, onlineAuthenticated: false }));
    expect(emoji).toBe('😤');
  });

  it('shows uploading emoji when queue has items', () => {
    const emoji = getStatusEmoji(baseState({ onlineEnabled: true, onlineAuthenticated: true, queueSize: 3 }));
    expect(emoji).toBe('🚀😄');
  });

  it('shows offline emoji when offline', () => {
    const emoji = getStatusEmoji(baseState({ onlineEnabled: true, onlineAuthenticated: true, isOnline: false }));
    expect(emoji).toBe('😵‍💫');
  });

  it('shows integrity warning emoji when integrity fails', () => {
    const emoji = getStatusEmoji(baseState({ integrityPassed: false }));
    expect(emoji).toBe('🤨');
  });

  it('shows tamper emoji when tamper detected', () => {
    const emoji = getStatusEmoji(baseState({ tamperDetected: true }));
    expect(emoji).toBe('😱');
  });

  it('shows disabled emoji when extension disabled', () => {
    const emoji = getStatusEmoji(baseState({ extensionMode: 'disabled' }));
    expect(emoji).toBe('🥱');
  });
});

describe('Status bar tooltip markdown', () => {
  it('includes mode/auth/queue and command links', () => {
    const markdown = buildStatusBarTooltipMarkdown(
      baseState({ onlineEnabled: true, onlineAuthenticated: false, queueSize: 2 })
    );

    expect(markdown).toContain('**Mode:**');
    expect(markdown).toContain('**Auth:**');
    expect(markdown).toContain('**Queue:**');
    expect(markdown).toContain('command:mojiProctor.signIn');
    expect(markdown).toContain('command:mojiProctor.retryUploadNow');
    expect(markdown).toContain('command:mojiProctor.showOnlineSignalsStatus');
  });
});
