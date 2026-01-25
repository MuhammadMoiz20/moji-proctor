/**
 * Assignment Metadata Loader
 *
 * Reads .verified/assignment.json for assignment configuration.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { AssignmentMetadata } from '../types/report';

/**
 * Path to assignment metadata within .verified directory
 */
export const ASSIGNMENT_PATH = '.verified/assignment.json';

/**
 * Read assignment metadata from workspace
 *
 * @param gitRoot - Absolute path to git root
 * @returns Assignment metadata or null if not found
 */
export async function readAssignmentMetadata(
  gitRoot: string
): Promise<AssignmentMetadata | null> {
  try {
    const filePath = path.join(gitRoot, ASSIGNMENT_PATH);
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content) as AssignmentMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if assignment metadata exists
 *
 * @param gitRoot - Absolute path to git root
 * @returns true if assignment.json exists
 */
export async function hasAssignmentMetadata(gitRoot: string): Promise<boolean> {
  const metadata = await readAssignmentMetadata(gitRoot);
  return metadata !== null;
}
