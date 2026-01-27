"use strict";
/**
 * Authentication Service
 *
 * Handles JWT token generation and verification.
 * Manages refresh token lifecycle.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTokenPair = generateTokenPair;
exports.verifyRefreshToken = verifyRefreshToken;
exports.cleanupExpiredTokens = cleanupExpiredTokens;
const index_1 = require("../index");
const index_2 = require("../index");
/**
 * Generate access and refresh tokens
 *
 * @param userId - User ID
 * @returns Token pair
 */
async function generateTokenPair(userId) {
    // Generate access token (JWT)
    const accessToken = index_2.fastify.jwt.sign({ userId });
    // Generate refresh token (UUID)
    const refreshTokenId = crypto.randomUUID();
    // Store refresh token in database (expires in 30 days)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await index_1.prisma.refreshToken.create({
        data: {
            userId,
            token: refreshTokenId,
            expiresAt,
        },
    });
    // Clean up old refresh tokens for this user
    await index_1.prisma.refreshToken.deleteMany({
        where: {
            userId,
            createdAt: {
                lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Older than 30 days
            },
        },
    });
    return {
        accessToken,
        refreshToken: refreshTokenId,
    };
}
/**
 * Verify refresh token and return user ID
 *
 * @param token - Refresh token
 * @returns User ID
 * @throws Error if token is invalid
 */
async function verifyRefreshToken(token) {
    const refreshToken = await index_1.prisma.refreshToken.findUnique({
        where: { token },
    });
    if (!refreshToken) {
        throw new Error('Invalid refresh token');
    }
    if (refreshToken.expiresAt < new Date()) {
        await index_1.prisma.refreshToken.delete({ where: { token } });
        throw new Error('Refresh token expired');
    }
    return refreshToken.userId;
}
/**
 * Clean up expired refresh tokens
 *
 * Called periodically to remove expired tokens
 */
async function cleanupExpiredTokens() {
    await index_1.prisma.refreshToken.deleteMany({
        where: {
            expiresAt: {
                lt: new Date(),
            },
        },
    });
}
//# sourceMappingURL=auth.js.map