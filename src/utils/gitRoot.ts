/**
 * Git root detection utility
 *
 * Finds the .git directory root for a workspace.
 * Critical for determining relative paths in checkpoints and events.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Error thrown when git root cannot be found
 */
export class GitRootNotFoundError extends Error {
  constructor(startPath: string) {
    super(`Git root not found starting from: ${startPath}`);
    this.name = 'GitRootNotFoundError';
  }
}

/**
 * Find the git repository root directory
 *
 * Searches upward from startPath until finding a .git directory.
 *
 * @param startPath - Directory to start searching from
 * @returns Absolute path to git root
 * @throws GitRootNotFoundError if .git directory not found
 */
export function findGitRoot(startPath: string): string {
  let currentPath = path.resolve(startPath);

  // Prevent infinite loop
  const maxIterations = 100;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const gitDir = path.join(currentPath, '.git');

    // Check if .git exists (could be file or directory for git worktrees)
    if (fs.existsSync(gitDir)) {
      return currentPath;
    }

    // Move up one directory
    const parentPath = path.dirname(currentPath);

    // Reached filesystem root
    if (parentPath === currentPath) {
      throw new GitRootNotFoundError(startPath);
    }

    currentPath = parentPath;
  }

  throw new GitRootNotFoundError(startPath);
}

/**
 * Find git root asynchronously
 *
 * @param startPath - Directory to start searching from
 * @returns Promise resolving to absolute path of git root
 * @throws GitRootNotFoundError if .git directory not found
 */
export async function findGitRootAsync(startPath: string): Promise<string> {
  return findGitRoot(startPath);
}

/**
 * Get relative path from git root to a file
 *
 * @param gitRoot - Absolute path to git root
 * @param filePath - Absolute path to file
 * @returns Relative path from git root
 */
export function getRelativePath(gitRoot: string, filePath: string): string {
  const resolvedGitRoot = path.resolve(gitRoot);
  const resolvedFilePath = path.resolve(filePath);
  return path.relative(resolvedGitRoot, resolvedFilePath);
}

/**
 * Check if a path is within a git repository
 *
 * @param startPath - Path to check
 * @returns true if .git directory found in path or ancestors
 */
export function isInGitRepository(startPath: string): boolean {
  try {
    findGitRoot(startPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Git repository info
 */
export interface GitInfo {
  /** Absolute path to git root */
  root: string;
  /** Repository name (basename of root) */
  name: string;
}

/**
 * Get comprehensive git repository info
 *
 * @param startPath - Directory to start searching from
 * @returns GitInfo with root path and repository name
 * @throws GitRootNotFoundError if .git directory not found
 */
export function getGitInfo(startPath: string): GitInfo {
  const root = findGitRoot(startPath);
  return {
    root,
    name: path.basename(root),
  };
}
