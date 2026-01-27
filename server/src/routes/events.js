"use strict";
/**
 * Event Routes
 *
 * Handles signal ingestion from extensions with signature verification.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventRoutes = eventRoutes;
const zod_1 = require("zod");
const index_1 = require("../index");
const signatures_1 = require("../services/signatures");
// Validation schemas
const batchUploadSchema = zod_1.z.object({
    signals: zod_1.z.array(zod_1.z.object({
        event_id: zod_1.z.string().uuid(),
        ts: zod_1.z.string().datetime(),
        session_id: zod_1.z.string().uuid(),
        type: zod_1.z.enum(['SESSION_START', 'SESSION_END', 'BURST_FLAG', 'UNVERIFIED_CHANGES', 'INTEGRITY_COMPROMISED']),
        payload: zod_1.z.unknown(),
        assignment_id: zod_1.z.string().min(1),
        course_id: zod_1.z.string().optional(),
        commit_sha: zod_1.z.string().optional(),
        repo_identifier: zod_1.z.string().optional(),
        device_pubkey: zod_1.z.string().regex(/^[0-9a-f]{64}$/),
        seq: zod_1.z.number().int().positive(),
        sig: zod_1.z.string().regex(/^[0-9a-f]{128}$/),
    })).min(1).max(100), // Max 100 signals per batch
});
/**
 * Register event routes
 */
async function eventRoutes(fastify) {
    /**
     * POST /events/batch
     *
     * Upload a batch of signals
     */
    fastify.post('/events/batch', async (request, reply) => {
        // Verify JWT
        try {
            await request.jwtVerify();
        }
        catch {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const body = batchUploadSchema.safeParse(request.body);
        if (!body.success) {
            return reply.status(400).send({ error: 'Validation failed', details: body.error });
        }
        const { signals } = body.data;
        // Process each signal
        const accepted = [];
        const rejected = [];
        // Get or create device for each unique public key
        const deviceKeys = [...new Set(signals.map(s => s.device_pubkey))];
        for (const devicePubKey of deviceKeys) {
            // For now, auto-create devices. In production, require explicit registration.
            await index_1.prisma.device.upsert({
                where: { publicKey: devicePubKey },
                update: { lastSeenAt: new Date() },
                create: {
                    publicKey: devicePubKey,
                    userId: request.user.userId, // Associate with authenticated user
                },
            });
        }
        for (const signal of signals) {
            try {
                // 1. Get device
                const device = await index_1.prisma.device.findUnique({
                    where: { publicKey: signal.device_pubkey },
                });
                if (!device) {
                    rejected.push(signal.event_id);
                    continue;
                }
                // 2. Verify signature
                const payloadWithoutSig = {
                    event_id: signal.event_id,
                    ts: signal.ts,
                    session_id: signal.session_id,
                    type: signal.type,
                    payload: signal.payload,
                    assignment_id: signal.assignment_id,
                    course_id: signal.course_id,
                    commit_sha: signal.commit_sha,
                    repo_identifier: signal.repo_identifier,
                };
                const isValid = (0, signatures_1.verifySignature)(payloadWithoutSig, signal.sig, signal.device_pubkey);
                if (!isValid) {
                    rejected.push(signal.event_id);
                    continue;
                }
                // 3. Verify sequence number
                const currentSeq = await (0, signatures_1.getNextSequenceNumber)(device.id, signal.assignment_id);
                if (signal.seq <= currentSeq) {
                    // Replay or out of order
                    rejected.push(signal.event_id);
                    continue;
                }
                if (signal.seq !== currentSeq + 1) {
                    // Gap in sequence - reject to prevent replay
                    rejected.push(signal.event_id);
                    continue;
                }
                // 4. Check for duplicate event_id
                const existing = await index_1.prisma.signal.findUnique({
                    where: {
                        eventId_assignmentId: {
                            eventId: signal.event_id,
                            assignmentId: signal.assignment_id,
                        },
                    },
                });
                if (existing) {
                    rejected.push(signal.event_id);
                    continue;
                }
                // 5. Store signal
                await index_1.prisma.$transaction(async (tx) => {
                    // Create signal record
                    await tx.signal.create({
                        data: {
                            eventId: signal.event_id,
                            deviceId: device.id,
                            assignmentId: signal.assignment_id,
                            courseId: signal.course_id,
                            sessionId: signal.session_id,
                            type: signal.type,
                            timestamp: new Date(signal.ts),
                            payload: signal.payload,
                            seq: signal.seq,
                            signature: signal.sig,
                            devicePubKey: signal.device_pubkey,
                        },
                    });
                    // Increment sequence
                    await (0, signatures_1.incrementSequenceNumber)(tx, device.id, signal.assignment_id, signal.seq);
                });
                accepted.push(signal.event_id);
            }
            catch (error) {
                fastify.log.error({ error, signalId: signal.event_id }, 'Failed to process signal');
                rejected.push(signal.event_id);
            }
        }
        const response = {
            accepted: accepted.length,
            rejected: rejected.length,
            rejected_ids: rejected.length > 0 ? rejected : undefined,
        };
        return reply.send(response);
    });
}
//# sourceMappingURL=events.js.map