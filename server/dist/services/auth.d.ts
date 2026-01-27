/**
 * Authentication Service
 *
 * Handles JWT token generation and verification.
 * Manages refresh token lifecycle with rotation and reuse detection.
 */
import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
/**
 * Token pair
 */
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
}
/**
 * Generate access and refresh tokens
 *
 * @param fastify - Fastify instance with JWT plugin
 * @param prisma - Prisma client
 * @param userId - User ID
 * @returns Token pair
 */
export declare function generateTokenPair(fastify: FastifyInstance, prisma: PrismaClient, userId: string): Promise<TokenPair>;
/**
 * Verify refresh token and return user ID with rotation support
 *
 * @param prisma - Prisma client
 * @param token - Refresh token
 * @param fastify - Fastify instance for JWT generation
 * @returns Token pair with rotated tokens
 * @throws Error if token is invalid or reuse detected
 */
export declare function verifyRefreshToken(prisma: PrismaClient, token: string, fastify: FastifyInstance): Promise<TokenPair>;
/**
 * Revoke a refresh token (for logout)
 *
 * @param prisma - Prisma client
 * @param token - Refresh token to revoke
 */
export declare function revokeRefreshToken(prisma: PrismaClient, token: string): Promise<void>;
/**
 * Clean up expired refresh tokens
 *
 * Called periodically to remove expired tokens
 */
export declare function cleanupExpiredTokens(prisma: PrismaClient): Promise<void>;
//# sourceMappingURL=auth.d.ts.map