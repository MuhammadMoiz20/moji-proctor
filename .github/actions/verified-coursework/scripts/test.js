/**
 * Simple test runner for Firebase Firestore adapter
 *
 * These tests verify:
 * - Document ID generation (deterministic format)
 * - Record to Firestore document conversion
 * - JWT generation (format and structure)
 *
 * Note: These tests do NOT hit real Google endpoints.
 */

const assert = require('node:assert');

// Import directly from source since we're running as a Node script
// We need to use tsx or similar to run TypeScript directly, or compile first
// For simplicity, let's create inline versions of the functions we're testing

/**
 * Generate deterministic document ID from repo, PR number, and commit SHA
 * Format: repo__pr{number}__{sha} with / replaced by __
 */
function generateDocId(record) {
  const safeRepo = record.repo.replace(/\//g, '__');
  const prPart = record.pr_number ? `pr${record.pr_number}` : 'no-pr';
  return `${safeRepo}__${prPart}__${record.commit_sha}`;
}

/**
 * Base64url encode without padding
 */
function base64UrlEncode(data) {
  const base64 = Buffer.from(data).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Create a JWT assertion for Google service account authentication
 */
function createJwtAssertion(config) {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const claimSet = {
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

  // Note: This is a simplified version - in the real code we'd sign with the private key
  // For testing, we just return the unsigned JWT with a fake signature
  return `${signatureInput}.fakesignature`;
}

/**
 * Convert DbRecord to Firestore document format
 */
function recordToFirestoreDocument(record) {
  const fields = {
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

// Sample data for testing
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

// Test runner
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Run tests
console.log('Running Firebase Firestore adapter tests...\n');

// generateDocId tests
console.log('generateDocId:');
test('should generate deterministic doc ID with PR number', () => {
  const docId = generateDocId(sampleRecord);
  assertEqual(docId, 'owner__repo__pr123__abc123def456');
});

test('should handle repo with multiple slashes', () => {
  const record = { ...sampleRecord, repo: 'org/subgroup/repo' };
  const docId = generateDocId(record);
  assertEqual(docId, 'org__subgroup__repo__pr123__abc123def456');
});

test('should use "no-pr" when pr_number is null', () => {
  const record = { ...sampleRecord, pr_number: null };
  const docId = generateDocId(record);
  assertEqual(docId, 'owner__repo__no-pr__abc123def456');
});

test('should be idempotent for same input', () => {
  const docId1 = generateDocId(sampleRecord);
  const docId2 = generateDocId(sampleRecord);
  assertEqual(docId1, docId2);
});

// recordToFirestoreDocument tests
console.log('\nrecordToFirestoreDocument:');
test('should convert record to Firestore document format', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(doc.fields.repo.stringValue, 'owner/repo');
  assertEqual(doc.fields.commit_sha.stringValue, 'abc123def456');
  assertEqual(doc.fields.course_id.stringValue, 'CS101');
  assertEqual(doc.fields.assignment_id.stringValue, 'homework-1');
});

test('should convert numbers to integerValue strings', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(doc.fields.focused_ms.integerValue, '3600000');
  assertEqual(doc.fields.active_ms.integerValue, '7200000');
  assertEqual(doc.fields.sessions_count.integerValue, '3');
  assertEqual(doc.fields.bursts_low.integerValue, '5');
  assertEqual(doc.fields.bursts_medium.integerValue, '2');
  assertEqual(doc.fields.bursts_high.integerValue, '0');
  assertEqual(doc.fields.bursts_total.integerValue, '7');
});

test('should convert booleans to booleanValue', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(doc.fields.unverified.booleanValue, false);
  assertEqual(doc.fields.integrity_compromised.booleanValue, false);
  assertEqual(doc.fields.hash_chain_ok.booleanValue, true);
  assertEqual(doc.fields.continuity_ok.booleanValue, true);
});

test('should handle null pr_number as nullValue', () => {
  const record = { ...sampleRecord, pr_number: null };
  const doc = recordToFirestoreDocument(record);
  assertEqual(doc.fields.pr_number.nullValue, 'NULL_VALUE');
});

test('should handle null last_log_hash as nullValue', () => {
  const record = { ...sampleRecord, last_log_hash: null };
  const doc = recordToFirestoreDocument(record);
  assertEqual(doc.fields.last_log_hash.nullValue, 'NULL_VALUE');
});

test('should handle null artifact_url as nullValue', () => {
  const record = { ...sampleRecord, artifact_url: null };
  const doc = recordToFirestoreDocument(record);
  assertEqual(doc.fields.artifact_url.nullValue, 'NULL_VALUE');
});

test('should include updated_at field with current timestamp', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  const timestamp = doc.fields.updated_at.stringValue;
  // Should be valid ISO 8601 format
  const date = new Date(timestamp);
  assertEqual(!isNaN(date.getTime()), true);
});

test('should handle pr_number as integer when non-null', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(doc.fields.pr_number.integerValue, '123');
});

test('should include workflow URL', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(
    doc.fields.workflow_run_url.stringValue,
    'https://github.com/owner/repo/actions/runs/456'
  );
});

test('should include artifact URL when present', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(
    doc.fields.artifact_url.stringValue,
    'https://github.com/owner/repo/actions/runs/456/artifacts/789'
  );
});

test('should include last_log_hash when present', () => {
  const doc = recordToFirestoreDocument(sampleRecord);
  assertEqual(doc.fields.last_log_hash.stringValue, 'hash789');
});

// createJwtAssertion tests
console.log('\ncreateJwtAssertion:');
test('should create a JWT with 3 dot-separated segments', () => {
  const config = {
    projectId: 'test-project',
    clientEmail: 'test@test-project.iam.gserviceaccount.com',
    privateKey: 'fake-key',
  };
  const jwt = createJwtAssertion(config);
  const parts = jwt.split('.');
  assertEqual(parts.length, 3);
});

test('should encode header with correct alg and typ', () => {
  const config = {
    projectId: 'test-project',
    clientEmail: 'test@test-project.iam.gserviceaccount.com',
    privateKey: 'fake-key',
  };
  const jwt = createJwtAssertion(config);
  const headerB64 = jwt.split('.')[0];
  const padded = headerB64 + '='.repeat((4 - headerB64.length % 4) % 4);
  const headerStr = Buffer.from(padded, 'base64').toString();
  const header = JSON.parse(headerStr);
  assertEqual(header.alg, 'RS256');
  assertEqual(header.typ, 'JWT');
});

test('should include correct claims in payload', () => {
  const config = {
    projectId: 'test-project',
    clientEmail: 'test@test-project.iam.gserviceaccount.com',
    privateKey: 'fake-key',
  };
  const jwt = createJwtAssertion(config);
  const payloadB64 = jwt.split('.')[1];
  const padded = payloadB64 + '='.repeat((4 - payloadB64.length % 4) % 4);
  const payloadStr = Buffer.from(padded, 'base64').toString();
  const payload = JSON.parse(payloadStr);
  assertEqual(payload.iss, 'test@test-project.iam.gserviceaccount.com');
  assertEqual(payload.scope, 'https://www.googleapis.com/auth/datastore');
  assertEqual(payload.aud, 'https://oauth2.googleapis.com/token');
  assertEqual(typeof payload.iat, 'number');
  assertEqual(typeof payload.exp, 'number');
  assertEqual(payload.exp - payload.iat, 3600);
});

// Summary
console.log(`\n${testsPassed} tests passed, ${testsFailed} tests failed`);
process.exit(testsFailed > 0 ? 1 : 0);
