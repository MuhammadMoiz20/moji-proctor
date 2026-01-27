/**
 * Authentication Routes
 *
 * Implements GitHub OAuth Device Flow:
 * - POST /device/start - Initiate device flow
 * - POST /device/complete - Poll for authorization completion
 * - POST /refresh - Refresh access token with rotation
 * - POST /logout - Revoke refresh token
 */
import { FastifyInstance } from 'fastify';
/**
 * Register authentication routes
 */
export declare function authRoutes(fastify: FastifyInstance): Promise<void>;
//# sourceMappingURL=auth.d.ts.map