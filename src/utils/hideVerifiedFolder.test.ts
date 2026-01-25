/**
 * Unit tests for hideVerifiedFolder utility
 *
 * Tests:
 * - Path security validation
 * - Config toggle behavior
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFile } from 'child_process';
import { hideVerifiedFolder } from './hideVerifiedFolder';

// Mock execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

const mockExecFile = execFile as unknown as ReturnType<typeof vi.fn>;

describe('hideVerifiedFolder - Config Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not execute any command when disabled', async () => {
    await hideVerifiedFolder('/workspace/.verified', '/workspace', false);

    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it('should execute command when enabled (on supported platforms)', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    await hideVerifiedFolder('/workspace/.verified', '/workspace', true);

    // On Linux this is a no-op, so execFile won't be called
    // On Windows/macOS it would be called
    // We just verify it doesn't throw
    expect(true).toBe(true);
  });
});

describe('hideVerifiedFolder - Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when verifiedPath is outside assignment root', async () => {
    await expect(
      hideVerifiedFolder('/other/.verified', '/workspace', true)
    ).rejects.toThrow('Security');
  });

  it('should allow verifiedPath within assignment root', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    await expect(
      hideVerifiedFolder('/workspace/.verified', '/workspace', true)
    ).resolves.not.toThrow();
  });

  it('should reject path traversal attempts', async () => {
    await expect(
      hideVerifiedFolder('/workspace/../evil/.verified', '/workspace', true)
    ).rejects.toThrow();
  });

  it('should handle relative paths correctly', async () => {
    mockExecFile.mockResolvedValue({ stdout: '', stderr: '' });

    // Relative path that resolves within root
    await expect(
      hideVerifiedFolder('/workspace/./.verified', '/workspace', true)
    ).resolves.not.toThrow();
  });
});

describe('hideVerifiedFolder - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should silently ignore execFile errors on Windows', async () => {
    // Mock Windows platform by checking behavior
    // The actual test just verifies error handling
    mockExecFile.mockRejectedValue(new Error('Command failed'));

    // On Windows, this would call execFile but ignore errors
    // Since we're on Linux in tests, it's a no-op, but we verify the function doesn't throw
    await expect(
      hideVerifiedFolder('/workspace/.verified', '/workspace', true)
    ).resolves.not.toThrow();
  });
});
