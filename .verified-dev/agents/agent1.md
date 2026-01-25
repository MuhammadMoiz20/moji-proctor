# Agent 1: Focused/Active Time Tracking + Sessions

**Branch:** `agent/ext/time-tracking`
**Status:** Complete (PR pending)
**Agent:** Agent 1

## Scope Delivered

- Full implementation of TimeTracker service
- Focused time tracking (VS Code window focused + session active)
- Active time tracking (focused + not idle)
- Idle detection (default 120 seconds of inactivity)
- Session lifecycle (start on activation, end on deactivate/manual/long-unfocus)
- Event emission (SESSION_START, SESSION_END, TIME_TICK)
- Window state change handling
- User activity detection for idle reset

## Implementation Details

### Focused Time
- Accumulates when VS Code window has focus AND a session is active
- Stops accumulating when window loses focus

### Active Time
- Accumulates when focused AND user is NOT idle
- User becomes idle after 120 seconds (configurable) of no detected activity
- Idle timer resets on: text selection changes, editor switching

### Session Lifecycle
- **Start**: When extension activates in a workspace with `.verified/assignment.json`
- **End**:
  - Manual: "Moji Proctor: End Session" command
  - Close: Extension deactivation (window close)
  - Idle timeout: Window unfocused for 30+ minutes (configurable)
- Emits SESSION_START and SESSION_END events with session-scoped data

### Time Tick Events
- Emitted every 10 seconds (configurable)
- Contains delta values since last tick
- Only emitted when there is focused time to report

## Configuration

```typescript
interface TimeTrackerConfig {
  idle_seconds?: number;          // Default: 120 (2 minutes)
  unfocus_timeout_seconds?: number; // Default: 1800 (30 minutes)
  tick_interval_seconds?: number;   // Default: 10
}
```

## Events Emitted

| Event Type | Payload | When |
|------------|---------|------|
| SESSION_START | workspace_name, git_root | Session starts |
| TIME_TICK | focused_delta_seconds, active_delta_seconds | Every 10s while focused |
| SESSION_END | focused_seconds, active_seconds, reason | Session ends |

## Files Modified

| File | Changes |
|------|---------|
| `src/services/timeTracker.ts` | Full implementation (was stub) |
| `src/extension.ts` | Added window state handlers, activity handlers, end session command |

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

### Test 1: Session Start and Events
1. Open the test workspace
2. Verify status bar shows "Moji Proctor: Active"
3. Wait 30 seconds
4. Check `.verified/log.jsonl` exists and contains:
   - `SESSION_START` event
   - Multiple `TIME_TICK` events

### Test 2: Focused vs Unfocused Time
1. With session active, wait 10 seconds (focused time accumulates)
2. Click away from VS Code (lose focus)
3. Verify status bar shows "Moji Proctor: Unfocused"
4. Wait 20 seconds (no focused time accumulates)
5. Click back to VS Code (regain focus)
6. Verify status bar shows "Moji Proctor: Active"
7. Run "Moji Proctor: Show Status" command
8. Verify focused time increased by ~10 seconds (not ~40 seconds)

### Test 3: Idle Detection
1. With session active and focused, do nothing for 2+ minutes
2. Run "Moji Proctor: Show Status"
3. Verify active_time < focused_time (time was idle)
4. Move cursor or type to reset idle state

### Test 4: Manual Session End
1. Run "Moji Proctor: End Session" command (Ctrl+Shift+P > "Moji Proctor: End Session")
2. Verify notification shows session totals
3. Verify status bar shows "Session ended"
4. Check log contains `SESSION_END` with reason "manual"
5. Try running again - verify warning "No active session"

### Test 5: Long Unfocus Timeout (30m)
1. With session active, lose focus
2. Immediately regain focus (session should continue)
3. Optional: Simulate 30+ minute unfocus (would require mocking timer)

### Test 6: Event Log Integrity
1. After a session, inspect `.verified/log.jsonl`
2. Each line should be valid JSON with required fields:
   - event_id (UUID)
   - ts (ISO timestamp)
   - session_id (UUID, same for all events in session)
   - type (SESSION_START, TIME_TICK, or SESSION_END)
   - payload (event-specific data)
   - prev_hash (null for first, hash of previous for rest)
   - hash (SHA-256 of canonical JSON)

## Known Limitations

1. Idle detection relies on text selection and editor changes only
   - Mouse movement without typing/selection won't reset idle timer
2. User activity detection is limited to VS Code events
   - Activity in other apps not tracked
3. Long-unfocus timeout (30m) cannot be easily tested manually
   - Would require timer mocking for proper testing
4. TIME_TICK events are emitted even when delta is 0 in some edge cases
   - Currently filtered to only emit when focused_delta > 0

## Requests for Shared Contracts

None required. All used contracts from Agent 0 are sufficient:
- Event envelope structure
- IEventLog interface
- Canonical JSON and hash utilities
- Session/Time event types

## Integration Notes

### Extension Activation (`extension.ts`)
- Added `timeTracker.init()` call before `startSession()`
- Registered `onDidChangeWindowState` for focus tracking
- Registered text selection and active editor changes for activity tracking
- Added "Moji Proctor: End Session" command

### Status Bar Updates
- "Active" - Window focused, session running
- "Unfocused" - Window lost focus (session still active)
- "Session ended" - Manual session end

## Next Steps

Other agents can now:
1. Read `SESSION_START`/`SESSION_END` to correlate events with time periods
2. Aggregate `TIME_TICK` events for total focused/active time
3. Filter events by session_id for per-session analysis
