/**
 * Moji Proctor Configuration Loader
 *
 * Reads moji-proctor.config.json from workspace root.
 * If missing, returns defaults (local-only mode).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MojiProctorConfig, DEFAULT_CONFIG } from '../types/config';

/**
 * Config file name
 */
export const CONFIG_FILENAME = 'moji-proctor.config.json';

/**
 * Read and parse moji-proctor.config.json from workspace root
 *
 * @param workspaceRoot - Absolute path to workspace root
 * @returns Parsed configuration or defaults if file not found
 */
export async function readConfig(workspaceRoot: string): Promise<MojiProctorConfig> {
  try {
    const filePath = path.join(workspaceRoot, CONFIG_FILENAME);
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(content) as MojiProctorConfig;

    // Merge with defaults for nested objects
    return mergeWithDefaults(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // Config file not found - return defaults (local-only mode)
      return { online_signals: { ...DEFAULT_CONFIG.online_signals, enabled: false, server_url: '' } };
    }
    throw error;
  }
}

/**
 * Merge user config with defaults
 *
 * @param config - User-provided config
 * @returns Merged configuration
 */
function mergeWithDefaults(config: MojiProctorConfig): MojiProctorConfig {
  const merged: MojiProctorConfig = { ...config };

  // Merge burst_thresholds with defaults
  if (config.burst_thresholds) {
    merged.burst_thresholds = {
      ...DEFAULT_CONFIG.burst_thresholds,
      ...config.burst_thresholds,
    };
  }

  // Merge online_signals with defaults
  if (config.online_signals) {
    merged.online_signals = {
      api_base_path: DEFAULT_CONFIG.online_signals.api_base_path,
      max_batch: DEFAULT_CONFIG.online_signals.max_batch,
      flush_interval_ms: DEFAULT_CONFIG.online_signals.flush_interval_ms,
      max_queue: DEFAULT_CONFIG.online_signals.max_queue,
      top_paths_limit: DEFAULT_CONFIG.online_signals.top_paths_limit,
      ...config.online_signals,
    };
  }

  // Set defaults for ignore if not provided
  if (!merged.ignore) {
    merged.ignore = DEFAULT_CONFIG.ignore;
  }

  return merged;
}

/**
 * Validate online signals configuration
 *
 * @param config - Configuration to validate
 * @returns Validation result with error message if invalid
 */
export function validateOnlineSignalsConfig(
  config: MojiProctorConfig
): { valid: boolean; error?: string } {
  if (!config.online_signals?.enabled) {
    return { valid: true };
  }

  const { server_url, api_base_path } = config.online_signals;

  if (!server_url || typeof server_url !== 'string') {
    return { valid: false, error: 'online_signals.server_url is required when enabled' };
  }

  try {
    const url = new URL(server_url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, error: 'server_url must use https:// or http://' };
    }
  } catch {
    return { valid: false, error: 'server_url must be a valid URL' };
  }

  if (api_base_path !== undefined && typeof api_base_path !== 'string') {
    return { valid: false, error: 'online_signals.api_base_path must be a string if provided' };
  }

  return { valid: true };
}
