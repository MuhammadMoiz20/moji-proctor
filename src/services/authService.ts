/**
 * Authentication Service
 *
 * Handles GitHub OAuth Device Flow for authentication.
 * Manages access tokens and refresh tokens.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { httpClient, HttpError, TimeoutError } from '../utils/httpClient';

/**
 * Storage keys - using SecretStorage for sensitive data
 */
const ACCESS_TOKEN_KEY = 'moji-proctor.auth.access_token';
const REFRESH_TOKEN_KEY = 'moji-proctor.auth.refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'moji-proctor.auth.expires_at'; // Non-sensitive, stores timestamp
const USER_INFO_KEY = 'moji-proctor.auth.user_info'; // Non-sensitive

/**
 * GitHub Device Flow - Start Response
 */
export interface DeviceFlowStartResponse {
  /** Device code for user to enter */
  device_code: string;
  /** User code for verification */
  user_code: string;
  /** Verification URL */
  verification_uri: string;
  /** URL with user_code pre-filled */
  verification_uri_complete: string;
  /** Seconds before device_code expires */
  expires_in: number;
  /** Polling interval in seconds */
  interval: number;
}

/**
 * Token response from server
 */
export interface TokenResponse {
  /** Access token (JWT) */
  access_token: string;
  /** Refresh token */
  refresh_token: string;
  /** Seconds until token expires */
  expires_in: number;
  /** User info */
  user?: {
    id: string;
    login: string;
    name?: string;
    email?: string;
  };
}

/**
 * User info
 */
export interface UserInfo {
  id: string;
  login: string;
  name?: string;
  email?: string;
}

/**
 * Authentication status
 */
export interface AuthStatus {
  /** Whether user is authenticated */
  authenticated: boolean;
  /** User info if authenticated */
  user?: UserInfo;
  /** Whether token needs refresh */
  needsRefresh: boolean;
}

/**
 * Authentication Service
 *
 * Manages OAuth flow and token lifecycle.
 */
export class AuthService {
  private state: 'idle' | 'pending' | 'authenticated' = 'idle';
  private tokenRefreshTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly serverUrl: string
  ) {
    this.loadTokens();
    this.startTokenRefreshTimer();
  }

  /**
   * Get current authentication status
   */
  async getStatus(): Promise<AuthStatus> {
    const accessToken = await this.context.secrets.get(ACCESS_TOKEN_KEY);
    const expiresAt = this.context.globalState.get<number>(TOKEN_EXPIRES_AT_KEY, 0);
    const user = this.context.globalState.get<UserInfo | undefined>(USER_INFO_KEY);

    const now = Date.now();
    const authenticated = !!accessToken && now < expiresAt;
    const needsRefresh = authenticated && now >= expiresAt - 5 * 60 * 1000; // 5 min before expiry

    // Debug logging for auth status
    if (accessToken) {
      const timeUntilExpiry = Math.round((expiresAt - now) / 1000);
      console.log('[AuthService] Status check:', {
        hasToken: true,
        tokenLength: accessToken.length,
        expiresAt: new Date(expiresAt).toISOString(),
        timeUntilExpirySec: timeUntilExpiry,
        authenticated,
        needsRefresh,
      });
    }

    return {
      authenticated,
      user,
      needsRefresh,
    };
  }

  /**
   * Get the current access token
   *
   * @returns Access token or null if not authenticated
   */
  async getAccessToken(): Promise<string | null> {
    const status = await this.getStatus();
    console.log('[AuthService] getAccessToken status:', { 
      authenticated: status.authenticated, 
      needsRefresh: status.needsRefresh,
      user: status.user?.login 
    });

    if (!status.authenticated) {
      console.log('[AuthService] Not authenticated, returning null');
      return null;
    }

    if (status.needsRefresh) {
      console.log('[AuthService] Token needs refresh, refreshing...');
      try {
        await this.refreshAccessToken();
        console.log('[AuthService] Token refreshed successfully');
      } catch (error) {
        console.error('[AuthService] Token refresh failed:', error);
        return null;
      }
    }

    const token = await this.context.secrets.get(ACCESS_TOKEN_KEY);
    if (!token) {
      console.error('[AuthService] Token is null/undefined after status check!');
      return null;
    }
    
    console.log('[AuthService] Returning token, length:', token.length);
    return token;
  }

  /**
   * Sign in using GitHub Device Flow
   *
   * @param progressCallback - Optional callback for progress updates
   * @returns User info on success
   */
  async signIn(progressCallback?: (message: string) => void): Promise<UserInfo> {
    const status = await this.getStatus();
    if (status.authenticated) {
      const user = this.context.globalState.get<UserInfo>(USER_INFO_KEY);
      if (user) return user;
    }

    this.state = 'pending';

    try {
      // Step 1: Start device flow
      progressCallback?.('Initializing authentication...');
      const deviceFlow = await this.startDeviceFlow();

      // Step 2: Show user code and instructions
      progressCallback?.(`Please enter code ${deviceFlow.user_code} at github.com`);
      await this.showDeviceCodePrompt(deviceFlow);

      // Step 3: Poll for authorization
      progressCallback?.('Waiting for authorization...');
      const tokens = await this.pollForAuthorization(deviceFlow);

      // Step 4: Store tokens
      await this.storeTokens(tokens);

      this.state = 'authenticated';
      this.emit('signedIn', tokens.user);

      return tokens.user!;
    } catch (error) {
      this.state = 'idle';
      throw error;
    }
  }

  /**
   * Sign out and clear tokens
   * Also revokes refresh token on server
   */
  async signOut(): Promise<void> {
    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);

    // Try to revoke on server (best effort)
    if (refreshToken) {
      try {
        await httpClient(`${this.serverUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
          timeout: 5000,
        });
      } catch {
        // Ignore logout errors - local cleanup is more important
      }
    }

    // Clear local storage
    await this.context.secrets.delete(ACCESS_TOKEN_KEY);
    await this.context.secrets.delete(REFRESH_TOKEN_KEY);
    await this.context.globalState.update(TOKEN_EXPIRES_AT_KEY, undefined);
    await this.context.globalState.update(USER_INFO_KEY, undefined);

    this.state = 'idle';
    this.emit('signedOut');
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    const refreshToken = await this.context.secrets.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await httpClient(`${this.serverUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
        timeout: 10000,
      });

      const tokens = (await response.json()) as TokenResponse;
      await this.storeTokens(tokens);
    } catch (error) {
      // If refresh fails, sign out
      await this.signOut();
      throw error;
    }
  }

  /**
   * Start the GitHub Device Flow
   */
  private async startDeviceFlow(): Promise<DeviceFlowStartResponse> {
    const response = await httpClient(`${this.serverUrl}/api/auth/device/start`, {
      method: 'POST',
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`Failed to start device flow: ${response.status}`);
    }

    return response.json() as Promise<DeviceFlowStartResponse>;
  }

  /**
   * Poll for authorization completion
   */
  private async pollForAuthorization(
    deviceFlow: DeviceFlowStartResponse
  ): Promise<TokenResponse> {
    const startTime = Date.now();
    const expiresAt = startTime + deviceFlow.expires_in * 1000;
    const interval = deviceFlow.interval * 1000;

    while (Date.now() < expiresAt) {
      const response = await httpClient(`${this.serverUrl}/api/auth/device/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceFlow.device_code }),
        timeout: 15000,
      });

      if (response.ok) {
        return response.json() as Promise<TokenResponse>;
      }

      const error = await response.json().catch(() => ({})) as { error?: string };

      if (error.error === 'authorization_pending') {
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, interval));
        continue;
      }

      if (error.error === 'slow_down') {
        // Slow down - increase interval
        await new Promise(resolve => setTimeout(resolve, interval * 2));
        continue;
      }

      if (error.error === 'expired_token' || error.error === 'access_denied') {
        throw new Error(`Authorization failed: ${error.error}`);
      }

      // Unknown error - retry after interval
      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Authorization timed out');
  }

  /**
   * Show the device code prompt to the user
   */
  private async showDeviceCodePrompt(deviceFlow: DeviceFlowStartResponse): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      `Sign in to Moji Proctor

Your code is: ${deviceFlow.user_code}

1. Go to ${deviceFlow.verification_uri}
2. Enter the code to authorize`,
      { modal: true },
      'Open Browser', 'Copy Code', 'Close'
    );

    switch (result) {
      case 'Open Browser':
        await vscode.env.openExternal(vscode.Uri.parse(deviceFlow.verification_uri_complete));
        break;
      case 'Copy Code':
        await vscode.env.clipboard.writeText(deviceFlow.user_code);
        vscode.window.showInformationMessage('Code copied to clipboard');
        break;
    }
  }

  /**
   * Store tokens from server response
   * Sensitive tokens go to SecretStorage, user info to globalState
   */
  private async storeTokens(tokens: TokenResponse): Promise<void> {
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    await this.context.secrets.store(ACCESS_TOKEN_KEY, tokens.access_token);
    await this.context.secrets.store(REFRESH_TOKEN_KEY, tokens.refresh_token);
    await this.context.globalState.update(TOKEN_EXPIRES_AT_KEY, expiresAt);
    await this.context.globalState.update(USER_INFO_KEY, tokens.user);
  }

  /**
   * Load tokens on initialization
   * Note: This is sync on init, actual token retrieval uses secrets.get()
   */
  private loadTokens(): void {
    // We can't access secrets synchronously, so set state based on globalState hint
    // Actual validation happens in async getStatus()
    const expiresAt = this.context.globalState.get<number>(TOKEN_EXPIRES_AT_KEY, 0);
    const hasTokenHint = expiresAt > Date.now();
    this.state = hasTokenHint ? 'authenticated' : 'idle';
  }

  /**
   * Start token refresh timer
   * Checks every minute if token needs refresh
   */
  private startTokenRefreshTimer(): void {
    this.tokenRefreshTimer = setInterval(async () => {
      const status = await this.getStatus();
      if (status.authenticated && status.needsRefresh) {
        try {
          await this.refreshAccessToken();
        } catch {
          // Error already handled in refreshAccessToken
        }
      }
    }, 60 * 1000); // Check every minute
  }

  /**
   * Stop token refresh timer
   */
  private stopTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearInterval(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * Emit an event (simple event emitter)
   */
  private emit(event: 'signedIn' | 'signedOut', data?: unknown): void {
    // VS Code commands can be used for events
    const eventName = event === 'signedIn' ? 'mojiProctor.signedIn' : 'mojiProctor.signedOut';
    vscode.commands.executeCommand(eventName, data);
  }

  /**
   * Cleanup on deactivate
   */
  dispose(): void {
    this.stopTokenRefreshTimer();
  }
}

/**
 * Create an auth service instance
 *
 * @param context - Extension context
 * @param serverUrl - Server URL
 * @returns Auth service instance
 */
export function createAuthService(
  context: vscode.ExtensionContext,
  serverUrl: string
): AuthService {
  return new AuthService(context, serverUrl);
}
