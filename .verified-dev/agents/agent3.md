# Agent 3: Checkpoints and Unverified Change Detection

**Branch:** `agent/ext/checkpoints-unverified`
**Status:** Complete
**Agent:** Agent 3

## Scope Delivered

- Full implementation of CheckpointService
- Manifest generation (path + sha256 + bytes + lineCount)
- Checkpoint creation at session_start/session_end/report_generation
- Unverified change detection comparing current state to last checkpoint
- LOC delta summary using git diff --numstat
- CHECKPOINT_CREATED and UNVERIFIED_CHANGES event emission

## Implementation Details

### Manifest Generation
- Scans git root directory recursively
- Creates FileEntry records for all non-ignored files
- Each entry includes:
  - `path`: Relative path from git root
  - `sha256`: SHA-256 hash of file contents
  - `size`: File size in bytes
  - `mtime`: Unix timestamp of last modification
  - `lineCount`: Number of lines in the file
- Respects ignore patterns from IgnoreMatcher (.verified/, .git/, node_modules/, etc.)

### Checkpoint Lifecycle
Checkpoints are created at three key points:

1. **Session End (manual or close)**
   - When user runs "End Session" command
   - When extension deactivates (VS Code closes)

2. **Report Generation**
   - When user runs "Generate Report" command

3. **Unverified Changes Detection**
   - On session start, compares current state to last checkpoint
   - If differences found, emits UNVERIFIED_CHANGES event

### Unverified Change Detection
- Compares current manifest with last checkpoint's manifest
- Detects three types of changes:
  - `added`: File exists now but not in checkpoint
  - `modified`: File exists in both but SHA-256 differs
  - `deleted`: File in checkpoint but not current

### LOC Delta Summary
- Uses `git diff --numstat` to get accurate line addition/deletion counts
- Falls back gracefully if git is unavailable
- Provides `linesAdded` and `linesDeleted` fields in UnverifiedChange

## Configuration

No runtime configuration needed. The service uses:
- `IgnoreMatcher` with default patterns
- Git root path for file scanning
- Session ID for event emission

## Events Emitted

| Event Type | Payload | When |
|------------|---------|------|
| CHECKPOINT_CREATED | checkpoint_id, file_count, log_head_hash | After checkpoint written |
| UNVERIFIED_CHANGES | changes[], last_checkpoint_id | Changes detected at session start |

## Files Modified

| File | Changes |
|------|---------|
| `src/services/checkpointService.ts` | Full implementation (was stub) |
| `src/types/checkpoints.ts` | Added `lineCount` to FileEntry |
| `src/extension.ts` | Added checkpoint creation at session end, report generation, and unverified change detection at session start |

## API

### ICheckpointService Interface

```typescript
interface ICheckpointService {
  /** Create a checkpoint of current workspace state */
  createCheckpoint(options: CheckpointOptions): Promise<string>;

  /** Detect changes since last checkpoint */
  detectUnverifiedChanges(sessionId: string): Promise<UnverifiedChange[]>;

  /** Get the latest checkpoint ID */
  getLastCheckpoint(): Promise<string | null>;

  /** Generate manifest for current workspace state */
  generateManifest(): Promise<FileEntry[]>;

  /** Compare two manifests and return differences */
  compareManifests(previous: FileEntry[], current: FileEntry[]): UnverifiedChange[];
}
```

### UnverifiedChange Interface

```typescript
interface UnverifiedChange {
  path: string;
  change_type: 'added' | 'modified' | 'deleted';
  linesAdded?: number;   // From git diff --numstat
  linesDeleted?: number; // From git diff --numstat
}
```

## How to Test Manually

### Prerequisites
1. Run `npm install && npm run compile`
2. Create `.verified/assignment.json` in a git repo:
   ```json
   {
     "assignment_id": "test-assignment",
     "course_name": "Test Course",
     "student_name": "Test Student",
     "start_date": "2025-01-01T00:00:00Z",
     "end_date": "2025-12-31T23:59:59Z"
   }
   ```
3. Press F5 to open Extension Development Host

### Test 1: First Session - No Previous Checkpoint
1. Open the test workspace
2. Wait for session to start
3. Check `.verified/log.jsonl` - should NOT contain UNVERIFIED_CHANGES
4. Run "Moji Proctor: End Session"
5. Verify `.verified/checkpoints/checkpoint-*.json` was created
6. Check checkpoint contains:
   - `checkpoint_id`
   - `created_at`
   - `log_head_hash`
   - `files` array with entries
7. Each file entry should have: `path`, `sha256`, `size`, `mtime`, `lineCount`

### Test 2: Unverified Changes Detection
1. With VS Code closed, edit a file in the repo (simulating changes while not tracked)
   ```bash
   echo "unverified change" >> test.txt
   ```
2. Reopen VS Code (activates extension, starts new session)
3. Check `.verified/log.jsonl` - should contain UNVERIFIED_CHANGES event
4. Event payload should show:
   - `changes` array with the modified file
   - `last_checkpoint_id` from previous checkpoint

### Test 3: No Changes - Clean Session
1. After a checkpoint was created, close and reopen VS Code
2. Check `.verified/log.jsonl` - should NOT contain new UNVERIFIED_CHANGES
3. (Because no files changed between sessions)

### Test 4: Multiple Change Types
1. Close VS Code
2. Make multiple types of changes:
   ```bash
   echo "new file" > newfile.txt      # added
   echo "change" >> existing.txt       # modified
   rm somefile.txt                     # deleted
   ```
3. Reopen VS Code
4. Check `.verified/log.jsonl` for UNVERIFIED_CHANGES
5. Verify all three change types are present

### Test 5: LOC Delta Summary
1. Close VS Code
2. Make edits with known line counts:
   ```bash
   # Add 5 lines to a file
   for i in {1..5}; do echo "line $i" >> test.txt; done
   ```
3. Reopen VS Code
4. Check UNVERIFIED_CHANGES event
5. If git diff --numstat works, changes should include `linesAdded` and `linesDeleted`

### Test 6: Checkpoint at Report Generation
1. With session active, run "Moji Proctor: Generate Report"
2. Check `.verified/log.jsonl` for CHECKPOINT_CREATED event
3. Verify checkpoint was created before report

### Test 7: Checkpoint Cleanup (Keep Last N)
1. Create multiple checkpoints by starting/ending sessions
2. Run cleanup via checkpointStore.cleanupOldCheckpoints(10)
3. Verify only last 10 checkpoints remain

### Test 8: Ignore Patterns Respected
1. Create files in ignored directories:
   - `.verified/test.txt`
   - `node_modules/test.txt`
   - `.git/test.txt`
2. Create a checkpoint
3. Verify these files are NOT in the checkpoint manifest
4. Create a tracked file (e.g., `src/test.txt`)
5. Verify this file IS in the checkpoint manifest

## Known Limitations

1. **Line Count Accuracy**
   - Simple newline counting - doesn't handle all edge cases
   - Binary files may have inaccurate line counts

2. **Git Diff LOC**
   - Only shows uncommitted changes (working tree vs HEAD)
   - Falls back silently if git unavailable
   - Doesn't show historical LOC changes between checkpoints

3. **Performance**
   - Large repos may take time to scan for manifest generation
   - No caching or incremental updates

4. **File System Edge Cases**
   - Symlinks not explicitly handled
   - Permission errors result in skipped files
   - Very large files read entirely into memory for hashing

## Requests for Shared Contracts

None required. All used contracts from Agent 0-2 are sufficient:
- Event envelope structure
- IEventLog interface
- CheckpointManifest type (extended with lineCount)
- IgnoreMatcher utility

## Integration Notes

### Extension Activation (`extension.ts`)
- Added `detectUnverifiedChanges()` call after session start
- Added `createCheckpoint()` call before session end (manual and close)
- Added `createCheckpoint()` call in generateReportCommand

### Checkpoint vs Event Log
- Checkpoints embed `log_head_hash` for integrity verification
- IntegrityService can verify checkpoint against log chain
- This enables tamper detection between sessions

## Next Steps

Other agents can now:
1. Use checkpoints for rollback/restore points
2. Verify integrity by comparing checkpoints to log chain
3. Aggregate checkpoint data for trend analysis (file growth over time)
4. Use unverified change events for risk scoring
