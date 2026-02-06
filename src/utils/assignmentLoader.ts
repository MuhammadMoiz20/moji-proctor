/**
 * Assignment Metadata Loader
 *
 * Reads .verified/assignment.json for assignment configuration.
 * Auto-generates it from moji-proctor.config.json if missing.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { AssignmentMetadata } from '../types/report';
import { MojiProctorConfig } from '../types/config';

/**
 * Path to assignment metadata within .verified directory
 */
export const ASSIGNMENT_PATH = '.verified/assignment.json';

/**
 * Directory for verified artifacts
 */
export const VERIFIED_DIR = '.verified';

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
 * Write assignment metadata to .verified/assignment.json
 *
 * @param gitRoot - Absolute path to git root
 * @param metadata - Assignment metadata to write
 */
export async function writeAssignmentMetadata(
  gitRoot: string,
  metadata: AssignmentMetadata
): Promise<void> {
  const verifiedDir = path.join(gitRoot, VERIFIED_DIR);
  const filePath = path.join(gitRoot, ASSIGNMENT_PATH);
  
  // Ensure .verified directory exists
  await fs.mkdir(verifiedDir, { recursive: true });
  
  // Write assignment metadata
  await fs.writeFile(
    filePath,
    JSON.stringify(metadata, null, 2) + '\n',
    'utf8'
  );
}

/**
 * Get or create assignment metadata, auto-generating from config if needed
 *
 * @param gitRoot - Absolute path to git root
 * @param config - Moji Proctor configuration from moji-proctor.config.json
 * @returns Assignment metadata or null if assignment_id not configured
 */
export async function getOrCreateAssignmentMetadata(
  gitRoot: string,
  config: MojiProctorConfig | null
): Promise<AssignmentMetadata | null> {
  // Try to read existing assignment.json
  const existing = await readAssignmentMetadata(gitRoot);
  if (existing) {
    return existing;
  }
  
  // If not found, try to generate from config
  if (!config?.assignment_id) {
    return null;
  }
  
  // Generate assignment metadata from config
  const metadata: AssignmentMetadata = {
    assignment_id: config.assignment_id,
    assignment_name: config.course_id 
      ? `${config.course_id} - ${config.assignment_id}`
      : config.assignment_id,
    created_at: new Date().toISOString(),
  };
  
  // Write it to .verified/assignment.json
  await writeAssignmentMetadata(gitRoot, metadata);
  
  return metadata;
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
