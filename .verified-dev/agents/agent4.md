# Agent 4: Report Generation

**Branch:** `agent/ext/report-generation`
**Status:** Complete
**Agent:** Agent 4

## Scope Delivered

- Full implementation of ReportGenerator service
- Aggregates data from event logs, checkpoints, and integrity checks
- Generates `.verified/report.json` conforming to shared schema (v0.1.0)
- Generates `.verified/report.md` with human-readable summary
- Added "Moji Proctor: Show Summary" command to open report.md

## Implementation Details

### Report Generation Flow

1. **Read all events** from `.verified/log.jsonl`
2. **Aggregate statistics** from events:
   - Time data from SESSION_START, SESSION_END, TIME_TICK events
   - Burst data from BURST_FLAG events
   - Unverified changes from UNVERIFIED_CHANGES events
3. **Fetch checkpoint info** from checkpoint store
4. **Run integrity check** via IntegrityService
5. **Generate reports**:
   - `report.json` - Machine-readable per schema
   - `report.md` - Human-readable with tables and sections

### Machine Report Schema (report.json)

```typescript
interface MachineReport {
  schema_version: '0.1.0';
  generated_at: string;
  assignment_id: string;
  session_id: string;
  integrity: IntegrityStatus;
  time: TimeStats;
  bursts: BurstStats;
  checkpoints: CheckpointInfo;
  unverified_changes: UnverifiedChange[];
}
```

### Markdown Report Sections (report.md)

1. **Header** - Assignment ID, generated timestamp, session ID
2. **Summary Table** - Quick overview of all key metrics
3. **Integrity** - Pass/fail status with issue details
4. **Time Tracking** - Session counts, focused/active time, ratio
5. **Burst Detection** - Breakdown by severity (low/medium/high)
6. **Checkpoints** - Count and latest checkpoint ID
7. **Unverified Changes** - Table of files changed outside tracking
8. **Footer** - Schema version and attribution

## Configuration

No runtime configuration needed. The service uses:
- EventLog for reading all events
- CheckpointStore for checkpoint metadata
- IntegrityService for integrity verification
- Assignment ID from assignment.json

## Files Modified

| File | Changes |
|------|---------|
| `src/services/reportGenerator.ts` | Full implementation (was stub) |
| `src/extension.ts` | Added setSessionId call, added showSummaryCommand, registered new command |
| `package.json` | Added "Moji Proctor: Show Summary" command |

## API

### IReportGenerator Interface

```typescript
interface IReportGenerator {
  /** Generate both JSON and markdown reports */
  generateReports(): Promise<void>;

  /** Generate only JSON report */
  generateJsonReport(): Promise<MachineReport>;

  /** Generate only markdown report */
  generateMdReport(): Promise<string>;

  /** Get current session ID for report */
  getCurrentSessionId(): string | null;

  /** Set the current session ID (called by extension) */
  setSessionId(sessionId: string): void;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `mojiProctor.generateReport` | Generate both report.json and report.md |
| `mojiProctor.showSummary` | Open report.md in markdown preview |

## How to Test Manually

### Prerequisites
1. Run `npm install && npm run compile`
2. Create a test git repo with `.verified/assignment.json`:
   ```json
   {
     "assignment_id": "test-assignment",
     "assignment_name": "Test Assignment",
     "created_at": "2025-01-01T00:00:00Z"
   }
   ```
3. Press F5 to open Extension Development Host

### Test 1: Generate Initial Report (No Events)
1. Open the test workspace
2. Run "Moji Proctor: Generate Report" from command palette
3. Verify `.verified/report.json` was created with:
   - `schema_version: "0.1.0"`
   - `assignment_id: "test-assignment"`
   - `time.session_count: 1` (current session)
   - `time.total_focused_seconds` and `total_active_seconds` >= 0
   - `bursts.total_count: 0`
   - `checkpoints.count: 1` (checkpoint created at report generation)
4. Verify `.verified/report.md` was created and contains:
   - Summary table with all metrics
   - All section headers (Integrity, Time Tracking, etc.)
   - Proper formatting (markdown tables, icons)

### Test 2: Report with Activity Data
1. Make some edits in the workspace (type in a file)
2. Optionally wait for time tick events (10+ seconds)
3. Run "Moji Proctor: Generate Report"
4. Verify `report.json` shows:
   - `time.total_focused_seconds > 0`
   - `time.first_session_start` populated
   - `checkpoints.count > 0`
5. Verify `report.md` shows formatted durations (e.g., "2m 30s")

### Test 3: Show Summary Command
1. First generate a report (Test 1 or 2)
2. Run "Moji Proctor: Show Summary" from command palette
3. Verify report.md opens in markdown preview view
4. Verify the content is rendered properly (tables, headers)

### Test 4: Report with Burst Events
1. Make rapid edits to trigger burst detection (paste large blocks)
2. Run "Moji Proctor: Generate Report"
3. Verify `report.json` shows:
   - `bursts.total_count > 0`
   - `bursts.by_severity` with counts for low/medium/high
4. Verify `report.md` shows burst breakdown table

### Test 5: Report with Unverified Changes
1. Close VS Code
2. Make a change outside the editor:
   ```bash
   echo "unverified" >> test.txt
   ```
3. Reopen VS Code
4. Run "Moji Proctor: Generate Report"
5. Verify `report.json` shows:
   - `unverified_changes` array with the modified file
   - Each change has `path`, `change_type`, `detected_after_checkpoint`
6. Verify `report.md` shows unverified changes table

### Test 6: Report with Integrity Issues
1. Manually corrupt `.verified/log.jsonl` (edit a line)
2. Run "Moji Proctor: Generate Report"
3. Verify `report.json` shows:
   - `integrity.passed: false`
   - `integrity.issues` array populated
4. Verify `report.md` shows integrity failures with details

### Test 7: Multiple Sessions
1. Start a session, make edits, end session ("Moji Proctor: End Session")
2. Repeat a few times
3. Run "Moji Proctor: Generate Report"
4. Verify:
   - `time.session_count` equals number of sessions
   - `time.first_session_start` is earliest session
   - `time.last_session_end` is latest session end
   - Times are aggregated across all sessions

### Test 8: Report Schema Validation
1. Generate a report
2. Read `.verified/report.json`
3. Verify all required fields are present
4. Verify `schema_version` is exactly "0.1.0"
5. Verify timestamps are valid ISO 8601 format
6. Verify numeric values are non-negative where appropriate

### Test 9: Show Summary Without Report
1. Delete `.verified/report.md` if it exists
2. Run "Moji Proctor: Show Summary"
3. Verify warning message: "No report found. Generate a report first..."

### Test 10: Report Persistence
1. Generate a report
2. Close and reopen VS Code
3. Run "Moji Proctor: Show Summary"
4. Verify the previous report is still accessible
5. Generate a new report
6. Verify it overwrites the previous one

## Known Limitations

1. **No Incremental Updates**
   - Report generation always reads full event log
   - For large logs (many sessions), this could be slow
   - No caching of aggregated data

2. **Markdown Formatting**
   - Uses emoji icons (✅❌⚠️) - may not render in all viewers
   - Timestamps use system locale - format varies by system

3. **Report Overwrite**
   - Each generation overwrites previous report
   - No history/versioning of reports
   - Users must manually preserve old reports if needed

4. **Error Handling**
   - If event log is corrupted, report may be incomplete
   - Integrity failures don't prevent report generation
   - Report shows what data is available

## Integration Notes

### Extension Activation (`extension.ts`)
- Added `setSessionId(sessionId)` call after time tracker starts
- Added `showSummaryCommand()` function to open report.md
- Registered `mojiProctor.showSummary` command

### Report Generation Timing
Reports are generated:
- When user explicitly runs "Generate Report" command
- Always after creating a checkpoint (for latest file state)
- Can be run multiple times in a session

### Session ID in Reports
- The `session_id` field in the report is the session that generated it
- This may differ from sessions in the event log
- Useful to know which session generated the report

## Next Steps

Other agents can now:
1. Use report.json for automated grading/analysis
2. Use report.md as student-facing submission summary
3. Extend report schema (requires coordination, schema bump)
4. Add additional report sections (e.g., file change timeline)
