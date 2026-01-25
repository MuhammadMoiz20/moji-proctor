/**
 * Checkpoint Storage Service
 *
 * Manages reading/writing checkpoint manifests in .verified/checkpoints/
 *
 * To be fully implemented by another agent.
 * This scaffold provides the interface and basic structure.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { CheckpointManifest } from '../types/checkpoints';
import { generateId } from '../utils/hash';

/**
 * Checkpoint directory within .verified
 */
export const CHECKPOINT_DIR = '.verified/checkpoints';

/**
 * Checkpoint store interface
 */
export interface ICheckpointStore {
  /** Write a checkpoint manifest */
  writeCheckpoint(manifest: Omit<CheckpointManifest, 'checkpoint_id'>): Promise<string>;
  /** Read a checkpoint by ID */
  readCheckpoint(checkpointId: string): Promise<CheckpointManifest | null>;
  /** List all checkpoints */
  listCheckpoints(): Promise<CheckpointManifest[]>;
  /** Get the latest checkpoint */
  getLatestCheckpoint(): Promise<CheckpointManifest | null>;
  /** Delete old checkpoints (keep last N) */
  cleanupOldCheckpoints(keepCount: number): Promise<void>;
}

/**
 * Checkpoint store implementation (stub)
 */
export class CheckpointStore implements ICheckpointStore {
  private readonly checkpointDir: string;
  private readonly workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.checkpointDir = path.join(workspaceRoot, CHECKPOINT_DIR);
  }

  async writeCheckpoint(
    manifest: Omit<CheckpointManifest, 'checkpoint_id'>
  ): Promise<string> {
    await this.ensureCheckpointDir();

    const checkpointId = generateId();
    const fullManifest: CheckpointManifest = {
      ...manifest,
      checkpoint_id: checkpointId,
    };

    const filePath = this.getCheckpointPath(checkpointId);
    await fs.writeFile(filePath, JSON.stringify(fullManifest, null, 2), 'utf8');

    return checkpointId;
  }

  async readCheckpoint(checkpointId: string): Promise<CheckpointManifest | null> {
    try {
      const filePath = this.getCheckpointPath(checkpointId);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content) as CheckpointManifest;
    } catch {
      return null;
    }
  }

  async listCheckpoints(): Promise<CheckpointManifest[]> {
    try {
      const entries = await fs.readdir(this.checkpointDir);
      const checkpoints: CheckpointManifest[] = [];

      for (const entry of entries) {
        if (entry.endsWith('.json')) {
          const filePath = path.join(this.checkpointDir, entry);
          const content = await fs.readFile(filePath, 'utf8');
          checkpoints.push(JSON.parse(content) as CheckpointManifest);
        }
      }

      // Sort by creation time
      return checkpoints.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    } catch {
      return [];
    }
  }

  async getLatestCheckpoint(): Promise<CheckpointManifest | null> {
    const checkpoints = await this.listCheckpoints();
    if (checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  async cleanupOldCheckpoints(keepCount: number): Promise<void> {
    const checkpoints = await this.listCheckpoints();

    if (checkpoints.length <= keepCount) {
      return;
    }

    const toDelete = checkpoints.slice(0, checkpoints.length - keepCount);

    for (const checkpoint of toDelete) {
      try {
        const filePath = this.getCheckpointPath(checkpoint.checkpoint_id);
        await fs.unlink(filePath);
      } catch {
        // Ignore errors
      }
    }
  }

  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.checkpointDir, `checkpoint-${checkpointId}.json`);
  }

  private async ensureCheckpointDir(): Promise<void> {
    try {
      await fs.mkdir(this.checkpointDir, { recursive: true });
    } catch {
      // Ignore if already exists
    }
  }
}
