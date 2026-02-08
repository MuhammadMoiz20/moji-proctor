import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SignalBatcher, createDefaultBatcherOptions } from './signalBatcher';
import { DeviceKeyManager } from './deviceKeyManager';
import { OnlineSignalsConfig } from '../types/config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const { httpClientMock } = vi.hoisted(() => ({
  httpClientMock: vi.fn(),
}));

vi.mock('../utils/httpClient', () => {
  class MockHttpError extends Error {
    constructor(public status: number, public statusText: string, message: string) {
      super(message);
      this.name = 'HttpError';
    }
  }

  return {
    httpClient: (...args: any[]) => httpClientMock(...args),
    HttpError: MockHttpError,
  };
});

function createMockContext(tmpDir: string) {
  const globalState = new Map<string, any>();
  return {
    globalStorageUri: { fsPath: tmpDir },
    globalState: {
      get: <T>(key: string, defaultValue?: T) => {
        if (globalState.has(key)) {
          return globalState.get(key) as T;
        }
        return defaultValue as T;
      },
      update: async (key: string, value: any) => {
        if (value === undefined) {
          globalState.delete(key);
        } else {
          globalState.set(key, value);
        }
      },
    },
  } as any;
}

function createSecretStorage() {
  const secrets = new Map<string, string>();
  return {
    get: async (key: string) => secrets.get(key),
    store: async (key: string, value: string) => {
      secrets.set(key, value);
    },
    delete: async (key: string) => {
      secrets.delete(key);
    },
  };
}

describe('SignalBatcher - HTTP Client and Auth Errors', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moji-proctor-batcher-'));
    httpClientMock.mockReset();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if ((globalThis as any).fetch) {
      delete (globalThis as any).fetch;
    }
  });

  it('uses httpClient for uploads (no fetch)', async () => {
    const context = createMockContext(tmpDir);
    const deviceKeyManager = new DeviceKeyManager(createSecretStorage());
    await deviceKeyManager.initialize();

    const config: OnlineSignalsConfig = {
      enabled: true,
      server_url: 'http://localhost:3000',
      api_base_path: '/api',
    };
    const options = createDefaultBatcherOptions(config);
    const batcher = new SignalBatcher(context, deviceKeyManager, config, options);
    await batcher.start('assignment-1');

    const signal = {
      event_id: 'event-1',
      ts: new Date().toISOString(),
      session_id: 'session-1',
      type: 'SESSION_START' as const,
      payload: { workspace_name: 'test' },
      assignment_id: 'assignment-1',
      course_id: undefined,
      commit_sha: undefined,
      repo_identifier: undefined,
    };

    httpClientMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ accepted: 1, rejected: 0, rejected_ids: [] }),
      text: async () => '',
      headers: {},
    });

    (globalThis as any).fetch = vi.fn();

    await batcher.addSignal(signal);
    await batcher.flush();

    expect(httpClientMock).toHaveBeenCalled();
    expect((globalThis as any).fetch).not.toHaveBeenCalled();

    await batcher.stop();
  });

  it('pauses on 401/403 and emits authError', async () => {
    const context = createMockContext(tmpDir);
    const deviceKeyManager = new DeviceKeyManager(createSecretStorage());
    await deviceKeyManager.initialize();

    const config: OnlineSignalsConfig = {
      enabled: true,
      server_url: 'http://localhost:3000',
      api_base_path: '/api',
    };
    const options = createDefaultBatcherOptions(config);
    const batcher = new SignalBatcher(context, deviceKeyManager, config, options);
    await batcher.start('assignment-1');

    const signal = {
      event_id: 'event-2',
      ts: new Date().toISOString(),
      session_id: 'session-2',
      type: 'SESSION_START' as const,
      payload: { workspace_name: 'test' },
      assignment_id: 'assignment-1',
      course_id: undefined,
      commit_sha: undefined,
      repo_identifier: undefined,
    };

    httpClientMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({}),
      text: async () => 'Unauthorized',
      headers: {},
    });

    const authErrorHandler = vi.fn();
    batcher.on('authError', authErrorHandler);

    await batcher.addSignal(signal);
    await batcher.flush();

    expect(batcher.isPaused()).toBe(true);
    expect(batcher.getPauseReason()).toBe('auth_error');
    expect(authErrorHandler).toHaveBeenCalled();

    await batcher.stop();
  });
});
