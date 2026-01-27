/**
 * Moji Proctor Online Signals Server
 *
 * Fastify server for:
 * - GitHub OAuth Device Flow authentication
 * - Signal ingestion with Ed25519 signature verification
 * - Instructor dashboard API
 */
import 'dotenv/config';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
/**
 * Create and configure the Fastify server
 */
export declare function createServer(): Promise<FastifyInstance>;
/**
 * Start the server
 */
export declare function startServer(port?: number): Promise<void>;
export { createServer as buildServer };
//# sourceMappingURL=index.d.ts.map