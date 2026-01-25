/**
 * Checkpoint Service
 *
 * Creates file manifests and detects unverified changes between sessions.
 * Emits CHECKPOINT_CREATED and UNVERIFIED_CHANGES events.
 */

import * as fs from 'fs/promises';
import * as fsTypes from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { IEventLog } from '../storage/eventLog';
import { ICheckpointStore } from '../storage/checkpointStore';
import { IgnoreMatcher } from '../utils/ignore';
import { CheckpointManifest, FileEntry, SkippedLargeFile } from '../types/checkpoints';
import { EventType, UnverifiedChangesPayload } from '../types/events';
import { getRelativePath } from '../utils/gitRoot';

/**
 * Maximum file size to hash (2MB)
 * Files larger than this are skipped and recorded in skipped_large_files
 */
const MAX_FILE_SIZE_TO_HASH = 2 * 1024 * 1024; // 2MB

/**
 * Unverified change with LOC delta info
 *
 * Note: linesAdded and linesDeleted are populated when available from git diff --numstat,
 * but are NOT included in the UNVERIFIED_CHANGES event payload to keep the schema minimal.
 * These fields are primarily used for reporting and UI display.
 */
export interface UnverifiedChange {
  path: string;
  change_type: 'added' | 'modified' | 'deleted';
  /** Lines added (from git diff --numstat) - NOT persisted to event log */
  linesAdded?: number;
  /** Lines deleted (from git diff --numstat) - NOT persisted to event log */
  linesDeleted?: number;
}

/**
 * Checkpoint creation options
 */
export interface CheckpointOptions {
  /** Session ID for the checkpoint */
  sessionId: string;
  /** Whether to emit events (default: true) */
  emitEvents?: boolean;
}

/**
 * Extended CHECKPOINT_CREATED payload with optional skipped large files count
 */
interface CheckpointCreatedPayloadExtended {
  checkpoint_id: string;
  file_count: number;
  log_head_hash: string;
  skipped_large_files_count?: number;
}

/**
 * Checkpoint service interface
 */
export interface ICheckpointService {
  /** Create a checkpoint of current workspace state */
  createCheckpoint(options: CheckpointOptions): Promise<string>;
  /** Detect changes since last checkpoint */
  detectUnverifiedChanges(sessionId: string): Promise<UnverifiedChange[]>;
  /** Get the latest checkpoint */
  getLastCheckpoint(): Promise<string | null>;
  /** Generate manifest for current workspace state */
  generateManifest(): Promise<FileEntry[]>;
  /** Compare two manifests and return differences */
  compareManifests(previous: FileEntry[], current: FileEntry[]): UnverifiedChange[];
}

/**
 * Checkpoint service implementation
 */
export class CheckpointService implements ICheckpointService {
  private readonly eventLog: IEventLog;
  private readonly checkpointStore: ICheckpointStore;
  private readonly ignoreMatcher: IgnoreMatcher;
  private readonly gitRoot: string;
  private skippedLargeFiles: SkippedLargeFile[] = [];

  constructor(
    eventLog: IEventLog,
    checkpointStore: ICheckpointStore,
    ignoreMatcher: IgnoreMatcher,
    gitRoot: string
  ) {
    this.eventLog = eventLog;
    this.checkpointStore = checkpointStore;
    this.ignoreMatcher = ignoreMatcher;
    this.gitRoot = gitRoot;
  }

  /**
   * Create a checkpoint of current workspace state
   *
   * Generates a manifest of all tracked files with their metadata,
   * writes it to storage, and emits a CHECKPOINT_CREATED event.
   *
   * @param options - Checkpoint creation options
   * @returns The checkpoint ID
   */
  async createCheckpoint(options: CheckpointOptions): Promise<string> {
    const { sessionId, emitEvents = true } = options;

    // Clear skipped files from previous run
    this.skippedLargeFiles = [];

    // Generate manifest of all tracked files (populates skippedLargeFiles)
    const files = await this.generateManifest();

    // Get current log head hash
    const logHeadHash = await this.eventLog.getLastHash() || '';

    // Prepare checkpoint data (checkpoint_id will be added by writeCheckpoint)
    const checkpointData: Omit<CheckpointManifest, 'checkpoint_id'> = {
      created_at: new Date().toISOString(),
      log_head_hash: logHeadHash,
      files,
      session_id: sessionId,
    };

    // Include skipped large files if any
    if (this.skippedLargeFiles.length > 0) {
      checkpointData.skipped_large_files = [...this.skippedLargeFiles];
    }

    // Write checkpoint to storage
    const checkpointId = await this.checkpointStore.writeCheckpoint(checkpointData);

    // Clean up old checkpoints (keep last 10)
    await this.checkpointStore.cleanupOldCheckpoints(10);

    // Emit CHECKPOINT_CREATED event if enabled
    if (emitEvents) {
      const payload: CheckpointCreatedPayloadExtended = {
        checkpoint_id: checkpointId,
        file_count: files.length,
        log_head_hash: logHeadHash,
      };

      // Include skipped large files count in payload
      if (this.skippedLargeFiles.length > 0) {
        (payload as any).skipped_large_files_count = this.skippedLargeFiles.length;
      }

      await this.eventLog.appendEvent(
        'CHECKPOINT_CREATED',
        payload as any,
        sessionId
      );
    }

    return checkpointId;
  }

  /**
   * Detect unverified changes since last checkpoint
   *
   * Compares current workspace state to the last checkpoint.
   * If differences are found, emits a UNVERIFIED_CHANGES event.
   *
   * @param sessionId - Current session ID for event emission
   * @returns Array of unverified changes
   */
  async detectUnverifiedChanges(sessionId: string): Promise<UnverifiedChange[]> {
    const lastCheckpoint = await this.checkpointStore.getLatestCheckpoint();

    if (!lastCheckpoint) {
      // No previous checkpoint - first session, no unverified changes
      return [];
    }

    // Generate current manifest
    const currentManifest = await this.generateManifest();
    const previousManifest = lastCheckpoint.files;

    // Compare manifests
    const changes = this.compareManifests(previousManifest, currentManifest);

    // Enhance with git diff --numstat if available
    const changesWithLoc = await this.addLocDeltas(changes, lastCheckpoint);

    // Emit UNVERIFIED_CHANGES event if changes detected
    if (changesWithLoc.length > 0) {
      await this.eventLog.appendEvent(
        'UNVERIFIED_CHANGES',
        {
          changes: changesWithLoc.map((c) => ({
            path: c.path,
            change_type: c.change_type,
          })),
          last_checkpoint_id: lastCheckpoint.checkpoint_id,
        } satisfies UnverifiedChangesPayload,
        sessionId
      );
    }

    return changesWithLoc;
  }

  /**
   * Get the latest checkpoint ID
   *
   * @returns Latest checkpoint ID or null if no checkpoints exist
   */
  async getLastCheckpoint(): Promise<string | null> {
    const checkpoint = await this.checkpointStore.getLatestCheckpoint();
    return checkpoint?.checkpoint_id || null;
  }

  /**
   * Generate a manifest of all tracked files
   *
   * Scans the git root directory and creates FileEntry records
   * for all non-ignored files.
   *
   * @returns Array of file entries
   */
  async generateManifest(): Promise<FileEntry[]> {
    const files: FileEntry[] = [];

    try {
      await this.collectFiles(this.gitRoot, files);
    } catch (error) {
      // If scanning fails, return partial manifest
      console.error('Error generating manifest:', error);
    }

    // Sort by path for consistency
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Compare two manifests and return differences
   *
   * @param previous - Previous checkpoint manifest
   * @param current - Current file state
   * @returns Array of changes detected
   */
  compareManifests(previous: FileEntry[], current: FileEntry[]): UnverifiedChange[] {
    const changes: UnverifiedChange[] = [];

    // Create maps for efficient lookup
    const previousMap = new Map(previous.map((f) => [f.path, f]));
    const currentMap = new Map(current.map((f) => [f.path, f]));

    // Check for added and modified files
    for (const [path, currentFile] of currentMap) {
      const previousFile = previousMap.get(path);

      if (!previousFile) {
        changes.push({
          path,
          change_type: 'added',
        });
      } else if (previousFile.sha256 !== currentFile.sha256) {
        changes.push({
          path,
          change_type: 'modified',
        });
      }
    }

    // Check for deleted files
    for (const [path] of previousMap) {
      if (!currentMap.has(path)) {
        changes.push({
          path,
          change_type: 'deleted',
        });
      }
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Add line count deltas using git diff --numstat
   *
   * @param changes - Array of unverified changes
   * @param lastCheckpoint - The last checkpoint for comparison
   * @returns Array of changes with LOC information
   */
  private async addLocDeltas(
    changes: UnverifiedChange[],
    lastCheckpoint: CheckpointManifest
  ): Promise<UnverifiedChange[]> {
    // Try to use git diff --numstat for accurate LOC deltas
    try {
      const { execSync } = require('child_process');

      // Get git hash of last checkpoint's HEAD
      // We'll use the checkpoint timestamp to find approximate commit
      const checkpointDate = new Date(lastCheckpoint.created_at);
      const isoDate = checkpointDate.toISOString();

      // Try to get diff from working tree (uncommitted changes)
      // Using --numstat to get line additions/deletions
      const numstatOutput = execSync(
        'git diff --numstat',
        { cwd: this.gitRoot, encoding: 'utf8' }
      ) as string;

      if (numstatOutput.trim()) {
        const locMap = this.parseNumstat(numstatOutput);

        return changes.map((change) => {
          const loc = locMap.get(change.path);
          if (loc) {
            return {
              ...change,
              linesAdded: loc.added,
              linesDeleted: loc.deleted,
            };
          }
          return change;
        });
      }
    } catch (error) {
      // Git not available or other error - return changes without LOC
      console.debug('Could not get git diff --numstat:', error);
    }

    return changes;
  }

  /**
   * Parse git diff --numstat output
   *
   * Format: "added\tdeleted\tfilename"
   *
   * @param output - Raw git diff --numstat output
   * @returns Map of filename -> { added, deleted }
   */
  private parseNumstat(output: string): Map<string, { added: number; deleted: number }> {
    const result = new Map<string, { added: number; deleted: number }>();

    for (const line of output.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const added = parseInt(parts[0], 10);
        const deleted = parseInt(parts[1], 10);
        const filePath = parts[2];

        // Handle binary files (shown as "-")
        if (!isNaN(added) && !isNaN(deleted)) {
          result.set(filePath, { added, deleted });
        }
      }
    }

    return result;
  }

  /**
   * Recursively collect file entries for a directory
   *
   * @param dirPath - Directory path to scan
   * @param files - Array to collect file entries into
   */
  private async collectFiles(dirPath: string, files: FileEntry[]): Promise<void> {
    let entries: fsTypes.Dirent[] | null = null;

    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // Directory not readable, skip
      return;
    }

    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = getRelativePath(this.gitRoot, fullPath);

      // Skip ignored paths
      if (this.ignoreMatcher.ignores(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        await this.collectFiles(fullPath, files);
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath);

          // Check if file is too large to hash (>2MB)
          if (stats.size > MAX_FILE_SIZE_TO_HASH) {
            this.skippedLargeFiles.push({
              path: relativePath,
              size: stats.size,
            });
            continue;
          }

          const content = await fs.readFile(fullPath);

          files.push({
            path: relativePath,
            sha256: crypto.createHash('sha256').update(content).digest('hex'),
            size: stats.size,
            mtime: Math.floor(stats.mtimeMs / 1000),
            lineCount: this.countLines(content),
          });
        } catch {
          // File not readable, skip
          continue;
        }
      }
    }
  }

  /**
   * Count lines in a buffer
   *
   * @param content - File content buffer
   * @returns Number of lines
   */
  private countLines(content: Buffer): number {
    let count = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === 0x0a) {
        // LF newline
        count++;
      } else if (content[i] === 0x0d && i + 1 < content.length && content[i + 1] !== 0x0a) {
        // CR not followed by LF (classic Mac)
        count++;
      }
    }
    // Count last line if file doesn't end with newline
    if (content.length > 0 && content[content.length - 1] !== 0x0a && content[content.length - 1] !== 0x0d) {
      count++;
    }
    return count;
  }
}
