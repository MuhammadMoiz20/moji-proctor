# Agent 2: Burst Detection Service

## Implementation Status: Complete

### Files Modified
- `src/services/burstDetector.ts` - Full implementation (was stub)
- `src/extension.ts` - Added session ID wiring for burst detector

### Files Created
- `src/services/burstDetector.test.ts` - Unit tests
- `vitest.config.ts` - Test runner configuration
- `.verified-dev/agents/agent2.md` - This file

---

## How It Works

The burst detection service monitors `TextDocument` change events and detects rapid editing patterns that may indicate copy-paste or AI-generated code.

### Rolling Window Algorithm
- Per-file rolling window (default: 5 seconds)
- Tracks: timestamp, lines added/removed, chars changed
- Automatically prunes events outside the window

### Severity Classification
| Severity | Edit Count | Char Count |
|----------|------------|------------|
| Low      | 3+         | 100+       |
| Medium   | 5+         | 500+       |
| High     | 10+        | 1000+      |

Thresholds scale based on actual window duration vs configured window.

### Features
- **Minimum edit size filter**: Ignores typo fixes (< 10 chars)
- **Burst cooldown**: 10s cooldown per file prevents spam
- **Per-file tracking**: Independent windows for each file

---

## How to Test

### Unit Tests
```bash
npm run test
```

Runs vitest unit tests covering:
- Severity classification
- Rolling window pruning
- Cooldown behavior
- Minimum edit size filtering
- Summary statistics

### Manual Testing (Quick)

**Trigger a low-severity burst:**
1. Open any tracked file in the repo
2. Quickly make 3+ edits of ~100+ chars each within 5 seconds
3. Check `.verified/log.jsonl` for BURST_FLAG event

**Fast way to generate test edits:**
```bash
# In a test file, paste this function repeatedly:
function testFunction() {
  console.log("This is a test function with enough characters to trigger the burst detector when pasted multiple times quickly.");
}
```

Paste it 3+ times within 5 seconds to trigger low severity.

### Manual Testing (High Severity)
To trigger high severity (10+ edits, 1000+ chars):
1. Create a large code snippet (~150 chars)
2. Paste it 10+ times as fast as possible
3. Or use a macro/automation tool

---

## Configuration

Default configuration in `burstDetector.ts`:
```typescript
const DEFAULT_THRESHOLDS = {
  windowMs: 5000,              // 5 second window
  lowEditThreshold: 3,         // 3+ edits = low
  mediumEditThreshold: 5,      // 5+ edits = medium
  highEditThreshold: 10,       // 10+ edits = high
  lowCharThreshold: 100,       // 100+ chars = low
  mediumCharThreshold: 500,    // 500+ chars = medium
  highCharThreshold: 1000,     // 1000+ chars = high
};

const MIN_EDIT_SIZE = 10;       // Ignore < 10 char edits
const BURST_COOLDOWN = 10000;   // 10s cooldown per file
```

Can be customized via `BurstDetectorConfig` passed to constructor.

---

## BURST_FLAG Event Payload

```typescript
interface BurstFlagPayload {
  severity: 'low' | 'medium' | 'high';
  edit_count: number;    // Number of edits in window
  char_count: number;    // Total chars changed in window
  window_ms: number;     // Actual window duration
  file_path: string;     // Absolute file path
}
```

---

## Known Limitations

1. **Only tracks during active sessions**: Requires VS Code focused and session active
2. **Per-file windows**: Copy-pasting across files won't aggregate counts
3. **Best-effort**: Determined adversaries can bypass detection
4. **No paste detection**: Cannot distinguish between typing and pasting (VS Code API limitation)

---

## Integration Notes

### Changed in extension.ts:
```typescript
// After timeTracker.startSession(), set session ID on burst detector
const sessionId = timeTracker.getSessionId();
if (sessionId) {
  (burstDetector as BurstDetector).setSessionId(sessionId);
}
burstDetector.start();
```

This ensures burst events have the correct session ID for hash chaining.
