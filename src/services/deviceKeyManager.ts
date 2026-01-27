/**
 * Device Key Manager
 *
 * Manages Ed25519 device keypair for anti-spoofing.
 * Private key stored securely in VS Code SecretStorage.
 * Public key registered with server on first auth.
 */

import * as crypto from 'crypto';

/**
 * Storage keys for VS Code SecretStorage
 */
export const DEVICE_PRIVATE_KEY_KEY = 'moji-proctor.device.private_key';
export const DEVICE_PUBLIC_KEY_KEY = 'moji-proctor.device.public_key';
export const DEVICE_SEQ_KEY_PREFIX = 'moji-proctor.device.seq.';

/**
 * Ed25519 keypair (DER encoded for storage)
 */
export interface Ed25519KeyPair {
  /** Private key (DER, base64 encoded) */
  privateKey: string;
  /** Public key (DER, base64 encoded) */
  publicKey: string;
}

/**
 * Device signature result
 */
export interface DeviceSignature {
  /** Device public key (hex encoded) */
  device_pubkey: string;
  /** Monotonic sequence number */
  seq: number;
  /** Signature of payload (64 bytes, hex encoded Ed25519) */
  sig: string;
}

/**
 * Canonical JSON stringify for consistent signatures
 *
 * Sorts object keys alphabetically to produce deterministic JSON.
 *
 * @param value - Value to stringify
 * @returns Canonical JSON string
 */
function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer, 0);
}

/**
 * Replacer for canonical JSON (sorted keys)
 */
function canonicalReplacer(key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === 'object' && item !== null
        ? JSON.parse(canonicalStringify(item))
        : item
    );
  }

  const sortedKeys = Object.keys(value).sort();
  const sortedObj: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    const v = (value as Record<string, unknown>)[k];
    sortedObj[k] =
      typeof v === 'object' && v !== null
        ? JSON.parse(canonicalStringify(v))
        : v;
  }
  return sortedObj;
}

/**
 * Generate Ed25519 keypair and return as base64-encoded DER keys
 *
 * @returns Keypair with base64-encoded DER keys
 */
function generateEd25519KeyPair(): Ed25519KeyPair {
  // Generate Ed25519 keypair
  const keyPair = crypto.generateKeyPairSync('ed25519');

  // Export as DER buffers
  const privateKeyBuffer = keyPair.privateKey.export({
    format: 'der',
    type: 'pkcs8',
  });
  const publicKeyBuffer = keyPair.publicKey.export({
    format: 'der',
    type: 'spki',
  });

  // Encode as base64 for storage
  return {
    privateKey: privateKeyBuffer.toString('base64'),
    publicKey: publicKeyBuffer.toString('base64'),
  };
}

/**
 * Create a KeyObject from base64 DER Ed25519 private key
 *
 * @param privateKeyBase64 - Base64-encoded DER private key
 * @returns KeyObject for signing
 */
function privateKeyFromBase64(privateKeyBase64: string): crypto.KeyObject {
  const privateKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
  return crypto.createPrivateKey({
    key: privateKeyBuffer,
    format: 'der',
    type: 'pkcs8',
  });
}

/**
 * Create a KeyObject from base64 DER Ed25519 public key
 *
 * @param publicKeyBase64 - Base64-encoded DER public key
 * @returns KeyObject for verification
 */
function publicKeyFromBase64(publicKeyBase64: string): crypto.KeyObject {
  const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
  return crypto.createPublicKey({
    key: publicKeyBuffer,
    format: 'der',
    type: 'spki',
  });
}

/**
 * Extract raw 32-byte public key from DER base64
 * For Ed25519 SPKI, the raw key is the last 32 bytes
 *
 * @param publicKeyBase64 - Base64-encoded DER public key
 * @returns Hex-encoded 32-byte raw public key
 */
function extractRawPublicKeyHex(publicKeyBase64: string): string {
  const publicKeyBuffer = Buffer.from(publicKeyBase64, 'base64');
  // For Ed25519 SPKI, the raw key is at the end
  const rawKeyBytes = publicKeyBuffer.slice(-32);
  return rawKeyBytes.toString('hex');
}

/**
 * Sign message using Ed25519
 *
 * @param message - Message to sign
 * @param privateKeyBase64 - Base64-encoded DER private key
 * @returns Signature (hex encoded, 64 bytes)
 */
function signEd25519(message: string, privateKeyBase64: string): string {
  const keyObject = privateKeyFromBase64(privateKeyBase64);
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), keyObject);
  return signature.toString('hex');
}

/**
 * Verify Ed25519 signature
 *
 * @param message - Message that was signed
 * @param signatureHex - Signature (hex encoded, 64 bytes)
 * @param publicKeyBase64 - Base64-encoded DER public key
 * @returns True if signature is valid
 */
export function verifySignature(
  message: string,
  signatureHex: string,
  publicKeyBase64: string
): boolean {
  try {
    const keyObject = publicKeyFromBase64(publicKeyBase64);
    const signature = Buffer.from(signatureHex, 'hex');
    return crypto.verify(null, Buffer.from(message, 'utf8'), keyObject, signature);
  } catch {
    return false;
  }
}

/**
 * Device Key Manager
 *
 * Generates and stores Ed25519 keypair for signing signals.
 * Tracks sequence numbers per assignment for replay protection.
 */
export class DeviceKeyManager {
  private keyPair: Ed25519KeyPair | null = null;
  private sequenceNumbers: Map<string, number> = new Map();

  constructor(
    private readonly secretStorage: {
      get: (key: string) => Promise<string | undefined>;
      store: (key: string, value: string) => Promise<void>;
      delete: (key: string) => Promise<void>;
    }
  ) {}

  /**
   * Initialize the key manager - load or create keypair
   */
  async initialize(): Promise<void> {
    const existingPrivateKey = await this.secretStorage.get(DEVICE_PRIVATE_KEY_KEY);
    const existingPublicKey = await this.secretStorage.get(DEVICE_PUBLIC_KEY_KEY);

    if (existingPrivateKey && existingPublicKey) {
      this.keyPair = {
        privateKey: existingPrivateKey,
        publicKey: existingPublicKey,
      };
    } else {
      // Generate new keypair
      this.keyPair = generateEd25519KeyPair();
      await this.secretStorage.store(DEVICE_PRIVATE_KEY_KEY, this.keyPair.privateKey);
      await this.secretStorage.store(DEVICE_PUBLIC_KEY_KEY, this.keyPair.publicKey);
    }
  }

  /**
   * Get the device public key (hex encoded raw key for API transmission)
   *
   * @returns Public key (hex encoded, 64 chars)
   * @throws Error if not initialized
   */
  getPublicKey(): string {
    if (!this.keyPair) {
      throw new Error('DeviceKeyManager not initialized');
    }
    return extractRawPublicKeyHex(this.keyPair.publicKey);
  }

  /**
   * Get the public key in base64 DER format (for signature verification)
   *
   * @returns Public key (base64 encoded DER)
   * @throws Error if not initialized
   */
  getPublicKeyDer(): string {
    if (!this.keyPair) {
      throw new Error('DeviceKeyManager not initialized');
    }
    return this.keyPair.publicKey;
  }

  /**
   * Sign a payload for a specific assignment
   *
   * Creates an Ed25519 signature over the canonical JSON payload.
   * Increments and includes the sequence number for replay protection.
   *
   * @param payload - Object to sign (will be canonicalized)
   * @param assignmentId - Assignment identifier for sequence tracking
   * @returns Device signature with public key, sequence number, and signature
   */
  async sign(payload: unknown, assignmentId: string): Promise<DeviceSignature> {
    if (!this.keyPair) {
      throw new Error('DeviceKeyManager not initialized');
    }

    // Get and increment sequence number
    const seq = await this.getNextSequenceNumber(assignmentId);

    // Create the message to sign: canonical JSON of payload
    const message = canonicalStringify(payload);
    console.log('[DeviceKeyManager] Signing payload:', message.substring(0, 200) + '...');
    console.log('[DeviceKeyManager] Seq:', seq, 'Assignment:', assignmentId);

    // Sign using Ed25519
    const signature = signEd25519(message, this.keyPair.privateKey);
    console.log('[DeviceKeyManager] Signature:', signature.substring(0, 40) + '...');

    return {
      device_pubkey: this.getPublicKey(),
      seq,
      sig: signature,
    };
  }

  /**
   * Get current sequence number for an assignment
   *
   * @param assignmentId - Assignment identifier
   * @returns Current sequence number
   */
  async getSequenceNumber(assignmentId: string): Promise<number> {
    // Check in-memory cache first
    if (this.sequenceNumbers.has(assignmentId)) {
      return this.sequenceNumbers.get(assignmentId)!;
    }

    // Load from persistent storage
    const storageKey = DEVICE_SEQ_KEY_PREFIX + assignmentId;
    const storedValue = await this.secretStorage.get(storageKey);
    const seq = storedValue ? parseInt(storedValue, 10) : 0;

    this.sequenceNumbers.set(assignmentId, seq);
    return seq;
  }

  /**
   * Reset sequence number for an assignment (testing only)
   *
   * @param assignmentId - Assignment identifier
   */
  async resetSequenceNumber(assignmentId: string): Promise<void> {
    this.sequenceNumbers.set(assignmentId, 0);
    const storageKey = DEVICE_SEQ_KEY_PREFIX + assignmentId;
    await this.secretStorage.store(storageKey, '0');
  }

  /**
   * Set sequence number for an assignment (resync after partial uploads)
   *
   * @param assignmentId - Assignment identifier
   * @param seq - Sequence number to set
   */
  async setSequenceNumber(assignmentId: string, seq: number): Promise<void> {
    const normalized = Math.max(0, Math.floor(seq));
    this.sequenceNumbers.set(assignmentId, normalized);
    const storageKey = DEVICE_SEQ_KEY_PREFIX + assignmentId;
    await this.secretStorage.store(storageKey, normalized.toString());
  }

  /**
   * Get next sequence number and persist it
   *
   * @param assignmentId - Assignment identifier
   * @returns Next sequence number to use
   */
  private async getNextSequenceNumber(assignmentId: string): Promise<number> {
    const currentSeq = await this.getSequenceNumber(assignmentId);
    const nextSeq = currentSeq + 1;

    this.sequenceNumbers.set(assignmentId, nextSeq);

    // Persist to storage
    const storageKey = DEVICE_SEQ_KEY_PREFIX + assignmentId;
    await this.secretStorage.store(storageKey, nextSeq.toString());

    return nextSeq;
  }
}

/**
 * Export canonical stringify for external use
 */
export { canonicalStringify };
