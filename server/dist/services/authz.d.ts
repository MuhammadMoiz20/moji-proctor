/**
 * Authorization Helpers
 *
 * Role-based access control for API endpoints.
 */
import { FastifyRequest } from 'fastify';
/**
 * User roles
 */
export type UserRole = 'student' | 'instructor';
/**
 * Check if user has instructor role
 *
 * @param userId - User ID to check
 * @returns True if user is an instructor
 */
export declare function isInstructor(userId: string): Promise<boolean>;
/**
 * Check if GitHub login or ID is in instructor allowlist
 *
 * @param githubLogin - GitHub username
 * @param githubId - GitHub ID
 * @returns True if in allowlist
 */
export declare function isInstructorAllowlisted(githubLogin: string, githubId: string): boolean;
/**
 * Grant instructor role to user if in allowlist
 * Called during OAuth flow
 *
 * @param githubLogin - GitHub username
 * @param githubId - GitHub ID
 * @returns Role to assign
 */
export declare function getInitialRole(githubLogin: string, githubId: string): UserRole;
/**
 * Middleware to require instructor role
 *
 * @param request - Fastify request
 * @throws Error if not authorized
 */
export declare function requireInstructor(request: FastifyRequest): Promise<void>;
/**
 * Get current user's role
 *
 * @param request - Fastify request
 * @returns User role
 */
export declare function getUserRole(request: FastifyRequest): Promise<UserRole>;
//# sourceMappingURL=authz.d.ts.map