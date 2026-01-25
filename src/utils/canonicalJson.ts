/**
 * Canonical JSON stringify utility
 *
 * CONTRACT FREEZE: This function MUST produce deterministic, stable JSON output.
 * - Object keys are sorted alphabetically
 * - No trailing commas
 * - No extra whitespace
 * - Arrays preserve order
 *
 * Used for event hash generation. Any change here breaks hash chain verification.
 *
 * See .verified-dev/CONTRACTS.md
 */

/**
 * Stringify a value to canonical JSON format
 *
 * @param value - Any JSON-serializable value
 * @returns Deterministic JSON string with sorted keys
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer, 0);
}

/**
 * Replacer function for JSON.stringify that sorts object keys
 *
 * @param key - Object key (unused in replacer pattern)
 * @param value - Value to process
 * @returns Processed value
 */
function canonicalReplacer(key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    // Arrays: preserve order, recursively process elements
    return value.map((item) =>
      typeof item === 'object' && item !== null
        ? JSON.parse(canonicalStringify(item))
        : item
    );
  }

  // Objects: sort keys and recursively process values
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
 * Parse a canonical JSON string
 *
 * @param json - JSON string to parse
 * @returns Parsed value
 */
export function canonicalParse<T = unknown>(json: string): T {
  return JSON.parse(json) as T;
}
