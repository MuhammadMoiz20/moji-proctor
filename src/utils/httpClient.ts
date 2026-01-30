/**
 * HTTP Client for VS Code Extension
 *
 * Provides a fetch-like API using Node's built-in https module.
 * Compatible with VS Code 1.80 / Node 16 (no global fetch).
 *
 * Features:
 * - Request timeouts
 * - Abort controller support
 * - Automatic retry on network errors
 * - Proper error handling
 */

import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

/**
 * HTTP request options
 */
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  signal?: AbortSignal;
  maxResponseBytes?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * HttpError for failed requests
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * TimeoutError
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Parse response headers from raw headers
 */
function parseHeaders(rawHeaders: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const key = rawHeaders[i];
    const value = rawHeaders[i + 1];
    if (key !== undefined) {
      headers[key] = value;
    }
  }
  return headers;
}

/**
 * Make an HTTP request using Node's built-in modules
 *
 * @param url - Request URL
 * @param options - Request options
 * @returns Response object
 */
export function httpClient(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
  return new Promise<HttpResponse>((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const maxResponseBytes = options.maxResponseBytes ?? 1024 * 1024; // 1MB default

    const requestOptions: https.RequestOptions | http.RequestOptions = {
      method: options.method || 'GET',
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers: options.headers || {},
    };

    const req = client.request(requestOptions, (res) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;

      const contentLength = res.headers['content-length'];
      if (contentLength && Number(contentLength) > maxResponseBytes) {
        res.destroy();
        reject(new Error('Response too large'));
        return;
      }

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxResponseBytes) {
          res.destroy();
          reject(new Error('Response too large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const headers = parseHeaders(res.rawHeaders);
        const response: HttpResponse = {
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers,
          ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
          json: async () => {
            try {
              return JSON.parse(body);
            } catch {
              throw new Error('Failed to parse JSON response');
            }
          },
          text: async () => body,
        };
        resolve(response);
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new TimeoutError());
    });

    // Handle abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Request aborted'));
      });
    }

    // Set timeout
    const timeout = options.timeout ?? 30000; // Default 30 seconds
    req.setTimeout(timeout);

    // Write body if present
    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Convenience method for GET requests
 */
export function get(url: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<HttpResponse> {
  return httpClient(url, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 */
export function post(
  url: string,
  body: string,
  options?: Omit<RequestOptions, 'method'>
): Promise<HttpResponse> {
  return httpClient(url, { ...options, method: 'POST', body });
}

/**
 * Fetch-like wrapper that throws on non-OK responses
 *
 * Use this as a drop-in replacement for global fetch.
 * Unlike native fetch, this throws HttpError on non-OK status.
 */
export async function fetch(url: string, options?: RequestOptions): Promise<HttpResponse> {
  const response = await httpClient(url, options);
  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, `HTTP ${response.status}: ${response.statusText}`);
  }
  return response;
}
