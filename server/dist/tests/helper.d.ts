/**
 * Test Helper for Server Integration Tests
 *
 * Provides utilities for building and testing the Fastify server.
 */
import { FastifyInstance } from 'fastify';
/**
 * Build a test server instance
 */
export declare function build(): Promise<FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>>;
/**
 * Clean up test server
 */
export declare function teardown(): Promise<void>;
/**
 * Generate a valid JWT token for testing
 */
export declare function generateTestToken(server: FastifyInstance, userId: string): Promise<string>;
/**
 * Create a mock device public key
 */
export declare function mockDevicePublicKey(): string;
/**
 * Create a mock signature
 */
export declare function mockSignature(): string;
/**
 * Create a mock signal
 */
export declare function createMockSignal(overrides?: {}): {
    event_id: string;
    ts: string;
    session_id: string;
    type: string;
    payload: {
        workspace_name: string;
    };
    assignment_id: string;
    device_pubkey: string;
    seq: number;
    sig: string;
};
//# sourceMappingURL=helper.d.ts.map