"use strict";
/**
 * Health Check Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = healthRoutes;
async function healthRoutes(fastify) {
    /**
     * GET /health
     *
     * Health check endpoint
     */
    fastify.get('/health', async (request, reply) => {
        return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
    });
    /**
     * HEAD /health
     *
     * Lightweight health check
     */
    fastify.head('/health', async (request, reply) => {
        return reply.status(204).send();
    });
}
//# sourceMappingURL=health.js.map