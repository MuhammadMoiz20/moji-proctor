/**
 * Validator for Verified Coursework data
 *
 * Performs:
 * - JSON Schema validation
 * - Hash chain verification
 * - Report consistency checks
 */
import type { ValidationResult, HashChainResult, CheckRunSummary, VerifiedData } from './types.js';
/**
 * Main validator class
 */
export declare class Validator {
    private verifiedPath;
    private data;
    private errors;
    private warnings;
    constructor(verifiedPath: string);
    /**
     * Load all verification data files
     */
    loadData(): ValidationResult;
    /**
     * Parse JSONL content into array of objects
     */
    private parseJsonl;
    /**
     * Validate JSON schemas
     */
    validateSchemas(): ValidationResult;
    /**
     * Verify hash chain integrity
     */
    verifyHashChain(): HashChainResult;
    /**
     * Verify report matches log data
     */
    verifyReportConsistency(): ValidationResult;
    /**
     * Generate a comprehensive check run summary
     */
    generateSummary(): CheckRunSummary;
    /**
     * Get the loaded data
     */
    getData(): VerifiedData;
    /**
     * Get errors
     */
    getErrors(): string[];
    /**
     * Get warnings
     */
    getWarnings(): string[];
    /**
     * Get the last log hash from the event chain
     */
    getLastLogHash(): string | null;
}
