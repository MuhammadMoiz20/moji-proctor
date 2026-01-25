/**
 * SHA-256 hash utilities
 *
 * CONTRACT FREEZE: This module provides consistent SHA-256 hashing.
 * Used for event hash chaining and file integrity verification.
 *
 * Any change to hash output format breaks hash chain verification.
 *
 * See .verified-dev/CONTRACTS.md
 */

import * as crypto from 'crypto';

/**
 * Compute SHA-256 hash of a string
 *
 * @param input - String to hash
 * @returns Hexadecimal SHA-256 hash (lowercase, 64 characters)
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Compute SHA-256 hash of a Buffer
 *
 * @param buffer - Buffer to hash
 * @returns Hexadecimal SHA-256 hash (lowercase, 64 characters)
 */
export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA-256 hash of a file
 *
 * @param filePath - Absolute path to file
 * @returns Hexadecimal SHA-256 hash (lowercase, 64 characters)
 * @throws Error if file cannot be read
 */
export async function sha256File(filePath: string): Promise<string> {
  const crypto = require('crypto');
  const fs = require('fs').promises;

  const content = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Compute SHA-256 hash synchronously for a file
 *
 * @param filePath - Absolute path to file
 * @returns Hexadecimal SHA-256 hash (lowercase, 64 characters)
 * @throws Error if file cannot be read
 */
export function sha256FileSync(filePath: string): string {
  const crypto = require('crypto');
  const fs = require('fs');

  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a UUID v4
 *
 * @returns UUID v4 string
 */
export function generateId(): string {
  return crypto.randomUUID();
}
