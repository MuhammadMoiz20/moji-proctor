/**
 * Signature Verification Service
 *
 * Verifies Ed25519 signatures from client devices.
 * Manages sequence numbers per device+assignment for replay protection.
 */
import { PrismaClient } from '@prisma/client';
/**
 * Verify Ed25519 signature using Node's built-in crypto module
 *
 * @param payload - Object that was signed
 * @param signatureHex - Signature (hex encoded, 64 bytes)
 * @param publicKeyHex - Public key (hex encoded, 32 bytes)
 * @returns True if signature is valid
 */
export declare function verifySignature(payload: object, signatureHex: string, publicKeyHex: string): boolean;
/**
 * Get current sequence number for device+assignment
 *
 * @param deviceId - Device ID
 * @param assignmentId - Assignment ID
 * @returns Current sequence number
 */
export declare function getNextSequenceNumber(deviceId: string, assignmentId: string): Promise<number>;
/**
 * Increment sequence number for device+assignment
 *
 * @param tx - Prisma transaction
 * @param deviceId - Device ID
 * @param assignmentId - Assignment ID
 * @param newSeq - New sequence number
 */
export declare function incrementSequenceNumber(tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>, deviceId: string, assignmentId: string, newSeq: number): Promise<void>;
//# sourceMappingURL=signatures.d.ts.map