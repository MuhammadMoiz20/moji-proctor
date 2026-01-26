/**
 * Firebase Firestore adapter for Verified Coursework GitHub Action
 *
 * Writes validated submission records to Firestore via REST API using
 * service account JWT authentication (no Admin SDK dependency).
 *
 * This is Action-only - the extension never writes to remote DB.
 */
import type { DbRecord, DbWriteResult } from './db.js';
/**
 * Firebase configuration from environment variables
 */
export interface FirebaseConfig {
    projectId: string;
    clientEmail: string;
    privateKey: string;
    collection?: string;
}
/**
 * Firestore Value types
 * See: https://firebase.google.com/docs/firestore/reference/rest/v1/Value
 */
type FirestoreValue = {
    nullValue?: 'NULL_VALUE';
    booleanValue?: boolean;
    integerValue?: string;
    doubleValue?: number;
    stringValue?: string;
    timestampValue?: string;
};
/**
 * Firestore document format
 */
interface FirestoreDocument {
    name?: string;
    fields: Record<string, FirestoreValue>;
    updateTime?: string;
}
/**
 * Generate deterministic document ID from repo, PR number, and commit SHA
 * Format: repo__pr{number}__{sha} with / replaced by __
 *
 * Example: owner__repo__pr123__abc123def
 */
export declare function generateDocId(record: DbRecord): string;
/**
 * Convert DbRecord to Firestore document format
 *
 * Firestore requires typed values. This converts our flat record to the
 * proper Firestore format.
 */
export declare function recordToFirestoreDocument(record: DbRecord): FirestoreDocument;
/**
 * Create a JWT assertion for Google service account authentication
 *
 * This creates a signed JWT that can be exchanged for an OAuth access token.
 * No external libraries required - uses Node's built-in crypto module.
 */
export declare function createJwtAssertion(config: FirebaseConfig): string;
/**
 * Exchange JWT assertion for an OAuth access token
 *
 * Posts to Google's OAuth endpoint to get a short-lived access token
 * that can be used to authenticate Firestore requests.
 */
export declare function exchangeJwtForAccessToken(jwt: string): Promise<{
    ok: boolean;
    token?: string;
    error?: string;
}>;
/**
 * Write a record to Firestore via REST API
 *
 * Uses PATCH to perform an idempotent upsert operation.
 * The document will be created if it doesn't exist, or completely replaced
 * if it does exist (due to providing all fields).
 */
export declare function writeRecordFirebase(record: DbRecord, config: FirebaseConfig): Promise<DbWriteResult>;
/**
 * Load Firebase configuration from environment variables
 */
export declare function loadFirebaseConfig(): FirebaseConfig | null;
export {};
