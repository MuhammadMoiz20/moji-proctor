/**
 * Unit tests for Event Log
 *
 * Agent 5 implementation tests:
 * - Hash chaining correctness
 * - Integrity verification (full and tail)
 * - Head hash storage/loading
 * - Break detection (tampering detection)
 * - Edge cases
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventLog, IntegrityCheckResult } from './eventLog';
import { EventType } from '../types/events';
import { sha256, canonicalStringify } from '../utils';
import { generateId } from '../utils/hash';

// Test directory for temporary log files
const TEST_DIR = '/tmp/moji-proctor-test';
const TEST_WORKSPACE = path.join(TEST_DIR, 'workspace');

describe('EventLog - Hash Chaining', () => {
  let eventLog: EventLog;

  beforeEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    // Create test workspace
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    eventLog = new EventLog(TEST_WORKSPACE);
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('basic event appending', () => {
    it('should create first event with null prev_hash', async () => {
      const sessionId = generateId();
      const event = await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);

      expect(event.prev_hash).toBeNull();
      expect(event.hash).toBeDefined();
      expect(event.hash.length).toBe(64); // SHA-256 hex length
    });

    it('should chain subsequent events with prev_hash', async () => {
      const sessionId = generateId();
      const event1 = await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);
      const event2 = await eventLog.appendEvent('TIME_TICK', { focused_delta_seconds: 60 }, sessionId);

      expect(event2.prev_hash).toBe(event1.hash);
      expect(event1.hash).not.toBe(event2.hash);
    });

    it('should compute hash correctly using canonical JSON', async () => {
      const sessionId = generateId();
      const payload = { test: 'value', nested: { key: 123 } };
      const event = await eventLog.appendEvent('TEST_EVENT', payload, sessionId);

      // Manually compute expected hash
      const eventWithoutHash = {
        event_id: event.event_id,
        ts: event.ts,
        session_id: sessionId,
        type: 'TEST_EVENT' as EventType,
        payload,
        prev_hash: null,
      };
      const expectedHash = sha256(canonicalStringify(eventWithoutHash));

      expect(event.hash).toBe(expectedHash);
    });

    it('should use stable canonical JSON for same content', async () => {
      const sessionId = generateId();
      const payload = { b: 2, a: 1 }; // Keys out of order
      const event = await eventLog.appendEvent('TEST_EVENT', payload, sessionId);

      // Canonical JSON should sort keys
      const canonical = canonicalStringify({
        event_id: event.event_id,
        ts: event.ts,
        session_id: sessionId,
        type: 'TEST_EVENT' as EventType,
        payload,
        prev_hash: null,
      });

      // Keys should be sorted: a comes before b
      expect(canonical).toMatch(/"a":1/);
      expect(canonical.indexOf('"a":1')).toBeLessThan(canonical.indexOf('"b":2'));
    });
  });

  describe('hash chain integrity', () => {
    it('should maintain correct chain across multiple events', async () => {
      const sessionId = generateId();
      const events: string[] = [];

      // Append 10 events
      for (let i = 0; i < 10; i++) {
        const event = await eventLog.appendEvent('TIME_TICK', { index: i }, sessionId);
        events.push(event.hash);
      }

      // Verify chain
      for (let i = 1; i < events.length; i++) {
        const allEvents = await eventLog.readAllEvents();
        expect(allEvents[i].prev_hash).toBe(events[i - 1]);
      }
    });

    it('should pass verification for valid chain', async () => {
      const sessionId = generateId();

      await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);
      await eventLog.appendEvent('TIME_TICK', { focused_delta_seconds: 60 }, sessionId);
      await eventLog.appendEvent('SESSION_END', { reason: 'close' }, sessionId);

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should pass verification for empty log', async () => {
      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
      expect(result.eventsChecked).toBe(0);
    });
  });
});

describe('EventLog - Break Detection', () => {
  let eventLog: EventLog;
  let logPath: string;

  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
    eventLog = new EventLog(TEST_WORKSPACE);
    logPath = eventLog.getLogPath();
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('hash tampering detection', () => {
    it('should detect modified event hash', async () => {
      const sessionId = generateId();

      await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);
      await eventLog.appendEvent('TIME_TICK', { focused_delta_seconds: 60 }, sessionId);

      // Tamper with the log by modifying the second event's hash
      const logContent = await fs.readFile(logPath, 'utf8');
      const lines = logContent.trim().split('\n');
      const secondEvent = JSON.parse(lines[1]);
      secondEvent.hash = '0'.repeat(64); // Invalid hash

      // Write tampered log
      const tamperedLog = lines[0] + '\n' + JSON.stringify(secondEvent) + '\n';
      await fs.writeFile(logPath, tamperedLog, 'utf8');

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some(i => i.includes('Hash mismatch'))).toBe(true);
      expect(eventLog.isCompromised()).toBe(true);
    });

    it('should detect broken prev_hash link', async () => {
      const sessionId = generateId();

      const event1 = await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);
      await eventLog.appendEvent('TIME_TICK', { focused_delta_seconds: 60 }, sessionId);

      // Tamper with the log by breaking the prev_hash link
      const logContent = await fs.readFile(logPath, 'utf8');
      const lines = logContent.trim().split('\n');
      const secondEvent = JSON.parse(lines[1]);
      secondEvent.prev_hash = 'invalid_hash'; // Broken link

      const tamperedLog = lines[0] + '\n' + JSON.stringify(secondEvent) + '\n';
      await fs.writeFile(logPath, tamperedLog, 'utf8');

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('prev_hash does not match'))).toBe(true);
      expect(eventLog.isCompromised()).toBe(true);
    });

    it('should detect wrong first event prev_hash', async () => {
      const sessionId = generateId();

      await eventLog.appendEvent('SESSION_START', { workspace_name: 'test' }, sessionId);

      // Tamper: first event should have null prev_hash
      const logContent = await fs.readFile(logPath, 'utf8');
      const firstEvent = JSON.parse(logContent.trim());
      firstEvent.prev_hash = 'some_hash';

      await fs.writeFile(logPath, JSON.stringify(firstEvent) + '\n', 'utf8');

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('First event should have prev_hash=null'))).toBe(true);
    });

    it('should detect missing events (gap in chain)', async () => {
      const sessionId = generateId();

      // Create 5 events
      for (let i = 0; i < 5; i++) {
        await eventLog.appendEvent('TIME_TICK', { index: i }, sessionId);
      }

      // Remove the middle event
      const logContent = await fs.readFile(logPath, 'utf8');
      const lines = logContent.trim().split('\n');
      const modifiedLog = [lines[0], lines[2], lines[3], lines[4]].join('\n') + '\n';
      await fs.writeFile(logPath, modifiedLog, 'utf8');

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(false);
      // The third line (originally 4th event) should have wrong prev_hash
      expect(result.issues.some(i => i.includes('prev_hash does not match'))).toBe(true);
    });
  });

  describe('payload tampering detection', () => {
    it('should detect modified payload', async () => {
      const sessionId = generateId();

      await eventLog.appendEvent('SESSION_START', { workspace_name: 'original' }, sessionId);

      // Modify the payload
      const logContent = await fs.readFile(logPath, 'utf8');
      const event = JSON.parse(logContent.trim());
      (event.payload as any).workspace_name = 'modified';

      await fs.writeFile(logPath, JSON.stringify(event) + '\n', 'utf8');

      const result = await eventLog.verifyChain();

      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.includes('Hash mismatch'))).toBe(true);
    });

    it('should detect reordered payload keys', async () => {
      // This tests that canonical JSON is working correctly
      const sessionId = generateId();

      await eventLog.appendEvent('TEST', { z: 1, a: 2, m: 3 }, sessionId);

      // Read and rewrite with different key order (but semantically same)
      const logContent = await fs.readFile(logPath, 'utf8');
      const event = JSON.parse(logContent.trim());

      // Recreate event with keys in different order
      const reorderedEvent = {
        ...event,
        payload: { m: 3, z: 1, a: 2 } // Different order
      };

      await fs.writeFile(logPath, JSON.stringify(reorderedEvent) + '\n', 'utf8');

      const result = await eventLog.verifyChain();

      // Canonical JSON should make this verify correctly
      // because the canonical form sorts keys
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });
});

describe('EventLog - Head Hash Storage', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should store head hash to disk', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const event = await eventLog.appendEvent('TEST', { data: 'test' }, sessionId);
    await eventLog.storeHeadHash(event.hash);

    const headHashPath = path.join(TEST_WORKSPACE, '.verified', 'log.head');
    const storedHash = await fs.readFile(headHashPath, 'utf8');

    expect(storedHash.trim()).toBe(event.hash);
  });

  it('should load head hash from disk', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const event = await eventLog.appendEvent('TEST', { data: 'test' }, sessionId);
    await eventLog.storeHeadHash(event.hash);

    const loadedHash = await eventLog.loadHeadHash();

    expect(loadedHash).toBe(event.hash);
  });

  it('should return null when head hash file does not exist', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);

    const loadedHash = await eventLog.loadHeadHash();

    expect(loadedHash).toBeNull();
  });

  it('should update head hash on subsequent events', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const event1 = await eventLog.appendEvent('TEST1', { data: 'test1' }, sessionId);
    const event2 = await eventLog.appendEvent('TEST2', { data: 'test2' }, sessionId);

    await eventLog.storeHeadHash(event1.hash);
    expect(await eventLog.loadHeadHash()).toBe(event1.hash);

    await eventLog.storeHeadHash(event2.hash);
    expect(await eventLog.loadHeadHash()).toBe(event2.hash);
    expect(await eventLog.loadHeadHash()).not.toBe(event1.hash);
  });
});

describe('EventLog - Tail Verification', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should use full verification for small logs', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    // Add fewer events than threshold
    for (let i = 0; i < 10; i++) {
      await eventLog.appendEvent('TEST', { index: i }, sessionId);
    }

    const result = await eventLog.verifyChain();

    expect(result.partial).toBe(false);
    expect(result.eventsChecked).toBe(10);
    expect(result.totalEvents).toBe(10);
  });

  it('should use tail verification for large logs', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    // Add more events than threshold (1000)
    for (let i = 0; i < 1500; i++) {
      await eventLog.appendEvent('TEST', { index: i }, sessionId);
    }

    const result = await eventLog.verifyChain();

    expect(result.partial).toBe(true);
    expect(result.eventsChecked).toBe(100); // TAIL_VERIFY_COUNT
    expect(result.totalEvents).toBe(1500);
  });

  it('should force full verification when requested', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    // Add large number of events
    for (let i = 0; i < 1500; i++) {
      await eventLog.appendEvent('TEST', { index: i }, sessionId);
    }

    const result = await eventLog.verifyChain({ forceFull: true });

    expect(result.partial).toBe(false);
    expect(result.eventsChecked).toBe(1500);
    expect(result.totalEvents).toBe(1500);
  });

  it('should detect tampering in verified tail of large log', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    // Add large number of events
    for (let i = 0; i < 1500; i++) {
      await eventLog.appendEvent('TEST', { index: i }, sessionId);
    }

    // Tamper with an event in the tail region (last 100)
    const logPath = eventLog.getLogPath();
    const logContent = await fs.readFile(logPath, 'utf8');
    const lines = logContent.trim().split('\n');
    const tailEvent = JSON.parse(lines[lines.length - 10]); // In the tail
    tailEvent.hash = '0'.repeat(64);

    const modifiedLines = [...lines];
    modifiedLines[lines.length - 10] = JSON.stringify(tailEvent);
    await fs.writeFile(logPath, modifiedLines.join('\n') + '\n', 'utf8');

    const result = await eventLog.verifyChain();

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe('EventLog - Edge Cases', () => {
  beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_WORKSPACE, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should handle empty payload', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const event = await eventLog.appendEvent('TEST', null, sessionId);

    expect(event.payload).toBeNull();
    expect(event.hash).toBeDefined();
  });

  it('should handle complex nested payload', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const complexPayload = {
      nested: {
        deeply: {
          value: [1, 2, 3],
          objects: [{ a: 1 }, { b: 2 }]
        }
      },
      primitives: {
        string: 'test',
        number: 42,
        bool: true,
        nullVal: null
      }
    };

    const event = await eventLog.appendEvent('TEST', complexPayload, sessionId);

    const result = await eventLog.verifyChain();
    expect(result.valid).toBe(true);
  });

  it('should handle special characters in payload', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    const specialPayload = {
      unicode: 'Hello 世界 🌍',
      newlines: 'line1\nline2\rline3',
      quotes: 'He said "hello"',
      tabs: 'col1\tcol2\tcol3',
      backslash: 'path\\to\\file'
    };

    const event = await eventLog.appendEvent('TEST', specialPayload, sessionId);

    const result = await eventLog.verifyChain();
    expect(result.valid).toBe(true);
  });

  it('should handle rapid successive appends', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    // Note: Event log append operations must be sequential to maintain hash chain integrity
    // Concurrent appends would cause race conditions with prev_hash
    const events: any[] = [];
    for (let i = 0; i < 100; i++) {
      const event = await eventLog.appendEvent('TEST', { index: i }, sessionId);
      events.push(event);
    }

    expect(events).toHaveLength(100);

    // Verify each event links to the previous one
    for (let i = 1; i < events.length; i++) {
      expect(events[i].prev_hash).toBe(events[i - 1].hash);
    }

    // Verify full chain integrity
    const result = await eventLog.verifyChain();
    expect(result.valid).toBe(true);
  });

  it('should reset compromised flag', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);

    // Set the flag
    (eventLog as any).compromisedFlag = true;
    expect(eventLog.isCompromised()).toBe(true);

    // Reset
    eventLog.resetCompromisedFlag();
    expect(eventLog.isCompromised()).toBe(false);
  });

  it('should get event count', async () => {
    const eventLog = new EventLog(TEST_WORKSPACE);
    const sessionId = generateId();

    expect(await eventLog.getEventCount()).toBe(0);

    for (let i = 0; i < 25; i++) {
      await eventLog.appendEvent('TEST', { index: i }, sessionId);
    }

    expect(await eventLog.getEventCount()).toBe(25);
  });
});
