/**
 * Unit tests for Firebase Firestore adapter
 *
 * These tests verify:
 * - Document ID generation (deterministic format)
 * - Record to Firestore document conversion
 * - JWT generation (format and structure)
 *
 * Note: These tests do NOT hit real Google endpoints.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import from compiled JS since tests run as CommonJS
const {
  generateDocId,
  recordToFirestoreDocument,
  createJwtAssertion,
} = require('./dist/firebase.js');

/**
 * A sample DbRecord for testing
 */
const sampleRecord = {
  repo: 'owner/repo',
  pr_number: 123,
  commit_sha: 'abc123def456',
  course_id: 'CS101',
  assignment_id: 'homework-1',
  generated_at: '2024-01-15T10:30:00Z',
  focused_ms: 3600000,
  active_ms: 7200000,
  sessions_count: 3,
  bursts_low: 5,
  bursts_medium: 2,
  bursts_high: 0,
  bursts_total: 7,
  unverified: false,
  unverified_count: 0,
  integrity_compromised: false,
  hash_chain_ok: true,
  continuity_ok: true,
  last_log_hash: 'hash789',
  workflow_run_url: 'https://github.com/owner/repo/actions/runs/456',
  artifact_url: 'https://github.com/owner/repo/actions/runs/456/artifacts/789',
};

describe('generateDocId', () => {
  it('should generate deterministic doc ID with PR number', () => {
    const docId = generateDocId(sampleRecord);
    assert.strictEqual(docId, 'owner__repo__pr123__abc123def456');
  });

  it('should handle repo with multiple slashes', () => {
    const record = { ...sampleRecord, repo: 'org/subgroup/repo' };
    const docId = generateDocId(record);
    assert.strictEqual(docId, 'org__subgroup__repo__pr123__abc123def456');
  });

  it('should use "no-pr" when pr_number is null', () => {
    const record = { ...sampleRecord, pr_number: null };
    const docId = generateDocId(record);
    assert.strictEqual(docId, 'owner__repo__no-pr__abc123def456');
  });

  it('should be idempotent for same input', () => {
    const docId1 = generateDocId(sampleRecord);
    const docId2 = generateDocId(sampleRecord);
    assert.strictEqual(docId1, docId2);
  });
});

describe('recordToFirestoreDocument', () => {
  it('should convert record to Firestore document format', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    // Should have all required fields
    assert.ok(doc.fields);
    assert.strictEqual(doc.fields.repo.stringValue, 'owner/repo');
    assert.strictEqual(doc.fields.commit_sha.stringValue, 'abc123def456');
    assert.strictEqual(doc.fields.course_id.stringValue, 'CS101');
    assert.strictEqual(doc.fields.assignment_id.stringValue, 'homework-1');
  });

  it('should convert numbers to integerValue strings', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(doc.fields.focused_ms.integerValue, '3600000');
    assert.strictEqual(doc.fields.active_ms.integerValue, '7200000');
    assert.strictEqual(doc.fields.sessions_count.integerValue, '3');
    assert.strictEqual(doc.fields.bursts_low.integerValue, '5');
    assert.strictEqual(doc.fields.bursts_medium.integerValue, '2');
    assert.strictEqual(doc.fields.bursts_high.integerValue, '0');
    assert.strictEqual(doc.fields.bursts_total.integerValue, '7');
    assert.strictEqual(doc.fields.unverified_count.integerValue, '0');
  });

  it('should convert booleans to booleanValue', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(doc.fields.unverified.booleanValue, false);
    assert.strictEqual(doc.fields.integrity_compromised.booleanValue, false);
    assert.strictEqual(doc.fields.hash_chain_ok.booleanValue, true);
    assert.strictEqual(doc.fields.continuity_ok.booleanValue, true);
  });

  it('should handle null pr_number as nullValue', () => {
    const record = { ...sampleRecord, pr_number: null };
    const doc = recordToFirestoreDocument(record);

    assert.strictEqual(doc.fields.pr_number.nullValue, 'NULL_VALUE');
  });

  it('should handle null last_log_hash as nullValue', () => {
    const record = { ...sampleRecord, last_log_hash: null };
    const doc = recordToFirestoreDocument(record);

    assert.strictEqual(doc.fields.last_log_hash.nullValue, 'NULL_VALUE');
  });

  it('should handle null artifact_url as nullValue', () => {
    const record = { ...sampleRecord, artifact_url: null };
    const doc = recordToFirestoreDocument(record);

    assert.strictEqual(doc.fields.artifact_url.nullValue, 'NULL_VALUE');
  });

  it('should include updated_at field with current timestamp', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.ok(doc.fields.updated_at.stringValue);
    const timestamp = doc.fields.updated_at.stringValue;
    // Should be valid ISO 8601 format
    assert.ok(new Date(timestamp).toISOString() === timestamp);
  });

  it('should handle pr_number as integer when non-null', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(doc.fields.pr_number.integerValue, '123');
  });

  it('should include workflow URL', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(
      doc.fields.workflow_run_url.stringValue,
      'https://github.com/owner/repo/actions/runs/456'
    );
  });

  it('should include artifact URL when present', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(
      doc.fields.artifact_url.stringValue,
      'https://github.com/owner/repo/actions/runs/456/artifacts/789'
    );
  });

  it('should include last_log_hash when present', () => {
    const doc = recordToFirestoreDocument(sampleRecord);

    assert.strictEqual(doc.fields.last_log_hash.stringValue, 'hash789');
  });
});

describe('createJwtAssertion', () => {
  it('should create a JWT with 3 dot-separated segments', () => {
    const config = {
      projectId: 'test-project',
      clientEmail: 'test@test-project.iam.gserviceaccount.com',
      privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2a2j9z8/lXmN3kK8Bx1xBHj9E4h5l2M6O7P8Q0R1S2T3U4V5W
6X7Y8Z9a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5
-----END RSA PRIVATE KEY-----`,
    };

    const jwt = createJwtAssertion(config);

    // JWT should have 3 parts separated by dots
    const parts = jwt.split('.');
    assert.strictEqual(parts.length, 3);
  });

  it('should encode header with correct alg and typ', () => {
    const config = {
      projectId: 'test-project',
      clientEmail: 'test@test-project.iam.gserviceaccount.com',
      privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2a2j9z8/lXmN3kK8Bx1xBHj9E4h5l2M6O7P8Q0R1S2T3U4V5W
6X7Y8Z9a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5
-----END RSA PRIVATE KEY-----`,
    };

    const jwt = createJwtAssertion(config);
    const headerB64 = jwt.split('.')[0];

    // Add padding if needed (base64url decode requires padding)
    const padded = headerB64 + '='.repeat((4 - headerB64.length % 4) % 4);
    const headerStr = Buffer.from(padded, 'base64').toString();

    const header = JSON.parse(headerStr);
    assert.strictEqual(header.alg, 'RS256');
    assert.strictEqual(header.typ, 'JWT');
  });

  it('should include correct claims in payload', () => {
    const config = {
      projectId: 'test-project',
      clientEmail: 'test@test-project.iam.gserviceaccount.com',
      privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA2a2j9z8/lXmN3kK8Bx1xBHj9E4h5l2M6O7P8Q0R1S2T3U4V5W
6X7Y8Z9a0b1c2d3e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3y4z5
-----END RSA PRIVATE KEY-----`,
    };

    const jwt = createJwtAssertion(config);
    const payloadB64 = jwt.split('.')[1];

    const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
    const payloadStr = Buffer.from(padded, 'base64').toString();

    const payload = JSON.parse(payloadStr);
    assert.strictEqual(payload.iss, 'test@test-project.iam.gserviceaccount.com');
    assert.strictEqual(payload.scope, 'https://www.googleapis.com/auth/datastore');
    assert.strictEqual(payload.aud, 'https://oauth2.googleapis.com/token');
    assert.ok(typeof payload.iat === 'number');
    assert.ok(typeof payload.exp === 'number');
    assert.strictEqual(payload.exp - payload.iat, 3600);
  });
});
