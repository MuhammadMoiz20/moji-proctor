/**
 * Hide .verified folder on Windows and macOS
 *
 * On Windows: uses attrib +h to set hidden attribute
 * On macOS: uses chflags hidden to set hidden flag
 * On other platforms: no-op
 *
 * The folder remains usable by git and the Action after hiding.
 * Failures are silently ignored (best-effort only).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Hide the .verified folder using platform-specific commands
 *
 * @param verifiedPath - Absolute path to the .verified folder
 * @param assignmentRoot - Absolute path to the assignment root (git root)
 * @param enabled - Whether hiding is enabled (from config)
 */
export async function hideVerifiedFolder(
  verifiedPath: string,
  assignmentRoot: string,
  enabled = true
): Promise<void> {
  if (!enabled) {
    return;
  }

  // Security: ensure the verifiedPath is within the assignment root
  const resolvedVerified = path.resolve(verifiedPath);
  const resolvedRoot = path.resolve(assignmentRoot);

  if (!resolvedVerified.startsWith(resolvedRoot + path.sep) && resolvedVerified !== resolvedRoot) {
    throw new Error(`Security: verifiedPath "${verifiedPath}" is not within assignment root "${assignmentRoot}"`);
  }

  const platform = process.platform;

  if (platform === 'win32') {
    await hideWindows(resolvedVerified);
  } else if (platform === 'darwin') {
    await hideMacOS(resolvedVerified);
  }
  // Other platforms: no-op (dot-folders are already hidden on Linux)
}

/**
 * Hide folder on Windows using attrib command
 */
async function hideWindows(folderPath: string): Promise<void> {
  try {
    // Use execFile to avoid shell injection
    await execFileAsync('attrib', ['+h', folderPath]);
  } catch (error) {
    // Silently ignore failures - this is best-effort only
    // Common failures: folder doesn't exist yet, permissions issues
  }
}

/**
 * Hide folder on macOS using chflags command
 */
async function hideMacOS(folderPath: string): Promise<void> {
  try {
    // Use execFile to avoid shell injection
    await execFileAsync('chflags', ['hidden', folderPath]);
  } catch (error) {
    // Silently ignore failures - this is best-effort only
    // Common failures: folder doesn't exist yet, filesystem doesn't support flags
  }
}

/**
 * Check if hiding is supported on current platform
 */
export function isHideSupported(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}
