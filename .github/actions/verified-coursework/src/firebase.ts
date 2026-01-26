/**
 * Firebase Firestore adapter for Verified Coursework GitHub Action
 *
 * Writes validated submission records to Firestore via REST API using
 * service account JWT authentication (no Admin SDK dependency).
 *
 * This is Action-only - the extension never writes to remote DB.
 */

import { createSign } from 'crypto';
import type { DbRecord, DbWriteResult, GitHubContext } from './db.js';

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
export function generateDocId(record: DbRecord): string {
  const safeRepo = record.repo.replace(/\//g, '__');
  const prPart = record.pr_number ? `pr${record.pr_number}` : 'no-pr';
  return `${safeRepo}__${prPart}__${record.commit_sha}`;
}

/**
 * Convert DbRecord to Firestore document format
 *
 * Firestore requires typed values. This converts our flat record to the
 * proper Firestore format.
 */
export function recordToFirestoreDocument(
  record: DbRecord
): FirestoreDocument {
  const fields: Record<string, FirestoreValue> = {
    repo: { stringValue: record.repo },
    commit_sha: { stringValue: record.commit_sha },
    course_id: { stringValue: record.course_id },
    assignment_id: { stringValue: record.assignment_id },
    generated_at: { stringValue: record.generated_at },
    focused_ms: { integerValue: record.focused_ms.toString() },
    active_ms: { integerValue: record.active_ms.toString() },
    sessions_count: { integerValue: record.sessions_count.toString() },
    bursts_low: { integerValue: record.bursts_low.toString() },
    bursts_medium: { integerValue: record.bursts_medium.toString() },
    bursts_high: { integerValue: record.bursts_high.toString() },
    bursts_total: { integerValue: record.bursts_total.toString() },
    unverified: { booleanValue: record.unverified },
    unverified_count: { integerValue: record.unverified_count.toString() },
    integrity_compromised: { booleanValue: record.integrity_compromised },
    hash_chain_ok: { booleanValue: record.hash_chain_ok },
    continuity_ok: { booleanValue: record.continuity_ok },
    workflow_run_url: { stringValue: record.workflow_run_url },
    updated_at: { stringValue: new Date().toISOString() },
  };

  // Optional fields
  if (record.pr_number !== null) {
    fields.pr_number = { integerValue: record.pr_number.toString() };
  } else {
    fields.pr_number = { nullValue: 'NULL_VALUE' };
  }

  if (record.last_log_hash !== null) {
    fields.last_log_hash = { stringValue: record.last_log_hash };
  } else {
    fields.last_log_hash = { nullValue: 'NULL_VALUE' };
  }

  if (record.artifact_url !== null) {
    fields.artifact_url = { stringValue: record.artifact_url };
  } else {
    fields.artifact_url = { nullValue: 'NULL_VALUE' };
  }

  return { fields };
}

/**
 * JWT header for Google service account authentication
 */
interface JwtHeader {
  alg: 'RS256';
  typ: 'JWT';
}

/**
 * JWT claim set for Google OAuth 2.0
 */
interface JwtClaimSet {
  iss: string; // Service account email
  scope: string; // Space-delimited list of OAuth scopes
  aud: string; // Always https://oauth2.googleapis.com/token
  iat: number; // Issued-at time in seconds
  exp: number; // Expiration time in seconds (max 3600 after iat)
}

/**
 * Base64url encode without padding
 */
function base64UrlEncode(data: string): string {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a JWT assertion for Google service account authentication
 *
 * This creates a signed JWT that can be exchanged for an OAuth access token.
 * No external libraries required - uses Node's built-in crypto module.
 */
export function createJwtAssertion(config: FirebaseConfig): string {
  const now = Math.floor(Date.now() / 1000);

  const header: JwtHeader = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const claimSet: JwtClaimSet = {
    iss: config.clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // Encode header and claim set
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const signatureInput = `${encodedHeader}.${encodedClaimSet}`;

  // Sign with RSA-SHA256 using the private key
  const sign = createSign('RSA-SHA256');
  sign.update(signatureInput);
  sign.end();

  // Normalize private key newlines before signing
  const normalizedKey = config.privateKey.replace(/\\n/g, '\n');
  const signature = sign.sign(normalizedKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${signatureInput}.${signature}`;
}

/**
 * OAuth token response from Google
 */
interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

/**
 * Exchange JWT assertion for an OAuth access token
 *
 * Posts to Google's OAuth endpoint to get a short-lived access token
 * that can be used to authenticate Firestore requests.
 */
export async function exchangeJwtForAccessToken(
  jwt: string
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `OAuth token request failed (${response.status}): ${errorText}`,
      };
    }

    const data = (await response.json()) as OAuthTokenResponse;

    if (data.error) {
      return {
        ok: false,
        error: `OAuth error: ${data.error} - ${data.error_description}`,
      };
    }

    return {
      ok: true,
      token: data.access_token,
    };
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Firestore PATCH response
 */
interface FirestorePatchResponse {
  name: string;
  updateTime?: string;
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * Write a record to Firestore via REST API
 *
 * Uses PATCH to perform an idempotent upsert operation.
 * The document will be created if it doesn't exist, or completely replaced
 * if it does exist (due to providing all fields).
 */
export async function writeRecordFirebase(
  record: DbRecord,
  config: FirebaseConfig
): Promise<DbWriteResult> {
  // Validate required config
  if (!config.projectId || !config.clientEmail || !config.privateKey) {
    return {
      success: false,
      recordId: null,
      error: 'Missing Firebase configuration (project_id, client_email, or private_key)',
    };
  }

  const collection = config.collection || 'verified_reports';
  const docId = generateDocId(record);
  const docPath = `projects/${config.projectId}/databases/(default)/documents/${collection}/${docId}`;

  try {
    // Step 1: Create JWT assertion
    const jwt = createJwtAssertion(config);

    // Step 2: Exchange JWT for access token
    const tokenResult = await exchangeJwtForAccessToken(jwt);
    if (!tokenResult.ok || !tokenResult.token) {
      return {
        success: false,
        recordId: null,
        error: `Failed to get access token: ${tokenResult.error}`,
      };
    }

    // Step 3: Convert record to Firestore document format
    const document = recordToFirestoreDocument(record);

    // Step 4: PATCH to Firestore (upsert)
    const url = `https://firestore.googleapis.com/v1/${docPath}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tokenResult.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: docPath,
        fields: document.fields,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Firestore error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText) as FirestorePatchResponse;
        if (errorJson.error?.message) {
          errorMessage = `Firestore error: ${errorJson.error.message}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }
      return {
        success: false,
        recordId: null,
        error: errorMessage,
      };
    }

    // Parse response to get the update time
    const data = (await response.json()) as FirestorePatchResponse;

    return {
      success: true,
      recordId: `${collection}/${docId}`,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      recordId: null,
      error: (error as Error).message,
    };
  }
}

/**
 * Load Firebase configuration from environment variables
 */
export function loadFirebaseConfig(): FirebaseConfig | null {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const collection = process.env.FIREBASE_COLLECTION;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    collection,
  };
}
