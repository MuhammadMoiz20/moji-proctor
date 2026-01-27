"use strict";
/**
 * Instructor Dashboard Routes
 *
 * API endpoints for instructors to view student signals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.instructorRoutes = instructorRoutes;
const index_1 = require("../index");
/**
 * Register instructor routes
 */
async function instructorRoutes(fastify) {
    // All instructor routes require authentication
    fastify.addHook('onRequest', async (request, reply) => {
        try {
            await request.jwtVerify();
        }
        catch {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
    });
    /**
     * GET /instructor/assignments
     *
     * Get list of assignments with signal data
     */
    fastify.get('/assignments', async (request, reply) => {
        // Get unique assignments from signals
        const assignments = await index_1.prisma.signal.groupBy({
            by: ['assignmentId', 'courseId'],
            _count: {
                id: true,
            },
        });
        return reply.send({
            assignments: assignments.map((a) => ({
                assignment_id: a.assignmentId,
                course_id: a.courseId,
                signal_count: a._count.id,
            })),
        });
    });
    /**
     * GET /instructor/assignments/:id/students
     *
     * Get list of students for an assignment
     */
    fastify.get('/assignments/:id/students', async (request, reply) => {
        const { id } = request.params;
        // Get students (devices) with signals for this assignment
        const students = await index_1.prisma.signal.findMany({
            where: { assignmentId: id },
            include: {
                device: {
                    include: {
                        user: {
                            select: {
                                githubLogin: true,
                                githubName: true,
                                githubEmail: true,
                            },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
            distinct: ['deviceId'],
        });
        // Group by device/student
        const studentMap = new Map();
        for (const signal of students) {
            const existing = studentMap.get(signal.deviceId);
            if (existing) {
                existing.last_seen = signal.createdAt;
                existing.signal_count++;
                if (!existing.sessions.includes(signal.sessionId)) {
                    existing.sessions.push(signal.sessionId);
                }
            }
            else {
                studentMap.set(signal.deviceId, {
                    device_id: signal.deviceId,
                    user: signal.device.user ? {
                        login: signal.device.user.githubLogin,
                        name: signal.device.user.githubName ?? undefined,
                        email: signal.device.user.githubEmail ?? undefined,
                    } : null,
                    first_seen: signal.createdAt,
                    last_seen: signal.createdAt,
                    signal_count: 1,
                    sessions: [signal.sessionId],
                });
            }
        }
        return reply.send({
            assignment_id: id,
            students: Array.from(studentMap.values()).map((s) => ({
                device_id: s.device_id,
                user: s.user,
                first_seen: s.first_seen,
                last_seen: s.last_seen,
                signal_count: s.signal_count,
                session_count: s.sessions.length,
            })),
        });
    });
    /**
     * GET /instructor/assignments/:id/students/:studentId/timeline
     *
     * Get timeline of signals for a specific student
     */
    fastify.get('/assignments/:id/students/:studentId/timeline', async (request, reply) => {
        const { id, studentId } = request.params;
        const query = request.query;
        const limit = query.limit ? parseInt(query.limit, 10) : 100;
        const where = {
            assignmentId: id,
            deviceId: studentId,
        };
        if (query.type) {
            where.type = query.type;
        }
        const signals = await index_1.prisma.signal.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
        return reply.send({
            assignment_id: id,
            device_id: studentId,
            signals: signals.map((s) => ({
                event_id: s.eventId,
                ts: s.timestamp.toISOString(),
                session_id: s.sessionId,
                type: s.type,
                payload: s.payload,
            })),
        });
    });
    /**
     * GET /instructor/assignments/:id/summary
     *
     * Get summary statistics for an assignment
     */
    fastify.get('/assignments/:id/summary', async (request, reply) => {
        const { id } = request.params;
        // Count signals by type
        const signalCounts = await index_1.prisma.signal.groupBy({
            by: ['type'],
            where: { assignmentId: id },
            _count: { id: true },
        });
        // Count unique students
        const uniqueDevices = await index_1.prisma.signal.findMany({
            where: { assignmentId: id },
            distinct: ['deviceId'],
            select: { deviceId: true },
        });
        // Count unique sessions
        const uniqueSessions = await index_1.prisma.signal.findMany({
            where: { assignmentId: id },
            distinct: ['sessionId'],
            select: { sessionId: true },
        });
        // Get time range
        const timeRange = await index_1.prisma.signal.aggregate({
            where: { assignmentId: id },
            _min: { timestamp: true },
            _max: { timestamp: true },
        });
        return reply.send({
            assignment_id: id,
            total_signals: signalCounts.reduce((sum, s) => sum + s._count.id, 0),
            unique_students: uniqueDevices.length,
            unique_sessions: uniqueSessions.length,
            signals_by_type: signalCounts.map((s) => ({
                type: s.type,
                count: s._count.id,
            })),
            time_range: {
                earliest: timeRange._min.timestamp?.toISOString() ?? null,
                latest: timeRange._max.timestamp?.toISOString() ?? null,
            },
        });
    });
}
//# sourceMappingURL=instructor.js.map