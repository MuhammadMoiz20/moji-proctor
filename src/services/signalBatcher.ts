/**
 * Signal Batcher Service
 *
 * Collects and batches signal events for upload to the server.
 * Implements offline buffering with persistent queue.
 * Handles deduplication, exponential backoff retry, and backpressure.
 */

import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import {
  SignalEnvelope,
  SignalType,
  BatchUploadRequest,
  BatchUploadResponse,
} from '../types/signals';
import { DeviceKeyManager } from './deviceKeyManager';
import { OnlineSignalsConfig } from '../types/config';
import { httpClient, HttpError } from '../utils/httpClient';

/**
 * Queued signal awaiting upload
 */
interface QueuedSignal extends SignalEnvelope {
  /** Timestamp when signal was queued */
  queuedAt: number;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Non-retryable error status codes
 * These should pause uploads and trigger re-auth
 */
const NON_RETRYABLE_STATUS = new Set([401, 403]);

/**
 * Upload result
 */
export interface UploadResult {
  /** Number of signals successfully uploaded */
  uploaded: number;
  /** Number of signals rejected by server */
  rejected: number;
  /** Number of signals still queued */
  remaining: number;
}

/**
 * Signal batcher options
 */
export interface SignalBatcherOptions {
  /** Maximum batch size */
  maxBatch: number;
  /** Flush interval in milliseconds */
  flushIntervalMs: number;
  /** Maximum queue size */
  maxQueue: number;
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseRetryDelayMs: number;
}

/**
 * Signal Batcher Service
 *
 * Batches signal events and uploads them to the server.
 * Maintains a persistent queue for offline support.
 */
export class SignalBatcher extends EventEmitter {
  private queue: QueuedSignal[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private backoffTimer: NodeJS.Timeout | null = null;
  private persistTimer: NodeJS.Timeout | null = null;
  private isUploading: boolean = false;
  private uploadPaused: boolean = false;
  private pauseReason: string | null = null;
  private assignmentId: string | null = null;

  // Persisted queue storage key
  private static readonly QUEUE_STORAGE_KEY = 'moji-proctor.signal.queue';
  private static readonly PAUSED_KEY = 'moji-proctor.signal.paused';
  private static readonly PERSIST_DEBOUNCE_MS = 1000; // Debounce persistence by 1s

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly deviceKeyManager: DeviceKeyManager,
    private readonly config: OnlineSignalsConfig,
    private readonly options: SignalBatcherOptions,
    private readonly getAccessToken?: () => Promise<string | null>
  ) {
    super();
    this.loadPersistedState();
  }

  /**
   * Start the batcher
   */
  start(assignmentId: string): void {
    this.assignmentId = assignmentId;
    this.startFlushTimer();
  }

  /**
   * Stop the batcher and flush remaining events
   */
  async stop(): Promise<void> {
    this.stopFlushTimer();
    this.clearBackoffTimer();
    this.clearPersistTimer();
    // Persist any pending changes
    await this.persistQueue();
    // Try one final upload
    await this.flush();
  }

  /**
   * Pause uploads (e.g., when offline)
   */
  pause(reason?: string): void {
    this.uploadPaused = true;
    this.pauseReason = reason ?? this.pauseReason;
    this.context.globalState.update(SignalBatcher.PAUSED_KEY, true);
    if (reason) {
      console.warn('[SignalBatcher] Uploads paused:', reason);
    }
  }

  /**
   * Resume uploads
   */
  resume(): void {
    this.uploadPaused = false;
    this.pauseReason = null;
    this.context.globalState.update(SignalBatcher.PAUSED_KEY, false);
    // Clear any backoff timer to allow immediate flush
    this.clearBackoffTimer();
    this.flush();
  }

  /**
   * Check if uploads are paused
   */
  isPaused(): boolean {
    return this.uploadPaused;
  }

  /**
   * Add a signal to the batch queue
   *
   * @param signal - Signal to upload
   */
  async addSignal(signal: SignalEnvelope): Promise<void> {
    if (!this.assignmentId) {
      throw new Error('SignalBatcher not started - call start() first');
    }

    // Enforce max queue size - drop oldest if needed
    if (this.queue.length >= this.options.maxQueue) {
      this.queue.shift(); // Remove oldest
      this.emit('dropped', { reason: 'queue_full' });
    }

    const queuedSignal: QueuedSignal = {
      ...signal,
      queuedAt: Date.now(),
      retryCount: 0,
    };

    this.queue.push(queuedSignal);
    this.schedulePersist();

    // Flush if we've reached batch size
    if (this.queue.length >= this.options.maxBatch) {
      this.flush();
    }
  }

  /**
   * Flush queued signals to the server
   *
   * @returns Upload result
   */
  async flush(): Promise<UploadResult> {
    // Don't upload if paused, already uploading, during backoff, or queue is empty
    if (this.isUploading || this.uploadPaused || this.backoffTimer !== null || this.queue.length === 0) {
      console.log('[SignalBatcher] Flush skipped:', {
        isUploading: this.isUploading,
        uploadPaused: this.uploadPaused,
        hasBackoffTimer: this.backoffTimer !== null,
        queueLength: this.queue.length
      });
      return { uploaded: 0, rejected: 0, remaining: this.queue.length };
    }

    console.log(`[SignalBatcher] Starting flush of ${this.queue.length} signals`);
    this.isUploading = true;

    try {
      // Take a batch of signals
      const batchSize = Math.min(this.options.maxBatch, this.queue.length);
      const batch = this.queue.splice(0, batchSize);

      // Skip signals that have exceeded max retries
      const validSignals = batch.filter(s => s.retryCount < this.options.maxRetries);
      const expiredSignals = batch.filter(s => s.retryCount >= this.options.maxRetries);

      if (expiredSignals.length > 0) {
        this.emit('expired', { count: expiredSignals.length });
      }

      if (validSignals.length === 0) {
        this.schedulePersist();
        return { uploaded: 0, rejected: 0, remaining: this.queue.length };
      }

      const startingSeq = this.assignmentId
        ? await this.deviceKeyManager.getSequenceNumber(this.assignmentId)
        : 0;

      try {
        // Prepare batch upload request
        const request = await this.prepareBatchRequest(validSignals);

        // Get access token if available
        const accessToken = this.getAccessToken ? await this.getAccessToken() : undefined;

        // Upload to server
        const response = await this.uploadToServer(request, accessToken ?? undefined);

        // Handle response
        const rejectedIds = new Set(response.rejected_ids || []);

        console.log('[SignalBatcher] Upload result:', {
          accepted: response.accepted,
          rejected: response.rejected,
          remaining: this.queue.length,
        });

        if (response.rejected > 0) {
          let firstRejectedIndex = -1;
          if (rejectedIds.size > 0) {
            for (let i = 0; i < validSignals.length; i++) {
              if (rejectedIds.has(validSignals[i].event_id)) {
                firstRejectedIndex = i;
                break;
              }
            }
          }

          let acceptedCount = Math.min(response.accepted, validSignals.length);
          if (firstRejectedIndex >= 0) {
            acceptedCount = Math.min(acceptedCount, firstRejectedIndex);
          }

          if (this.assignmentId && acceptedCount < validSignals.length) {
            await this.deviceKeyManager.setSequenceNumber(this.assignmentId, startingSeq + acceptedCount);
          }

          const rejectedStartIndex = firstRejectedIndex >= 0 ? firstRejectedIndex : acceptedCount;
          if (rejectedStartIndex >= 0 && rejectedStartIndex < validSignals.length) {
            const rejectedSignals = validSignals.slice(rejectedStartIndex);
            if (rejectedSignals.length > 0) {
              const [, ...retrySignals] = rejectedSignals;
              for (const signal of retrySignals) {
                this.queue.push(signal);
              }
              this.emit('dropped', { reason: 'server_rejected', count: 1 });
            }
          }
        }

        this.schedulePersist();

        const result: UploadResult = {
          uploaded: response.accepted,
          rejected: response.rejected,
          remaining: this.queue.length,
        };

        this.emit('uploaded', result);
        return result;

      } catch (error) {
        console.error('[SignalBatcher] Upload error caught:', error);
        const httpError = error instanceof HttpError ? error : null;

        // Check for non-retryable errors (401/403)
        if (httpError && NON_RETRYABLE_STATUS.has(httpError.status)) {
          console.error('[SignalBatcher] Upload auth error - PAUSING:', {
            status: httpError.status,
            statusText: httpError.statusText,
            message: httpError.message,
          });
          if (this.assignmentId) {
            await this.deviceKeyManager.setSequenceNumber(this.assignmentId, startingSeq);
          }
          // Pause uploads - these errors won't be fixed by retrying
          this.pause('auth_error');
          this.emit('authError', {
            status: httpError.status,
            message: httpError.message,
          });

          // Re-queue signals without incrementing retry count
          this.queue.unshift(...validSignals);
          this.schedulePersist();

          return { uploaded: 0, rejected: 0, remaining: this.queue.length };
        }

        // Retryable errors - re-queue with incremented retry count
        if (this.assignmentId) {
          await this.deviceKeyManager.setSequenceNumber(this.assignmentId, startingSeq);
        }
        for (const signal of validSignals) {
          signal.retryCount++;
          this.queue.push(signal);
        }
        this.schedulePersist();

        this.emit('uploadFailed', {
          error: error instanceof Error ? error.message : String(error),
          retryCount: validSignals[0]?.retryCount || 0,
        });

        // Exponential backoff before next retry
        const delay = this.calculateRetryDelay(validSignals[0]?.retryCount || 1);
        this.scheduleBackoffFlush(delay);

        return { uploaded: 0, rejected: 0, remaining: this.queue.length };
      }
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Flush all queued signals (drain the queue)
   *
   * @param options - Optional flush controls
   * @returns Aggregate upload result
   */
  async flushAll(options?: { force?: boolean; maxBatches?: number }): Promise<UploadResult> {
    if (options?.force) {
      this.clearBackoffTimer();
    }

    if (this.queue.length === 0) {
      return { uploaded: 0, rejected: 0, remaining: 0 };
    }

    let totalUploaded = 0;
    let totalRejected = 0;
    let lastRemaining = this.queue.length;
    const initialQueue = this.queue.length;
    const maxBatches = options?.maxBatches ?? Math.max(5, Math.ceil(initialQueue / this.options.maxBatch) + 1);

    for (let i = 0; i < maxBatches; i++) {
      const result = await this.flush();
      totalUploaded += result.uploaded;
      totalRejected += result.rejected;

      if (result.remaining === 0) {
        break;
      }

      if (result.remaining >= lastRemaining) {
        break;
      }

      lastRemaining = result.remaining;
    }

    return { uploaded: totalUploaded, rejected: totalRejected, remaining: this.queue.length };
  }

  /**
   * Get current queue size
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get current pause reason
   */
  getPauseReason(): string | null {
    return this.pauseReason;
  }

  /**
   * Prepare batch upload request with signatures
   *
   * @param signals - Signals to upload
   * @returns Batch upload request
   */
  private async prepareBatchRequest(signals: QueuedSignal[]): Promise<BatchUploadRequest> {
    if (!this.assignmentId) {
      throw new Error('Assignment ID not set');
    }

    const signedSignals = await Promise.all(
      signals.map(async (signal) => {
        // Extract ONLY the canonical signal envelope (exclude queue-only fields)
        const canonicalEnvelope: SignalEnvelope = {
          event_id: signal.event_id,
          ts: signal.ts,
          session_id: signal.session_id,
          type: signal.type,
          payload: signal.payload,
          assignment_id: signal.assignment_id,
          course_id: signal.course_id,
          commit_sha: signal.commit_sha,
          repo_identifier: signal.repo_identifier,
        };

        // Sign only the canonical envelope (not queuedAt/retryCount)
        const signature = await this.deviceKeyManager.sign(
          canonicalEnvelope,
          this.assignmentId!
        );

        return {
          ...canonicalEnvelope,  // Use canonical envelope, not the QueuedSignal
          device_pubkey: signature.device_pubkey,
          seq: signature.seq,
          sig: signature.sig,
        };
      })
    );

    return { signals: signedSignals };
  }

  /**
   * Upload batch to server
   *
   * @param request - Batch upload request
   * @returns Server response
   */
  private async uploadToServer(request: BatchUploadRequest, accessToken?: string): Promise<BatchUploadResponse> {
    const url = `${this.config.server_url}/api/events/batch`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
      // Log token info for debugging (first 20 chars only for security)
      const tokenPreview = accessToken.length > 20 ? accessToken.substring(0, 20) + '...' : accessToken;
      console.log('[SignalBatcher] Uploading with auth token:', tokenPreview, 'length:', accessToken.length);
    } else {
      console.log('[SignalBatcher] WARNING: Uploading WITHOUT auth token');
    }

    console.log(`[SignalBatcher] Uploading ${request.signals.length} signals to ${url}`);

    const response = await httpClient(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      timeout: 30000, // 30 second timeout
    });

    console.log('[SignalBatcher] Response status:', response.status, response.statusText);

    if (!response.ok) {
      const text = await response.text();
      console.error('[SignalBatcher] Upload failed response body:', text);
      // Throw HttpError for proper handling in flush()
      throw new HttpError(response.status, response.statusText, `Upload failed: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json() as Promise<BatchUploadResponse>;
  }

  /**
   * Calculate retry delay with exponential backoff
   *
   * @param retryCount - Current retry count
   * @returns Delay in milliseconds
   */
  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff: base * 2^retryCount, capped at 5 minutes
    const delay = this.options.baseRetryDelayMs * Math.pow(2, retryCount - 1);
    return Math.min(delay, 5 * 60 * 1000);
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    this.stopFlushTimer();
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.options.flushIntervalMs);
  }

  /**
   * Stop the flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Schedule a flush after backoff delay
   */
  private scheduleBackoffFlush(delayMs: number): void {
    this.clearBackoffTimer();
    this.backoffTimer = setTimeout(() => {
      this.backoffTimer = null;
      this.flush();
    }, delayMs);
  }

  /**
   * Clear the backoff timer
   */
  private clearBackoffTimer(): void {
    if (this.backoffTimer) {
      clearTimeout(this.backoffTimer);
      this.backoffTimer = null;
    }
  }

  /**
   * Load persisted queue and state from storage
   */
  private loadPersistedState(): void {
    // Load queue
    const queueData = this.context.globalState.get<QueuedSignal[]>(
      SignalBatcher.QUEUE_STORAGE_KEY,
      []
    );
    this.queue = queueData;

    // Load paused state
    this.uploadPaused = this.context.globalState.get<boolean>(
      SignalBatcher.PAUSED_KEY,
      false
    );
  }

  /**
   * Persist queue to storage
   * For immediate persistence (e.g., during shutdown)
   */
  private async persistQueue(): Promise<void> {
    this.clearPersistTimer();
    await this.context.globalState.update(SignalBatcher.QUEUE_STORAGE_KEY, this.queue);
  }

  /**
   * Schedule debounced queue persistence
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      return; // Already scheduled
    }
    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      await this.persistQueue();
    }, SignalBatcher.PERSIST_DEBOUNCE_MS);
  }

  /**
   * Clear the persistence timer
   */
  private clearPersistTimer(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }

  /**
   * Clear the queue (for testing or reset)
   */
  async clearQueue(): Promise<void> {
    this.clearPersistTimer();
    this.queue = [];
    await this.persistQueue();
  }
}

/**
 * Create default signal batcher options from config
 *
 * @param config - Online signals config
 * @returns Default options
 */
export function createDefaultBatcherOptions(config: OnlineSignalsConfig): SignalBatcherOptions {
  return {
    maxBatch: config.max_batch || 50,
    flushIntervalMs: config.flush_interval_ms || 60000,
    maxQueue: config.max_queue || 1000,
    maxRetries: 5,
    baseRetryDelayMs: 1000, // Start with 1 second
  };
}
