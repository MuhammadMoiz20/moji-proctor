/**
 * Utility functions for the Verified Coursework GitHub Action
 *
 * These match the implementations in the VS Code extension to ensure
 * consistent validation behavior.
 */

import { createHash } from 'crypto';

/**
 * Stringify a value to canonical JSON format
 *
 * CONTRACT FREEZE: This function MUST produce deterministic, stable JSON output.
 * - Object keys are sorted alphabetically
 * - No trailing commas
 * - No extra whitespace
 * - Arrays preserve order
 *
 * Matches src/utils/canonicalJson.ts in the extension
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer, 0);
}

/**
 * Replacer function for JSON.stringify that sorts object keys
 */
function canonicalReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    // Arrays: preserve order, recursively process elements
    return value.map((item) =>
      typeof item === 'object' && item !== null
        ? JSON.parse(canonicalStringify(item))
        : item
    );
  }

  // Objects: sort keys and recursively process values
  const sortedKeys = Object.keys(value).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = (value as Record<string, unknown>)[k];
    sortedObj[k] =
      typeof v === 'object' && v !== null
        ? JSON.parse(canonicalStringify(v))
        : v;
  }
  return sortedObj;
}

/**
 * Compute SHA-256 hash of a string
 *
 * Matches src/utils/hash.ts in the extension
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Format seconds to human-readable time string
 */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

/**
 * Format ISO date to human-readable string
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * Severity badge color mapping
 */
export function getSeverityColor(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'low':
      return 'D9F99D'; // green
    case 'medium':
      return 'FCD34D'; // yellow
    case 'high':
      return 'F87171'; // red
  }
}

/**
 * Status badge for integrity check
 */
export function getIntegrityBadge(passed: boolean): string {
  return passed
    ? '![Integrity Passed](https://img.shields.io/badge/integrity-passed-brightgreen)'
    : '![Integrity Failed](https://img.shields.io/badge/integrity-failed-red)';
}
