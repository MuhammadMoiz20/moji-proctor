/**
 * API URL utilities
 *
 * Normalize server URLs and API base paths to avoid double slashes
 * and duplicate /api prefixes.
 */

/**
 * Normalize server URL by trimming trailing slashes.
 */
export function normalizeServerUrl(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '');
}

/**
 * Normalize API base path.
 *
 * Returns empty string for "" or "/".
 */
export function normalizeApiBasePath(apiBasePath?: string): string {
  if (!apiBasePath) {
    return '/api';
  }
  const trimmed = apiBasePath.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, '');
}

/**
 * Build the API base URL from server URL and base path.
 *
 * Avoids double-appending the base path if server URL already includes it.
 */
export function buildApiBaseUrl(serverUrl: string, apiBasePath?: string): string {
  const normalizedServer = normalizeServerUrl(serverUrl);
  const normalizedBase = normalizeApiBasePath(apiBasePath);

  if (!normalizedBase) {
    return normalizedServer;
  }

  if (normalizedServer.endsWith(normalizedBase)) {
    return normalizedServer;
  }

  return `${normalizedServer}${normalizedBase}`;
}

/**
 * Build a full API URL for a given path.
 */
export function buildApiUrl(serverUrl: string, apiBasePath: string | undefined, path: string): string {
  const base = buildApiBaseUrl(serverUrl, apiBasePath);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
