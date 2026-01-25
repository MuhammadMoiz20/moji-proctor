/**
 * Unit tests for Burst Detector
 *
 * Tests:
 * - Severity classification based on thresholds
 * - Rolling window behavior
 * - Cooldown between burst events
 * - Minimum edit size filtering
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BurstDetector, BurstDetectorConfig } from './burstDetector';
import type { IEventLog } from '../storage/eventLog';
import type { EventEnvelope, EventType } from '../types/events';

// Mock EventLog
class MockEventLog implements IEventLog {
  public events: Array<{ type: string; payload: unknown; sessionId: string }> = [];

  async appendEvent(type: EventType, payload: unknown, sessionId: string): Promise<EventEnvelope> {
    this.events.push({ type, payload, sessionId });
    return {
      event_id: 'test-id',
      ts: new Date().toISOString(),
      session_id: sessionId,
      type,
      payload,
      prev_hash: null,
      hash: 'test-hash',
    };
  }

  async readAllEvents() {
    return [];
  }

  async getLastHash() {
    return null;
  }

  async verifyChain() {
    return { valid: true, issues: [] };
  }
}

// Testable BurstDetector that exposes private methods
class TestableBurstDetector extends BurstDetector {
  constructor(eventLog: IEventLog, config?: BurstDetectorConfig) {
    super(eventLog, config);
  }

  // Expose private methods for testing
  public testClassifySeverity(editCount: number, charCount: number, windowDuration: number) {
    return (this as any).classifySeverity(editCount, charCount, windowDuration);
  }

  public testAddEvent(filePath: string, event: {
    timestamp: number;
    linesAdded: number;
    linesRemoved: number;
    charsChanged: number;
    filePath: string;
  }) {
    (this as any).addToWindow(filePath, event);
  }

  public testCheckBurst(filePath: string, now: number) {
    (this as any).checkForBurst(filePath, now);
  }

  public getTrackedEvents(filePath: string) {
    const window = (this as any).fileWindows.get(filePath);
    if (!window) return null;
    return {
      count: window.events.length,
      totalChars: window.events.reduce((sum: number, e: any) => sum + e.charsChanged, 0),
    };
  }
}

describe('BurstDetector - Severity Classification', () => {
  let mockEventLog: MockEventLog;
  let detector: TestableBurstDetector;

  beforeEach(() => {
    mockEventLog = new MockEventLog();
    detector = new TestableBurstDetector(mockEventLog, {
      thresholds: {
        windowMs: 5000,
        lowEditThreshold: 3,
        mediumEditThreshold: 5,
        highEditThreshold: 10,
        lowCharThreshold: 100,
        mediumCharThreshold: 500,
        highCharThreshold: 1000,
      },
      minEditSize: 10,
      burstCooldown: 0, // Disable cooldown for testing
    });
    detector.setSessionId('test-session');
  });

  describe('severity classification', () => {
    it('should classify low severity bursts', () => {
      // 3 edits, 150 chars -> low (meets low threshold)
      const result = detector.testClassifySeverity(3, 150, 5000);
      expect(result).toBe('low');
    });

    it('should classify medium severity bursts', () => {
      // 5 edits, 600 chars -> medium (meets medium threshold)
      const result = detector.testClassifySeverity(5, 600, 5000);
      expect(result).toBe('medium');
    });

    it('should classify high severity bursts', () => {
      // 10 edits, 1500 chars -> high (meets high threshold)
      const result = detector.testClassifySeverity(10, 1500, 5000);
      expect(result).toBe('high');
    });

    it('should return null when below low threshold', () => {
      // 2 edits, 50 chars -> no burst (below all thresholds)
      const result = detector.testClassifySeverity(2, 50, 5000);
      expect(result).toBeNull();
    });

    it('should require both edit count AND char threshold', () => {
      // High edit count but low char count -> no burst
      const result1 = detector.testClassifySeverity(10, 50, 5000);
      expect(result1).toBeNull();

      // High char count but low edit count -> no burst
      const result2 = detector.testClassifySeverity(2, 2000, 5000);
      expect(result2).toBeNull();
    });

    it('should scale thresholds for shorter windows', () => {
      // Same stats in shorter window should be higher severity
      const normalWindow = detector.testClassifySeverity(5, 600, 5000);
      const shortWindow = detector.testClassifySeverity(5, 600, 2500);

      expect(normalWindow).toBe('medium');
      // Shorter window (2.5s) with same edits = 2x the rate -> should be high
      expect(shortWindow).toBe('high');
    });

    it('should scale thresholds for longer windows', () => {
      // Same stats in longer window should be lower severity
      const normalWindow = detector.testClassifySeverity(5, 600, 5000);
      const longWindow = detector.testClassifySeverity(5, 600, 10000);

      expect(normalWindow).toBe('medium');
      // Longer window (10s) with same edits = 0.5x the rate -> should be low
      expect(longWindow).toBe('low');
    });
  });
});

describe('BurstDetector - Rolling Window', () => {
  let mockEventLog: MockEventLog;
  let detector: TestableBurstDetector;

  beforeEach(() => {
    mockEventLog = new MockEventLog();
    detector = new TestableBurstDetector(mockEventLog, {
      thresholds: {
        windowMs: 5000,
        lowEditThreshold: 3,
        mediumEditThreshold: 5,
        highEditThreshold: 10,
        lowCharThreshold: 100,
        mediumCharThreshold: 500,
        highCharThreshold: 1000,
      },
      minEditSize: 10,
      burstCooldown: 0,
    });
    detector.setSessionId('test-session');
  });

  it('should track events within the window', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Add 3 events within window
    for (let i = 0; i < 3; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 1000,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }

    // Should have 3 events tracked
    const summary = detector.getTrackedEvents(filePath);
    expect(summary?.count).toBe(3);
    expect(summary?.totalChars).toBe(450);
  });

  it('should prune events outside the window', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Add events spanning more than the window
    detector.testAddEvent(filePath, {
      timestamp: now - 6000, // 6 seconds ago - outside window
      linesAdded: 10,
      linesRemoved: 0,
      charsChanged: 150,
      filePath,
    });

    detector.testAddEvent(filePath, {
      timestamp: now - 4000, // 4 seconds ago - inside window
      linesAdded: 10,
      linesRemoved: 0,
      charsChanged: 150,
      filePath,
    });

    detector.testAddEvent(filePath, {
      timestamp: now, // now - inside window
      linesAdded: 10,
      linesRemoved: 0,
      charsChanged: 150,
      filePath,
    });

    // Prune by triggering a check
    detector.testCheckBurst(filePath, now);

    // Should only have 2 events (oldest pruned)
    const summary = detector.getTrackedEvents(filePath);
    expect(summary?.count).toBe(2);
  });

  it('should reset empty windows', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Add event
    detector.testAddEvent(filePath, {
      timestamp: now - 10000, // Way outside window
      linesAdded: 10,
      linesRemoved: 0,
      charsChanged: 150,
      filePath,
    });

    // Force prune by checking burst
    detector.testCheckBurst(filePath, now);

    // Window should be cleared
    const summary = detector.getTrackedEvents(filePath);
    expect(summary).toBeNull();
  });

  it('should detect and emit burst when threshold exceeded', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Add 3 events that meet low threshold
    for (let i = 0; i < 3; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 1000,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }

    // Trigger burst check
    detector.testCheckBurst(filePath, now + 3000);

    // Should have emitted a BURST_FLAG event
    expect(mockEventLog.events.length).toBe(1);
    expect(mockEventLog.events[0].type).toBe('BURST_FLAG');

    const payload = mockEventLog.events[0].payload as any;
    expect(payload.severity).toBe('low');
    expect(payload.edit_count).toBe(3);
    expect(payload.char_count).toBe(450);
  });
});

describe('BurstDetector - Minimum Edit Size', () => {
  let mockEventLog: MockEventLog;
  let detector: TestableBurstDetector;

  beforeEach(() => {
    mockEventLog = new MockEventLog();
    detector = new TestableBurstDetector(mockEventLog, {
      thresholds: {
        windowMs: 5000,
        lowEditThreshold: 3,
        mediumEditThreshold: 5,
        highEditThreshold: 10,
        lowCharThreshold: 100,
        mediumCharThreshold: 500,
        highCharThreshold: 1000,
      },
      minEditSize: 50, // Set high threshold for testing
      burstCooldown: 0,
    });
    detector.setSessionId('test-session');
  });

  it('should ignore edits below minimum size', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Add small edits (below threshold)
    for (let i = 0; i < 10; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 100,
        linesAdded: 1,
        linesRemoved: 0,
        charsChanged: 10, // Below threshold
        filePath,
      });
    }

    // Check for burst - none should be emitted due to min size
    detector.testCheckBurst(filePath, now + 1000);

    // Should not emit any burst events because all edits are below min size
    // (Note: in actual operation, small edits are filtered before reaching the window)
    expect(mockEventLog.events.length).toBe(0);
  });
});

describe('BurstDetector - Cooldown', () => {
  let mockEventLog: MockEventLog;
  let detector: TestableBurstDetector;

  beforeEach(() => {
    mockEventLog = new MockEventLog();
    detector = new TestableBurstDetector(mockEventLog, {
      thresholds: {
        windowMs: 5000,
        lowEditThreshold: 3,
        mediumEditThreshold: 5,
        highEditThreshold: 10,
        lowCharThreshold: 100,
        mediumCharThreshold: 500,
        highCharThreshold: 1000,
      },
      minEditSize: 10,
      burstCooldown: 5000, // 5 second cooldown
    });
    detector.setSessionId('test-session');
  });

  it('should respect cooldown between bursts', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Trigger a burst
    for (let i = 0; i < 5; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 500,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 2500);
    expect(mockEventLog.events.length).toBe(1);

    // Try to trigger another burst immediately (during cooldown)
    for (let i = 0; i < 5; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + 3000 + i * 500,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 5500);
    // Should still be 1 (second burst suppressed by cooldown)
    expect(mockEventLog.events.length).toBe(1);

    // Wait for cooldown to expire and try again
    for (let i = 0; i < 5; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + 8000 + i * 500,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 10500);
    // Should now have 2 bursts
    expect(mockEventLog.events.length).toBe(2);
  });
});

describe('BurstDetector - Summary', () => {
  let mockEventLog: MockEventLog;
  let detector: TestableBurstDetector;

  beforeEach(() => {
    mockEventLog = new MockEventLog();
    detector = new TestableBurstDetector(mockEventLog, {
      thresholds: {
        windowMs: 5000,
        lowEditThreshold: 3,
        mediumEditThreshold: 5,
        highEditThreshold: 10,
        lowCharThreshold: 100,
        mediumCharThreshold: 500,
        highCharThreshold: 1000,
      },
      minEditSize: 10,
      burstCooldown: 0,
    });
    detector.setSessionId('test-session');
  });

  it('should track burst counts by severity', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Trigger low severity burst
    for (let i = 0; i < 3; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 1000,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 3000);

    // Trigger medium severity burst
    for (let i = 0; i < 5; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + 5000 + i * 1000,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 600,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 10000);

    const summary = detector.getSummary();
    expect(summary.total_count).toBe(2);
    expect(summary.by_severity.low).toBe(1);
    expect(summary.by_severity.medium).toBe(1);
    expect(summary.by_severity.high).toBe(0);
  });

  it('should reset statistics', () => {
    const filePath = '/test/file.ts';
    const now = Date.now();

    // Trigger some bursts
    for (let i = 0; i < 3; i++) {
      detector.testAddEvent(filePath, {
        timestamp: now + i * 1000,
        linesAdded: 10,
        linesRemoved: 0,
        charsChanged: 150,
        filePath,
      });
    }
    detector.testCheckBurst(filePath, now + 3000);

    expect(detector.getSummary().total_count).toBeGreaterThan(0);

    // Reset
    detector.reset();

    expect(detector.getSummary().total_count).toBe(0);
    expect(detector.getSummary().by_severity.low).toBe(0);
    expect(detector.getSummary().by_severity.medium).toBe(0);
    expect(detector.getSummary().by_severity.high).toBe(0);
  });
});
