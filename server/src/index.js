"use strict";
/**
 * Moji Proctor Online Signals Server
 *
 * Fastify server for:
 * - GitHub OAuth Device Flow authentication
 * - Signal ingestion with Ed25519 signature verification
 * - Instructor dashboard API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.createServer = createServer;
exports.startServer = startServer;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const rate_limit_1 = __importDefault(require("@fastify/rate-limit"));
const client_1 = require("@prisma/client");
const auth_1 = require("./routes/auth");
const events_1 = require("./routes/events");
const instructor_1 = require("./routes/instructor");
const health_1 = require("./routes/health");
exports.prisma = new client_1.PrismaClient();
/**
 * Create and configure the Fastify server
 */
async function createServer() {
    const server = (0, fastify_1.default)({
        logger: {
            level: process.env.LOG_LEVEL || 'info',
        },
        requestIdHeader: 'x-request-id',
        requestIdLogLabel: 'reqId',
    });
    // CORS configuration
    await server.register(cors_1.default, {
        origin: process.env.CORS_ORIGIN ?? '*',
        credentials: true,
    });
    // JWT configuration
    await server.register(jwt_1.default, {
        secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
        sign: {
            expiresIn: '15m', // Short-lived access tokens
        },
    });
    // Rate limiting
    await server.register(rate_limit_1.default, {
        max: 100, // 100 requests per window
        timeWindow: '1 minute',
        continueExceeding: false,
        skipOnError: true,
    });
    // Register routes
    await server.register(health_1.healthRoutes, { prefix: '/' });
    await server.register(auth_1.authRoutes, { prefix: '/api/auth' });
    await server.register(events_1.eventRoutes, { prefix: '/api' });
    await server.register(instructor_1.instructorRoutes, { prefix: '/api/instructor' });
    // Global error handler
    server.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        // Handle validation errors
        if (error.validation) {
            reply.status(400).send({
                error: 'Validation Error',
                details: error.validation,
            });
            return;
        }
        // Handle rate limit errors
        if (error.statusCode === 429) {
            reply.status(429).send({
                error: 'Too Many Requests',
                retryAfter: '60s',
            });
            return;
        }
        // Generic error
        reply.status(error.statusCode ?? 500).send({
            error: error.message ?? 'Internal Server Error',
        });
    });
    // 404 handler
    server.setNotFoundHandler((request, reply) => {
        reply.status(404).send({
            error: 'Not Found',
            path: request.url,
        });
    });
    // Graceful shutdown
    const gracefulShutdown = async () => {
        server.log.info('Shutting down gracefully...');
        await server.close();
        await exports.prisma.$disconnect();
        process.exit(0);
    };
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    return server;
}
/**
 * Start the server
 */
async function startServer(port = 3000) {
    const server = await createServer();
    try {
        await server.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on http://0.0.0.0:${port}`);
    }
    catch (error) {
        server.log.error(error);
        process.exit(1);
    }
}
// Start server if run directly
if (require.main === module) {
    const port = parseInt(process.env.PORT ?? '3000', 10);
    startServer(port);
}
//# sourceMappingURL=index.js.map