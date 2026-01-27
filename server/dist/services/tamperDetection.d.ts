/**
 * Tamper Detection Service
 *
 * Detects data tampering by tracking client state across submissions.
 * Primarily detects .verified folder deletion by monitoring checkpoint continuity.
 */
import { PrismaClient } from '@prisma/client';
export type TamperType = 'checkpoint_reset' | 'sequence_gap' | 'state_mismatch' | 'missing_checkpoint';
export interface CheckpointState {
    lastCheckpointId: string | null;
    stateHash: string;
    seq: number;
    sessionCount: number;
    totalFocusedSeconds: number;
    hasDiscontinuity: boolean;
}
export interface TamperDetectionResult {
    isTampered: boolean;
    tamperType?: TamperType;
    description?: string;
    updatedState?: CheckpointState;
    previousCheckpointId?: string | null;
}
/**
 * Calculate a cumulative state hash from signal data
 * This hash represents the fingerprint of all data seen so far
 */
export declare function calculateStateHash(previousHash: string, signalData: {
    eventId: string;
    type: string;
    timestamp: string;
    seq: number;
    checkpointId?: string | null;
}): string;
/**
 * Get the current checkpoint state for a device+assignment
 */
export declare function getCheckpointState(prisma: PrismaClient, deviceId: string, assignmentId: string): Promise<CheckpointState | null>;
/**
 * Detect tampering by comparing incoming signal with previous state
 *
 * Key detection scenarios:
 * 1. Checkpoint reset: Client had a checkpoint before, now sends null (likely .verified folder deleted)
 * 2. Checkpoint mismatch: Client sends a new checkpoint without referencing the previous one
 * 3. State mismatch: Cumulative data doesn't match what we expect
 */
export declare function detectTampering(prisma: PrismaClient, deviceId: string, assignmentId: string, signalData: {
    eventId: string;
    type: string;
    timestamp: string;
    seq: number;
    sessionId: string;
    checkpointId?: string | null;
}, payload?: any): Promise<TamperDetectionResult>;
/**
 * Update the checkpoint state after processing a signal
 */
export declare function updateCheckpointState(prisma: PrismaClient, deviceId: string, assignmentId: string, state: CheckpointState): Promise<void>;
/**
 * Create a tamper flag record
 */
export declare function createTamperFlag(prisma: PrismaClient, deviceId: string, assignmentId: string, type: TamperType, description: string, detectedAtSeq: number, signalId?: string | null, previousCheckpointId?: string | null, newCheckpointId?: string | null): Promise<void>;
/**
 * Check if a device+assignment has any tamper flags
 */
export declare function hasTamperFlags(prisma: PrismaClient, deviceId: string, assignmentId: string): Promise<boolean>;
/**
 * Get all tamper flags for a device+assignment
 */
export declare function getTamperFlags(prisma: PrismaClient, deviceId: string, assignmentId: string): Promise<any[]>;
/**
 * Get all tamper flags for an assignment (across all devices)
 */
export declare function getTamperFlagsForAssignment(prisma: PrismaClient, assignmentId: string): Promise<any[]>;
/**
 * Mark a tamper flag as reviewed
 */
export declare function markTamperFlagReviewed(prisma: PrismaClient, flagId: string): Promise<void>;
//# sourceMappingURL=tamperDetection.d.ts.map