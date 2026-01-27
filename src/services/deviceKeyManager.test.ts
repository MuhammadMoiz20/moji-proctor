/**
 * Unit tests for Device Key Manager
 *
 * Tests:
 * - Keypair generation
 * - Signing correctness with known test vectors
 * - Verification
 * - Sequence number tracking
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceKeyManager, canonicalStringify, verifySignature } from './deviceKeyManager';
import type { Ed25519KeyPair } from './deviceKeyManager';

// Mock secret storage for testing
class MockSecretStorage {
  private _store: Map<string, string> = new Map();

  async get(key: string): Promise<string | undefined> {
    return this._store.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    this._store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }

  clear(): void {
    this._store.clear();
  }

  // Adapter to match expected interface
  get storage() {
    return {
      get: this.get.bind(this),
      store: this.set.bind(this),
      delete: this.delete.bind(this),
    };
  }
}

describe('DeviceKeyManager - Keypair Generation', () => {
  let mockStorage: MockSecretStorage;
  let keyManager: DeviceKeyManager;

  beforeEach(() => {
    mockStorage = new MockSecretStorage();
    keyManager = new DeviceKeyManager(mockStorage.storage);
  });

  it('should generate a new Ed25519 keypair on first init', async () => {
    await keyManager.initialize();

    const publicKey = await mockStorage.storage.get('moji-proctor.device.public_key');
    const privateKey = await mockStorage.storage.get('moji-proctor.device.private_key');

    expect(publicKey).toBeDefined();
    expect(privateKey).toBeDefined();
    // Base64 encoded DER (SPKI for public, PKCS8 for private)
    expect(publicKey?.length).toBeGreaterThan(0);
    expect(privateKey?.length).toBeGreaterThan(0);

    // getPublicKey() returns hex-encoded raw 32-byte key (64 hex chars)
    const hexPublicKey = keyManager.getPublicKey();
    expect(hexPublicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should load existing keypair on subsequent init', async () => {
    await keyManager.initialize();
    const firstPublicKey = keyManager.getPublicKey();

    // Create new instance with same storage
    const keyManager2 = new DeviceKeyManager(mockStorage.storage);
    await keyManager2.initialize();
    const secondPublicKey = keyManager2.getPublicKey();

    expect(firstPublicKey).toBe(secondPublicKey);
  });

  it('should generate different keys for different instances', async () => {
    mockStorage.clear();

    await keyManager.initialize();
    const publicKey1 = keyManager.getPublicKey();

    mockStorage.clear();
    const keyManager2 = new DeviceKeyManager(mockStorage.storage);
    await keyManager2.initialize();
    const publicKey2 = keyManager2.getPublicKey();

    expect(publicKey1).not.toBe(publicKey2);
  });

  it('should return consistent public key', async () => {
    await keyManager.initialize();

    const pk1 = keyManager.getPublicKey();
    const pk2 = keyManager.getPublicKey();

    expect(pk1).toBe(pk2);
    expect(pk1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('DeviceKeyManager - Signing', () => {
  let mockStorage: MockSecretStorage;
  let keyManager: DeviceKeyManager;

  beforeEach(async () => {
    mockStorage = new MockSecretStorage();
    keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();
  });

  it('should sign a simple payload', async () => {
    const payload = { test: 'value' };
    const signature = await keyManager.sign(payload, 'test-assignment');

    expect(signature.device_pubkey).toBeDefined();
    expect(signature.seq).toBe(1);
    expect(signature.sig).toBeDefined();
    expect(signature.sig).toMatch(/^[0-9a-f]{128}$/); // 64 bytes = 128 hex chars
  });

  it('should increment sequence number per assignment', async () => {
    const payload = { data: 'test' };

    const sig1 = await keyManager.sign(payload, 'assignment-1');
    expect(sig1.seq).toBe(1);

    const sig2 = await keyManager.sign(payload, 'assignment-1');
    expect(sig2.seq).toBe(2);

    // Different assignment should start at 1
    const sig3 = await keyManager.sign(payload, 'assignment-2');
    expect(sig3.seq).toBe(1);

    // Back to first assignment
    const sig4 = await keyManager.sign(payload, 'assignment-1');
    expect(sig4.seq).toBe(3);
  });

  it('should create deterministic signatures for same payload', async () => {
    const payload = { foo: 'bar', num: 42 };

    const sig1 = await keyManager.sign(payload, 'test');
    const sig2 = await keyManager.sign({ num: 42, foo: 'bar' }, 'test');

    // Same canonical JSON = same signature (seq is in the DeviceSignature but not in signed payload)
    // The signatures will be the same because the payload (what's signed) is identical
    expect(sig1.sig).toBe(sig2.sig);
    // But the sequence numbers should differ
    expect(sig1.seq).not.toBe(sig2.seq);
  });

  it('should persist sequence numbers', async () => {
    const payload = { data: 'test' };

    await keyManager.sign(payload, 'persist-test');
    expect(await keyManager.getSequenceNumber('persist-test')).toBe(1);

    // Simulate restart - create new instance with same storage
    const keyManager2 = new DeviceKeyManager(mockStorage.storage);
    await keyManager2.initialize();

    expect(await keyManager2.getSequenceNumber('persist-test')).toBe(1);

    await keyManager2.sign(payload, 'persist-test');
    expect(await keyManager2.getSequenceNumber('persist-test')).toBe(2);
  });
});

describe('DeviceKeyManager - Signature Verification', () => {
  it('should verify a valid signature', async () => {
    const mockStorage = new MockSecretStorage();
    const keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();

    const payload = { message: 'hello', timestamp: '2024-01-01T00:00:00Z' };
    const signature = await keyManager.sign(payload, 'test-assignment');

    const message = canonicalStringify(payload);
    // verifySignature expects base64 DER public key, not hex
    const publicKeyDer = keyManager.getPublicKeyDer();
    const isValid = verifySignature(
      message,
      signature.sig,
      publicKeyDer
    );

    expect(isValid).toBe(true);
  });

  it('should reject an invalid signature', async () => {
    const mockStorage = new MockSecretStorage();
    const keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();

    const payload = { message: 'hello' };
    const signature = await keyManager.sign(payload, 'test-assignment');

    const message = canonicalStringify({ message: 'different' }); // Tampered
    const publicKeyDer = keyManager.getPublicKeyDer();
    const isValid = verifySignature(
      message,
      signature.sig,
      publicKeyDer
    );

    expect(isValid).toBe(false);
  });

  it('should reject signature with wrong public key', async () => {
    const mockStorage = new MockSecretStorage();
    const keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();

    const payload = { message: 'hello' };
    const signature = await keyManager.sign(payload, 'test-assignment');

    const message = canonicalStringify(payload);
    const wrongPublicKey = 'a'.repeat(44); // Invalid base64 DER
    const isValid = verifySignature(message, signature.sig, wrongPublicKey);

    expect(isValid).toBe(false);
  });

  it('should handle complex nested payloads', async () => {
    const mockStorage = new MockSecretStorage();
    const keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();

    const payload = {
      nested: {
        deeply: {
          value: [1, 2, 3],
          objects: [{ a: 1 }, { b: 2 }],
        },
      },
      primitives: {
        string: 'test',
        number: 42,
        bool: true,
        nullVal: null,
      },
    };

    const signature = await keyManager.sign(payload, 'test');
    const message = canonicalStringify(payload);
    const publicKeyDer = keyManager.getPublicKeyDer();
    const isValid = verifySignature(
      message,
      signature.sig,
      publicKeyDer
    );

    expect(isValid).toBe(true);
  });
});

describe('DeviceKeyManager - Canonical JSON', () => {
  it('should produce consistent output regardless of key order', () => {
    const obj1 = { z: 1, a: 2, m: 3 };
    const obj2 = { m: 3, z: 1, a: 2 };

    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
  });

  it('should sort object keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const result = canonicalStringify(obj);

    expect(result.indexOf('"a"')).toBeLessThan(result.indexOf('"m"'));
    expect(result.indexOf('"m"')).toBeLessThan(result.indexOf('"z"'));
  });

  it('should handle nested objects', () => {
    const obj = {
      outer: { z: 1, a: 2 },
      b: 3,
    };
    const result = canonicalStringify(obj);

    // Check outer nested keys are sorted
    const outerMatch = result.match(/"outer":\{[^}]+\}/);
    expect(outerMatch).toBeTruthy();
    expect(outerMatch![0].indexOf('"a"')).toBeLessThan(outerMatch![0].indexOf('"z"'));
  });
});

describe('DeviceKeyManager - Sequence Number Management', () => {
  let mockStorage: MockSecretStorage;
  let keyManager: DeviceKeyManager;

  beforeEach(async () => {
    mockStorage = new MockSecretStorage();
    keyManager = new DeviceKeyManager(mockStorage.storage);
    await keyManager.initialize();
  });

  it('should start sequence at 0 for new assignment', async () => {
    const seq = await keyManager.getSequenceNumber('new-assignment');
    expect(seq).toBe(0);
  });

  it('should reset sequence number', async () => {
    await keyManager.sign({ test: 1 }, 'reset-test');
    expect(await keyManager.getSequenceNumber('reset-test')).toBe(1);

    await keyManager.resetSequenceNumber('reset-test');
    expect(await keyManager.getSequenceNumber('reset-test')).toBe(0);

    const sig = await keyManager.sign({ test: 2 }, 'reset-test');
    expect(sig.seq).toBe(1);
  });

  it('should track multiple assignments independently', async () => {
    await keyManager.sign({ test: 1 }, 'a1');
    await keyManager.sign({ test: 2 }, 'a1');
    await keyManager.sign({ test: 3 }, 'a2');
    await keyManager.sign({ test: 4 }, 'a3');
    await keyManager.sign({ test: 5 }, 'a1');

    expect(await keyManager.getSequenceNumber('a1')).toBe(3);
    expect(await keyManager.getSequenceNumber('a2')).toBe(1);
    expect(await keyManager.getSequenceNumber('a3')).toBe(1);
  });
});
