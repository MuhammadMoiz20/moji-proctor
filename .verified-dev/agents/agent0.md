# Agent 0: Core Scaffold and Contracts

**Branch:** `agent/core/contracts-and-scaffold`
**Status:** Complete (PR pending)
**Agent:** Agent 0

## Scope Delivered

- Base VS Code extension scaffolding
- Shared type definitions (events, checkpoints, reports)
- Utility functions (canonical JSON, sha256, ignore matcher, git root)
- Service stubs/placeholder implementations
- Extension activation and wiring

## File Tree Created

```
moji-proctor/
├── package.json                    # VS Code extension manifest
├── tsconfig5.json                   # TypeScript configuration
├── .vscodeignore                   # Package exclusion rules
├── .gitignore                      # Git ignore patterns
├── src/
│   ├── extension.ts                # Extension activation and command wiring
│   ├── types/
│   │   ├── index.ts
│   │   ├── events.ts               # Event envelope and payload types
│   │   ├── checkpoints.ts          # Checkpoint manifest types
│   │   └── report.ts               # Report and assignment metadata types
│   ├── utils/
│   │   ├── index.ts
│   │   ├── canonicalJson.ts        # Deterministic JSON stringify
│   │   ├── hash.ts                 # SHA-256 helpers
│   │   ├── ignore.ts               # .gitignore-style pattern matcher
│   │   ├── gitRoot.ts              # Git repository root detection
│   │   └── assignmentLoader.ts     # Assignment metadata reader
│   ├── storage/
│   │   ├── index.ts
│   │   ├── eventLog.ts             # Append-only JSONL log (FULL IMPLEMENTATION)
│   │   ├── checkpointStore.ts      # Checkpoint manifest storage
│   │   └── reportWriter.ts         # Report file writer
│   └── services/
│       ├── index.ts
│       ├── timeTracker.ts          # STUB - time and session tracking
│       ├── burstDetector.ts        # STUB - rapid edit detection
│       ├── checkpointService.ts    # STUB - file manifest and change detection
│       ├── integrityService.ts     # STUB - hash chain verification
│       └── reportGenerator.ts      # STUB - report aggregation
└── .verified-dev/
    └── agents/
        └── agent0.md               # This file
```

## Contract Freeze

### Event Envelope Schema

```typescript
interface EventEnvelope {
  event_id: string;      // UUID v4
  ts: string;            // ISO 8601 timestamp
  session_id: string;    // UUID v4 - shared across session events
  type: EventType;       // Event type discriminator
  payload: unknown;      // Event-specific payload
  prev_hash: string | null;  // Previous event hash (null for first)
  hash: string;          // SHA-256 of canonical JSON (excluding this field)
}
```

**Hash rule:** `hash = sha256(canonicalJson({event_id, ts, session_id, type, payload, prev_hash}))`

### File Paths (MVP)

| Path | Purpose | Committed? |
|------|---------|------------|
| `.verified/assignment.json` | Assignment metadata | Yes (by instructor) |
| `.verified/log.jsonl` | Append-only event log | No |
| `.verified/checkpoints/*.json` | Checkpoint manifests | No |
| `.verified/report.json` | Machine-readable report | No |
| `.verified/report.md` | Human-readable report | No |

### Event Types

- `SESSION_START` - New editing session begins
- `SESSION_END` - Session ends (close, idle, manual)
- `TIME_TICK` - Time accumulation update
- `BURST_FLAG` - Rapid edit detected
- `CHECKPOINT_CREATED` - File snapshot saved
- `UNVERIFIED_CHANGES` - Changes detected outside telemetry
- `INTEGRITY_COMPROMISED` - Hash chain or file missing

### Canonical JSON Rules

- Object keys sorted alphabetically
- No trailing commas
- No extra whitespace (compact format)
- Arrays preserve order

**Module:** `src/utils/canonicalJson.ts` - DO NOT MODIFY without coordination.

## How to Run Extension

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run compile
   ```

3. Press F5 in VS Code (or "Run > Start Debugging")
   - This opens the "Extension Development Host"
   - The extension activates automatically

4. Commands available:
   - `Moji Proctor: Generate Report` - Opens command palette (Ctrl+Shift+P)
   - `Moji Proctor: Show Status` - Shows current tracking status

5. Status bar appears on right side when active in a git repo with `.verified/assignment.json`

## Integration Notes for Other Agents

### Service Interfaces

All services expose interfaces for dependency injection:

- `IEventLog` - Append events, read log, verify chain
- `ICheckpointStore` - Write/read checkpoints, list, cleanup
- `IReportWriter` - Write JSON and MD reports
- `ITimeTracker` - Session lifecycle, time stats
- `IBurstDetector` - Start/stop monitoring, get summary
- `ICheckpointService` - Create checkpoint, detect unverified changes
- `IIntegrityService` - Run integrity check
- `IReportGenerator` - Generate reports

### Full Implementations Provided

- **`eventLog.ts`** - Fully functional with hash chaining and verification
- **`canonicalJson.ts`** - Canonical JSON stringify
- **`hash.ts`** - SHA-256 helpers
- **`ignore.ts`** - Pattern matching for excluded files
- **`gitRoot.ts`** - Git repository detection

### Stubs Requiring Implementation

- **`timeTracker.ts`** - Needs idle detection, window focus tracking
- **`burstDetector.ts`** - Needs rolling window edits, severity thresholds
- **`checkpointService.ts`** - Needs file system scan, manifest generation
- **`integrityService.ts`** - Needs assignment.json validation
- **`reportGenerator.ts`** - Needs log aggregation, MD formatting

### Extension Activation (`extension.ts`)

The `activate()` function:
1. Detects git root for workspace
2. Checks for `.verified/assignment.json`
3. Initializes all services with proper dependencies
4. Starts time tracking and burst detection
5. Registers cleanup on deactivate

**DO NOT modify service wiring in `extension.ts`** unless absolutely necessary.
Keep changes minimal and documented here.

## Known Limitations / TODOs

1. Time tracking stub returns zeros
2. Burst detection does nothing
3. Checkpoint service creates empty manifests
4. Report generator produces placeholder output
5. No idle timeout handling
6. No `.verifiedignore` file parsing yet

## Testing Manual Checklist

When testing this scaffold:

- [ ] Extension loads without errors
- [ ] Status bar shows "No assignment" when no `.verified/assignment.json`
- [ ] Status bar shows "Not a git repo" when opening non-git folder
- [ ] Commands appear in command palette
- [ ] `Generate Report` shows appropriate message for non-configured workspace
- [ ] Build succeeds: `npm run compile`

## PR Description Template

```markdown
## What Changed

- Initial VS Code extension scaffold for Moji Proctor
- Shared type definitions for events, checkpoints, and reports
- Canonical JSON and SHA-256 utilities (contract frozen)
- Git root detection and ignore pattern matching
- Event log storage with hash chaining (full implementation)
- Stub services for time tracking, burst detection, checkpoints, integrity, and reporting
- Extension activation with status bar and commands

## How to Test

1. Run `npm install && npm run compile`
2. Press F5 to open Extension Development Host
3. Open a folder (with or without git)
4. Check status bar shows appropriate state
5. Run "Moji Proctor: Show Status" command

## New Files

See full file tree in .verified-dev/agents/agent0.md

## Contract Freeze

Event envelope structure and canonical JSON rules are frozen.
See .verified-dev/CONTRACTS.md and src/utils/canonicalJson.ts
```
