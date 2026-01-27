"use strict";
/**
 * Authentication Routes
 *
 * Implements GitHub OAuth Device Flow:
 * - POST /device/start - Initiate device flow
 * - POST /device/complete - Poll for authorization completion
 * - POST /refresh - Refresh access token
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const zod_1 = require("zod");
const index_1 = require("../index");
const auth_1 = require("../services/auth");
// Validation schemas
const deviceStartSchema = zod_1.z.object({
    client_id: zod_1.z.string().optional(),
});
const deviceCompleteSchema = zod_1.z.object({
    device_code: zod_1.z.string(),
});
const refreshSchema = zod_1.z.object({
    refresh_token: zod_1.z.string(),
});
/**
 * Register authentication routes
 */
async function authRoutes(fastify) {
    /**
     * POST /auth/device/start
     *
     * Start GitHub OAuth Device Flow
     */
    fastify.post('/device/start', async (request, reply) => {
        // In a real implementation, this would call GitHub's device flow API
        // For development/MVP, we'll use a simplified flow
        const clientId = process.env.GITHUB_CLIENT_ID;
        if (!clientId) {
            return reply.status(500).send({ error: 'GitHub client not configured' });
        }
        // Start GitHub device flow
        const githubResponse = await fetch('https://github.com/login/device/code', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Moji-Proctor-Server',
            },
            body: JSON.stringify({
                client_id: clientId,
                scope: 'read:user user:email',
            }),
        });
        if (!githubResponse.ok) {
            const error = await githubResponse.text();
            fastify.log.error({ error }, 'GitHub device flow start failed');
            return reply.status(500).send({ error: 'Failed to start device flow' });
        }
        const githubData = await githubResponse.json();
        const response = {
            device_code: githubData.device_code,
            user_code: githubData.user_code,
            verification_uri: githubData.verification_uri,
            verification_uri_complete: githubData.verification_uri_complete,
            expires_in: githubData.expires_in,
            interval: githubData.interval,
        };
        // Store device code with expiration
        // In production, use Redis for this
        return reply.send(response);
    });
    /**
     * POST /auth/device/complete
     *
     * Poll for authorization completion
     */
    fastify.post('/device/complete', async (request, reply) => {
        const { device_code } = deviceCompleteSchema.parse(request.body);
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return reply.status(500).send({ error: 'GitHub client not configured' });
        }
        // Poll GitHub for authorization
        const githubResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Moji-Proctor-Server',
            },
            body: JSON.stringify({
                client_id: clientId,
                device_code: device_code,
                grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
        });
        const githubData = await githubResponse.json();
        // Handle pending/slow_down
        if (githubData.error === 'authorization_pending') {
            return reply.status(202).send({ error: 'authorization_pending' });
        }
        if (githubData.error === 'slow_down') {
            return reply.status(202).send({ error: 'slow_down' });
        }
        if (githubData.error) {
            return reply.status(400).send({ error: githubData.error });
        }
        // Success - get user info and create/update user
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${githubData.access_token}`,
                'User-Agent': 'Moji-Proctor-Server',
            },
        });
        const githubUser = await userResponse.json();
        // Create or update user in database
        const user = await index_1.prisma.user.upsert({
            where: { githubId: String(githubUser.id) },
            update: {
                githubLogin: githubUser.login,
                githubName: githubUser.name,
                githubEmail: githubUser.email,
            },
            create: {
                githubId: String(githubUser.id),
                githubLogin: githubUser.login,
                githubName: githubUser.name,
                githubEmail: githubUser.email,
            },
        });
        // Generate JWT tokens
        const tokens = await (0, auth_1.generateTokenPair)(user.id);
        const response = {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: 15 * 60, // 15 minutes
            user: {
                id: user.id,
                login: user.githubLogin,
                name: user.githubName ?? undefined,
                email: user.githubEmail ?? undefined,
            },
        };
        return reply.send(response);
    });
    /**
     * POST /auth/refresh
     *
     * Refresh access token using refresh token
     */
    fastify.post('/refresh', async (request, reply) => {
        const { refresh_token: refreshToken } = refreshSchema.parse(request.body);
        try {
            const userId = await (0, auth_1.verifyRefreshToken)(refreshToken);
            // Generate new tokens
            const tokens = await (0, auth_1.generateTokenPair)(userId);
            const response = {
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                expires_in: 15 * 60,
            };
            return reply.send(response);
        }
        catch (error) {
            fastify.log.error({ error }, 'Token refresh failed');
            return reply.status(401).send({ error: 'Invalid refresh token' });
        }
    });
}
//# sourceMappingURL=auth.js.map