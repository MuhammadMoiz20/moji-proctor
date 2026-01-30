import { describe, it, expect, afterEach } from 'vitest';
import { AuthService } from './authService';

function createMockContext() {
  const secrets = new Map<string, string>();
  const globalState = new Map<string, any>();

  return {
    secrets: {
      get: async (key: string) => secrets.get(key),
      store: async (key: string, value: string) => {
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        secrets.delete(key);
      },
    },
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

describe('AuthService - SecretStorage', () => {
  afterEach(() => {
    // no-op cleanup
  });

  it('stores tokens in SecretStorage', async () => {
    const context = createMockContext();
    const service = new AuthService(context, 'http://localhost:3000');

    await (service as any).storeTokens({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 60,
      user: { id: '1', login: 'octo' },
    });

    expect(await context.secrets.get('moji-proctor.auth.access_token')).toBe('access-token');
    expect(await context.secrets.get('moji-proctor.auth.refresh_token')).toBe('refresh-token');
    expect(context.globalState.get('moji-proctor.auth.user_info')).toEqual({ id: '1', login: 'octo' });

    service.dispose();
  });
});
