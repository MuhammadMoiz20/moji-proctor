/**
 * Utility functions for the Verified Coursework GitHub Action
 *
 * These match the implementations in the VS Code extension to ensure
 * consistent validation behavior.
 */
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
export declare function canonicalStringify(value: unknown): string;
/**
 * Compute SHA-256 hash of a string
 *
 * Matches src/utils/hash.ts in the extension
 */
export declare function sha256(input: string): string;
/**
 * Format seconds to human-readable time string
 */
export declare function formatSeconds(seconds: number): string;
/**
 * Format ISO date to human-readable string
 */
export declare function formatDate(isoString: string): string;
/**
 * Severity badge color mapping
 */
export declare function getSeverityColor(severity: 'low' | 'medium' | 'high'): string;
/**
 * Status badge for integrity check
 */
export declare function getIntegrityBadge(passed: boolean): string;
