/**
 * Tamper Detection Service
 *
 * Detects data tampering by tracking client state across submissions.
 * Primarily detects .verified folder deletion by monitoring checkpoint continuity.
 */
import * as crypto from 'crypto';
/**
 * Calculate a cumulative state hash from signal data
 * This hash represents the fingerprint of all data seen so far
 */
export function calculateStateHash(previousHash, signalData) {
    const hashInput = `${previousHash}|${signalData.eventId}|${signalData.type}|${signalData.timestamp}|${signalData.seq}|${signalData.checkpointId || ''}`;
    return crypto.createHash('sha256').update(hashInput).digest('hex');
}
/**
 * Get the current checkpoint state for a device+assignment
 */
export async function getCheckpointState(prisma, deviceId, assignmentId) {
    const checkpoint = await prisma.deviceCheckpoint.findUnique({
        where: {
            deviceId_assignmentId: {
                deviceId,
                assignmentId,
            },
        },
    });
    if (!checkpoint) {
        return null;
    }
    return {
        lastCheckpointId: checkpoint.lastCheckpointId,
        stateHash: checkpoint.stateHash,
        seq: checkpoint.seq,
        sessionCount: checkpoint.sessionCount,
        totalFocusedSeconds: checkpoint.totalFocusedSeconds,
        hasDiscontinuity: checkpoint.hasDiscontinuity,
    };
}
/**
 * Detect tampering by comparing incoming signal with previous state
 *
 * Key detection scenarios:
 * 1. Checkpoint reset: Client had a checkpoint before, now sends null (likely .verified folder deleted)
 * 2. Checkpoint mismatch: Client sends a new checkpoint without referencing the previous one
 * 3. State mismatch: Cumulative data doesn't match what we expect
 */
export async function detectTampering(prisma, deviceId, assignmentId, signalData, payload) {
    const currentState = await getCheckpointState(prisma, deviceId, assignmentId);
    // First signal ever - no tampering possible
    if (!currentState) {
        const initialStateHash = calculateStateHash('', signalData);
        return {
            isTampered: false,
            updatedState: {
                lastCheckpointId: signalData.checkpointId || null,
                stateHash: initialStateHash,
                seq: signalData.seq,
                sessionCount: signalData.type === 'SESSION_START' ? 1 : 0,
                totalFocusedSeconds: payload?.focused_seconds || 0,
                hasDiscontinuity: false,
            },
            previousCheckpointId: null,
        };
    }
    // Check for checkpoint reset (potential .verified folder deletion)
    // If we had a checkpoint before and now we receive null or a different checkpoint
    // without any continuity, this indicates a reset
    const hadPreviousCheckpoint = currentState.lastCheckpointId !== null && currentState.lastCheckpointId !== '';
    const hasNewCheckpoint = signalData.checkpointId !== null && signalData.checkpointId !== undefined;
    let detectedTamper = null;
    let description = null;
    // Scenario 1: Checkpoint reset - we had checkpoints, now they're gone
    if (hadPreviousCheckpoint && !hasNewCheckpoint) {
        detectedTamper = 'checkpoint_reset';
        description = `Client state reset: previous checkpoint ${currentState.lastCheckpointId} was lost. This indicates the .verified folder may have been deleted.`;
    }
    // Scenario 2: Checkpoint discontinuity - new checkpoint without reference to previous
    else if (hadPreviousCheckpoint && hasNewCheckpoint && signalData.checkpointId !== currentState.lastCheckpointId) {
        // Check if this is a legitimate new checkpoint (should reference the old one)
        // For UNVERIFIED_CHANGES, the payload should contain last_checkpoint_id
        const payloadReferencesPrevious = payload?.last_checkpoint_id === currentState.lastCheckpointId;
        if (!payloadReferencesPrevious && signalData.type === 'UNVERIFIED_CHANGES') {
            detectedTamper = 'checkpoint_reset';
            description = `Checkpoint discontinuity: expected reference to checkpoint ${currentState.lastCheckpointId}, but received new checkpoint ${signalData.checkpointId} without proper linkage. This indicates the .verified folder may have been deleted.`;
        }
    }
    // Scenario 3: Sequence gap that wasn't caught by sequence validation
    // (This should already be caught, but we double-check here)
    else if (signalData.seq > currentState.seq + 1) {
        detectedTamper = 'sequence_gap';
        description = `Sequence gap detected: expected seq ${currentState.seq + 1}, received ${signalData.seq}`;
    }
    // Scenario 4: Session continuity broken - new session without proper session end
    else if (signalData.type === 'SESSION_START' && currentState.sessionCount > 0) {
        // Check if previous session was properly closed
        // This is a soft warning - session could have been interrupted
        // We don't flag as tampered but note it
    }
    // Calculate new state hash
    const newStateHash = calculateStateHash(currentState.stateHash, signalData);
    // Update session and time tracking
    let newSessionCount = currentState.sessionCount;
    let newTotalFocusedSeconds = currentState.totalFocusedSeconds;
    if (signalData.type === 'SESSION_START') {
        newSessionCount++;
    }
    else if (signalData.type === 'SESSION_END' && payload?.focused_seconds) {
        newTotalFocusedSeconds += payload.focused_seconds;
    }
    const updatedState = {
        lastCheckpointId: hasNewCheckpoint ? signalData.checkpointId : currentState.lastCheckpointId,
        stateHash: newStateHash,
        seq: signalData.seq,
        sessionCount: newSessionCount,
        totalFocusedSeconds: newTotalFocusedSeconds,
        hasDiscontinuity: currentState.hasDiscontinuity || detectedTamper !== null,
    };
    if (detectedTamper) {
        return {
            isTampered: true,
            tamperType: detectedTamper,
            description: description || 'Tampering detected',
            updatedState,
            previousCheckpointId: currentState.lastCheckpointId,
        };
    }
    return {
        isTampered: false,
        updatedState,
        previousCheckpointId: null,
    };
}
/**
 * Update the checkpoint state after processing a signal
 */
export async function updateCheckpointState(prisma, deviceId, assignmentId, state) {
    await prisma.deviceCheckpoint.upsert({
        where: {
            deviceId_assignmentId: {
                deviceId,
                assignmentId,
            },
        },
        update: {
            lastCheckpointId: state.lastCheckpointId,
            stateHash: state.stateHash,
            seq: state.seq,
            sessionCount: state.sessionCount,
            totalFocusedSeconds: state.totalFocusedSeconds,
            hasDiscontinuity: state.hasDiscontinuity,
        },
        create: {
            deviceId,
            assignmentId,
            lastCheckpointId: state.lastCheckpointId,
            stateHash: state.stateHash,
            seq: state.seq,
            sessionCount: state.sessionCount,
            totalFocusedSeconds: state.totalFocusedSeconds,
            hasDiscontinuity: state.hasDiscontinuity,
        },
    });
}
/**
 * Create a tamper flag record
 */
export async function createTamperFlag(prisma, deviceId, assignmentId, type, description, detectedAtSeq, signalId = null, previousCheckpointId = null, newCheckpointId = null) {
    await prisma.tamperFlag.create({
        data: {
            deviceId,
            assignmentId,
            type,
            description,
            detectedAtSeq,
            signalId,
            previousCheckpointId,
            newCheckpointId,
        },
    });
}
/**
 * Check if a device+assignment has any tamper flags
 */
export async function hasTamperFlags(prisma, deviceId, assignmentId) {
    const count = await prisma.tamperFlag.count({
        where: {
            deviceId,
            assignmentId,
        },
    });
    return count > 0;
}
/**
 * Get all tamper flags for a device+assignment
 */
export async function getTamperFlags(prisma, deviceId, assignmentId) {
    return prisma.tamperFlag.findMany({
        where: {
            deviceId,
            assignmentId,
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}
/**
 * Get all tamper flags for an assignment (across all devices)
 */
export async function getTamperFlagsForAssignment(prisma, assignmentId) {
    return prisma.tamperFlag.findMany({
        where: {
            assignmentId,
        },
        include: {
            device: {
                include: {
                    user: {
                        select: {
                            githubLogin: true,
                            githubName: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}
/**
 * Mark a tamper flag as reviewed
 */
export async function markTamperFlagReviewed(prisma, flagId) {
    await prisma.tamperFlag.update({
        where: { id: flagId },
        data: { reviewed: true },
    });
}
//# sourceMappingURL=tamperDetection.js.map