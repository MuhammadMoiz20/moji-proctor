"use strict";
/**
 * Signature Verification Service
 *
 * Verifies Ed25519 signatures from client devices.
 * Manages sequence numbers per device+assignment for replay protection.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignature = verifySignature;
exports.getNextSequenceNumber = getNextSequenceNumber;
exports.incrementSequenceNumber = incrementSequenceNumber;
const tweetsodium_1 = __importDefault(require("tweetsodium"));
const client_1 = require("@prisma/client");
/**
 * Canonical JSON stringify (must match client implementation)
 */
function canonicalStringify(value) {
    return JSON.stringify(value, canonicalReplacer, 0);
}
/**
 * Replacer for canonical JSON (sorted keys)
 */
function canonicalReplacer(key, value) {
    if (value === null || typeof value !== 'object') {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => typeof item === 'object' && item !== null
            ? JSON.parse(canonicalStringify(item))
            : item);
    }
    const sortedKeys = Object.keys(value).sort();
    const sortedObj = {};
    for (const k of sortedKeys) {
        const v = value[k];
        sortedObj[k] =
            typeof v === 'object' && v !== null
                ? JSON.parse(canonicalStringify(v))
                : v;
    }
    return sortedObj;
}
/**
 * Verify Ed25519 signature
 *
 * @param payload - Object that was signed
 * @param signatureHex - Signature (hex encoded, 64 bytes)
 * @param publicKeyHex - Public key (hex encoded, 32 bytes)
 * @returns True if signature is valid
 */
function verifySignature(payload, signatureHex, publicKeyHex) {
    try {
        const message = Buffer.from(canonicalStringify(payload), 'utf8');
        const signature = Buffer.from(signatureHex, 'hex');
        const publicKey = Buffer.from(publicKeyHex, 'hex');
        return tweetsodium_1.default.crypto_sign_verify_detached(signature, message, publicKey);
    }
    catch {
        return false;
    }
}
/**
 * Get current sequence number for device+assignment
 *
 * @param deviceId - Device ID
 * @param assignmentId - Assignment ID
 * @returns Current sequence number
 */
async function getNextSequenceNumber(deviceId, assignmentId) {
    const seq = await prisma.deviceSequence.findUnique({
        where: {
            deviceId_assignmentId: {
                deviceId,
                assignmentId,
            },
        },
    });
    return seq?.lastSeq ?? 0;
}
/**
 * Increment sequence number for device+assignment
 *
 * @param tx - Prisma transaction
 * @param deviceId - Device ID
 * @param assignmentId - Assignment ID
 * @param newSeq - New sequence number
 */
async function incrementSequenceNumber(tx, deviceId, assignmentId, newSeq) {
    await tx.deviceSequence.upsert({
        where: {
            deviceId_assignmentId: {
                deviceId,
                assignmentId,
            },
        },
        update: { lastSeq: newSeq },
        create: {
            deviceId,
            assignmentId,
            lastSeq: newSeq,
        },
    });
}
// Prisma client for signature service
const prisma = new client_1.PrismaClient();
//# sourceMappingURL=signatures.js.map