/**
 * Ignore pattern matching utility
 *
 * Provides .gitignore-style pattern matching for excluding files
 * from tracking and checkpoint generation.
 *
 * Default ignore patterns are always included.
 * Additional patterns can be loaded from .verifiedignore if present.
 */

/**
 * Default patterns to ignore (similar to .gitignore defaults)
 */
const DEFAULT_IGNORE_PATTERNS = [
  '.verified/',
  '.git/',
  'node_modules/',
  '.vscode-test/',
  '*.log',
  '.DS_Store',
  'Thumbs.db',
  '*.swp',
  '*.swo',
  '*~',
];

/**
 * Ignore matcher class
 *
 * Tests file paths against .gitignore-style patterns.
 */
export class IgnoreMatcher {
  private patterns: string[];

  constructor(additionalPatterns: string[] = []) {
    this.patterns = [...DEFAULT_IGNORE_PATTERNS, ...additionalPatterns];
  }

  /**
   * Test if a path matches any ignore pattern
   *
   * @param path - File path relative to git root
   * @returns true if path should be ignored
   */
  public ignores(path: string): boolean {
    const normalizedPath = this.normalizePath(path);

    for (const pattern of this.patterns) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Add additional ignore patterns
   *
   * @param patterns - Patterns to add
   */
  public addPatterns(patterns: string[]): void {
    this.patterns.push(...patterns);
  }

  /**
   * Normalize path for matching (forward slashes, remove leading ./)
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
  }

  /**
   * Match a path against a single pattern
   *
   * Supports:
   * - Exact match: "node_modules"
   * - Directory suffix: "node_modules/"
   * - Leading slash: "/.verified/"
   * - Wildcards: "*.log"
   * - Trailing slash for directory-only: ".git/"
   */
  private matchPattern(path: string, pattern: string): boolean {
    const normalizedPattern = this.normalizePath(pattern);

    // Pattern ending with / matches directory contents
    if (normalizedPattern.endsWith('/')) {
      const dirPattern = normalizedPattern.slice(0, -1);
      return (
        path === dirPattern ||
        path.startsWith(dirPattern + '/')
      );
    }

    // Leading / anchors to root
    if (normalizedPattern.startsWith('/')) {
      const rootPattern = normalizedPattern.slice(1);
      if (path === rootPattern) {
        return true;
      }
      // Check if path starts with pattern (as directory)
      if (path.startsWith(rootPattern + '/')) {
        return true;
      }
      return false;
    }

    // Wildcard pattern: *.log
    if (normalizedPattern.includes('*')) {
      const regex = this.patternToRegex(normalizedPattern);
      return regex.test(path);
    }

    // Exact match or directory prefix match
    if (path === normalizedPattern) {
      return true;
    }
    if (path.startsWith(normalizedPattern + '/')) {
      return true;
    }

    // Basename match for "*.ext" style patterns without leading /
    if (normalizedPattern.startsWith('*.')) {
      const ext = normalizedPattern.slice(1);
      if (path.endsWith(ext)) {
        // Ensure it's a basename match, not just ending with extension
        const basename = path.split('/').pop() || '';
        if (basename === path || basename.endsWith(ext)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Convert a glob pattern to a RegExp
   */
  private patternToRegex(pattern: string): RegExp {
    // Escape regex special chars except * and ?
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp('^' + regexStr + '$');
  }
}

/**
 * Create a default ignore matcher
 *
 * @returns IgnoreMatcher with default patterns
 */
export function createDefaultMatcher(): IgnoreMatcher {
  return new IgnoreMatcher();
}

/**
 * Parse patterns from a .verifiedignore file content
 *
 * @param content - File content
 * @returns Array of non-empty, non-comment patterns
 */
export function parseIgnoreFile(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}
