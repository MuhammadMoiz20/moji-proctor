# **Moji-Proctor: Comprehensive Project Report**

## **Executive Summary**

**Moji-Proctor** is a VS Code extension and GitHub Action system designed for **academic integrity verification** in programming coursework. It monitors student coding activity and generates **tamper-evident, cryptographically-linked reports** that instructors can validate to ensure academic honesty.

**Core Philosophy:**
- **Privacy-first**: Zero telemetry, no network calls from the extension
- **Local-only data**: All tracking stored in `.verified/` directory
- **Tamper-evident**: Cryptographic hash chaining makes alterations detectable
- **Best-effort signals**: Provides indicators, not proofs—designed for deterrence

---

## **1. Architecture Overview**

### **Two-Part System**

#### **Part A: VS Code Extension (Student Side)**
- Runs locally on student's machine during coding sessions
- Tracks editing behavior, time spent, and file changes
- Produces tamper-evident artifacts in `.verified/` directory
- **Never uploads data or makes network calls**

#### **Part B: GitHub Action (Instructor Side)**
- Runs automatically when students submit PRs
- Validates cryptographic integrity of submitted artifacts
- Generates check run summaries visible on GitHub
- Optionally writes validation records to remote database (Firebase/Supabase/Webhook)

---

## **2. Data Flow (Student Journey)**

### **Setup Phase**
1. **Assignment Configuration**: Instructor creates `.verified/assignment.json`:
   ```json
   {
     "course_id": "CS101",
     "assignment_id": "homework-1",
     "ignore": ["node_modules/**"],
     "idle_seconds": 300,
     "submission_mode": "pr"
   }
   ```

2. **Extension Activation**: Student opens workspace in VS Code with extension installed

### **Work Phase**
1. **Session Start**:
   - Extension detects git root and assignment metadata
   - Generates unique session ID (UUID v4)
   - Emits `SESSION_START` event to `.verified/log.jsonl`
   - Creates initial checkpoint of workspace files

2. **Active Monitoring** (continuous):
   - **Time Tracking**: Records focused time (VS Code active) and active time (user interacting)
   - **Burst Detection**: Flags rapid edits that may indicate copy-paste or AI-generated code
   - **Event Logging**: All activities appended to tamper-evident event log

3. **Session End**:
   - Creates final checkpoint
   - Emits `SESSION_END` event with time statistics
   - Detects any unverified changes made outside tracking

### **Submission Phase**
1. **Report Generation**:
   - Student runs "Moji Proctor: Generate Report" command
   - Extension creates `report.json` (machine-readable) and `report.md` (human-readable)
   - Verifies hash chain integrity

2. **Git Commit**:
   ```bash
   git add .verified/
   git commit -m "Add coursework verification"
   git push origin feature-branch
   ```

3. **PR Creation & Validation**:
   - GitHub Action automatically runs on PR
   - Validates schemas, hash chain, event continuity
   - Posts check run summary (✅ or ❌)
   - Optionally writes record to instructor's database

---

## **3. Technical Architecture**

### **3.1 Event System (Core Innovation)**

All student activity is logged as **cryptographically-linked events** in `.verified/log.jsonl`:

#### **Event Structure** (Contract-frozen):
```typescript
{
  event_id: "uuid-v4",           // Unique identifier
  ts: "2024-01-25T10:30:00Z",   // ISO 8601 timestamp
  session_id: "uuid-v4",         // Session identifier
  type: "SESSION_START",         // Event type discriminator
  payload: { ... },              // Event-specific data
  prev_hash: "sha256...",        // Hash of previous event (null for first)
  hash: "sha256..."              // SHA-256 of this event (excluding hash field)
}
```

#### **Hash Chain Mechanism**:
```
Event 1: prev_hash = null,      hash = sha256(event1 data)
Event 2: prev_hash = hash(1),   hash = sha256(event2 data)
Event 3: prev_hash = hash(2),   hash = sha256(event3 data)
...
```

**Tamper Detection**: Any modification to historical events breaks the chain because subsequent `prev_hash` values won't match.

#### **Event Types**:
1. **`SESSION_START`**: Workspace opened, tracking begins
2. **`SESSION_END`**: Session closed (reasons: close/idle_timeout/manual)
3. **`TIME_TICK`**: Periodic time updates (every 10 seconds)
4. **`BURST_FLAG`**: Rapid edit detection (low/medium/high severity)
5. **`CHECKPOINT_CREATED`**: File snapshot created
6. **`UNVERIFIED_CHANGES`**: Changes detected outside tracking
7. **`INTEGRITY_COMPROMISED`**: Hash chain broken or data missing

### **3.2 Canonical JSON (Critical Contract)**

**Purpose**: Ensures deterministic hash computation across different systems.

**Rules**:
- Object keys **sorted alphabetically**
- Arrays preserve order
- No whitespace variations
- No trailing commas

**Implementation** ([src/utils/canonicalJson.ts](src/utils/canonicalJson.ts)):
```typescript
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer, 0);
}
```

**Why it matters**: Student generates hash on their machine, GitHub Action re-computes on GitHub's servers. Hashes MUST match exactly or validation fails.

---

## **4. Core Services (Extension)**

### **4.1 Time Tracker** ([src/services/timeTracker.ts](src/services/timeTracker.ts))

**Responsibility**: Track focused and active time across coding sessions.

**Time Categories**:
- **Focused Time**: VS Code window is focused AND session active
- **Active Time**: Focused AND user recently interacted (not idle)
- **Idle Threshold**: Configurable (default: 120 seconds of inactivity)

**Lifecycle**:
```
startSession() → onWindowStateChanged() → onUserActivity() → TIME_TICK events → endSession()
```

**Key Features**:
- Emits `TIME_TICK` every 10 seconds with time deltas
- Auto-ends session after 30 minutes unfocused
- Tracks cumulative stats across multiple sessions

### **4.2 Burst Detector** ([src/services/burstDetector.ts](src/services/burstDetector.ts))

**Responsibility**: Detect suspiciously rapid code edits.

**Algorithm**: Rolling time window (default: 5 seconds)
- Tracks: edit count, character count, lines changed
- Classifies severity: low/medium/high based on velocity

**Thresholds** (configurable):
```typescript
{
  windowMs: 5000,              // 5-second window
  lowEditThreshold: 3,         // 3+ edits = low
  mediumEditThreshold: 5,      // 5+ edits = medium
  highEditThreshold: 10,       // 10+ edits = high
  lowCharThreshold: 100,       // 100+ characters
  mediumCharThreshold: 500,    // 500+ characters
  highCharThreshold: 1000      // 1000+ characters
}
```

**Use Case**: Flag potential copy-paste or AI code generation.

**Cooldown**: 10-second minimum between burst events for same file to prevent spam.

### **4.3 Checkpoint Service** ([src/services/checkpointService.ts](src/services/checkpointService.ts))

**Responsibility**: Create file snapshots and detect unverified changes.

**Checkpoint Manifest Structure**:
```typescript
{
  checkpoint_id: "uuid",
  created_at: "ISO-8601",
  log_head_hash: "sha256...",    // Links to event log
  session_id: "uuid",
  files: [
    {
      path: "src/main.ts",       // Relative to git root
      sha256: "hash...",         // File content hash
      size: 1024,                // Bytes
      mtime: 1706180400,         // Unix timestamp
      lineCount: 42
    },
    ...
  ],
  skipped_large_files: [...]     // Files > 2MB
}
```

**Unverified Change Detection**:
1. On session start, compare current workspace to last checkpoint
2. Identify added/modified/deleted files
3. Emit `UNVERIFIED_CHANGES` event if differences found
4. Enhances with git diff stats (lines added/removed) when available

**Purpose**: Catches edits made outside VS Code (e.g., manual file operations, other editors).

### **4.4 Integrity Service** ([src/services/integrityService.ts](src/services/integrityService.ts))

**Responsibility**: Verify hash chain and data completeness.

**Checks**:
1. **Hash Chain Validation**: Every event's `hash` matches recomputed hash
2. **Chain Continuity**: Every event's `prev_hash` matches previous event's `hash`
3. **Assignment Metadata**: `.verified/assignment.json` exists and valid

**Verification Strategy**:
- **Small logs** (<1000 events): Full verification
- **Large logs**: Tail verification (last 100 events) for performance

**Output**: `IntegrityResult` with pass/fail and detailed issue list.

### **4.5 Report Generator** ([src/services/reportGenerator.ts](src/services/reportGenerator.ts))

**Responsibility**: Aggregate event data into final reports.

**Output Artifacts**:

1. **`report.json`** (Machine-readable):
   ```json
   {
     "schema_version": "0.1.0",
     "generated_at": "ISO-8601",
     "assignment_id": "homework-1",
     "session_id": "uuid",
     "integrity": {
       "passed": true,
       "issues": []
     },
     "time": {
       "total_focused_seconds": 3600,
       "total_active_seconds": 3200,
       "session_count": 3,
       "first_session_start": "...",
       "last_session_end": "..."
     },
     "bursts": {
       "total_count": 5,
       "by_severity": { "low": 3, "medium": 2, "high": 0 }
     },
     "checkpoints": {
       "count": 3,
       "latest_checkpoint_id": "uuid"
     },
     "unverified_changes": [
       { "path": "src/util.ts", "change_type": "modified", "detected_after_checkpoint": "uuid" }
     ]
   }
   ```

2. **`report.md`** (Human-readable markdown with tables and summaries)

---

## **5. Storage Layer**

### **5.1 Event Log** ([src/storage/eventLog.ts](src/storage/eventLog.ts))

**File**: `.verified/log.jsonl` (JSONL = JSON Lines format)

**CONTRACT FREEZE**: Single source of truth for hash generation.

**Key Methods**:
- `appendEvent(type, payload, sessionId)`: Append new event with hash chain
- `readAllEvents()`: Load full event history
- `verifyChain()`: Validate hash chain integrity
- `getLastHash()`: Get most recent event hash (for next event's `prev_hash`)

**Head Hash Optimization**: Stores last hash in `.verified/log.head` to avoid re-reading entire file.

### **5.2 Checkpoint Store** ([src/storage/checkpointStore.ts](src/storage/checkpointStore.ts))

**Directory**: `.verified/checkpoints/`
**Files**: `checkpoint-{uuid}.json`

**Operations**:
- `writeCheckpoint()`: Save new checkpoint
- `getLatestCheckpoint()`: Retrieve most recent checkpoint
- `cleanupOldCheckpoints(10)`: Keep only last 10 checkpoints

### **5.3 Report Writer** ([src/storage/reportWriter.ts](src/storage/reportWriter.ts))

**Responsibility**: Write final reports to disk.

**Features**:
- Writes `report.json` and `report.md`
- Optionally hides `.verified/` folder (Windows: `attrib +h`, macOS: `chflags hidden`)
- Ensures atomic writes with error handling

---

## **6. Utilities**

### **6.1 Hash Utilities** ([src/utils/hash.ts](src/utils/hash.ts))

```typescript
sha256(input: string): string           // SHA-256 hash (hex, lowercase)
sha256File(path: string): Promise<string>  // Hash file contents
generateId(): string                    // UUID v4
```

### **6.2 Git Root Detection** ([src/utils/gitRoot.ts](src/utils/gitRoot.ts))

**Purpose**: Find `.git` directory to establish workspace root.

**Why critical**: All file paths in checkpoints are **relative to git root** for portability.

### **6.3 Ignore Matcher** ([src/utils/ignore.ts](src/utils/ignore.ts))

**Purpose**: Exclude files from tracking (like `.gitignore`).

**Default Patterns**:
```
.verified/, .git/, node_modules/, *.log, .DS_Store, etc.
```

**Supports**: Wildcards, directory suffixes, exact matches.

---

## **7. GitHub Action (Validation)**

### **7.1 Workflow** ([.github/workflows/verified-coursework.yml](.github/workflows/verified-coursework.yml))

**Triggers**:
- Push to main/master with `.verified/` changes
- Pull requests (opened, synchronized, reopened)
- Manual dispatch

**Steps**:
1. Checkout repository (full history)
2. Setup Node.js 20
3. Run validation action
4. Upload `.verified/` as artifact (90-day retention)
5. Post check run summary

### **7.2 Validation Action** ([.github/actions/verified-coursework/](.github/actions/verified-coursework/))

**Inputs**:
- `verified-path`: Path to `.verified/` directory
- `fail-on-integrity-issues`: Whether to fail workflow on errors
- `post-pr-comment`: Whether to post report as PR comment
- `token`: GitHub token for API calls

**Validation Pipeline**:

1. **Load Data** ([src/validator.ts](.github/actions/verified-coursework/src/validator.ts)):
   - Read `report.json`, `log.jsonl`, `assignment.json`
   - Parse JSONL into event arrays

2. **Schema Validation** (using Ajv):
   - Validate report against JSON schema
   - Validate each event envelope against schema
   - Validate assignment metadata

3. **Hash Chain Verification**:
   ```typescript
   for each event:
     recompute_hash = sha256(canonicalStringify(event without hash))
     if recompute_hash !== event.hash:
       FAIL: "Hash mismatch at event {i}"
     if event.prev_hash !== previous_event.hash:
       FAIL: "Chain broken at event {i}"
   ```

4. **Report Consistency Checks**:
   - Time totals match event aggregation
   - Burst counts match event log
   - Checkpoint references valid

5. **Database Write** (Optional) ([src/db.ts](.github/actions/verified-coursework/src/db.ts), [src/firebase.ts](.github/actions/verified-coursework/src/firebase.ts)):
   - If `VERIFIED_DB_MODE` set (firebase/supabase/webhook)
   - Write validated submission record with:
     - Repository, PR, commit info
     - Time statistics (focused/active milliseconds)
     - Burst counts by severity
     - Integrity flags (unverified changes, hash chain status)
     - Workflow run URL, artifact URL
   - Uses deterministic document ID for idempotency

6. **Check Run Creation**:
   - Post GitHub Check with ✅/❌ status
   - Summary includes time stats, integrity status, burst counts
   - Links to uploaded artifact

7. **PR Comment** (Optional):
   - Post/update comment with `report.md` content
   - Idempotent (updates existing comment if found)

### **7.3 Database Support**

#### **Firebase Firestore**
- REST API integration (no client SDK needed)
- OAuth 2.0 with service account JWT
- Collection: `verified_reports` (auto-created)
- Document ID: `{repo}__pr{number}__{sha}`
- **Idempotent**: Re-runs overwrite document

#### **Supabase (PostgreSQL)**
- REST API with service role key
- Table: `verified_reports` (must be created manually)
- Primary key: `(repo, pr_number, commit_sha)`

#### **Webhook (Generic)**
- HTTP POST to custom endpoint
- Optional Bearer token authentication
- Payload: JSON with validation results

**Strict Mode**: If enabled, any DB write failure fails the entire workflow (default: best-effort).

---

## **8. Security & Privacy Guarantees**

### **Privacy First**
✅ **No telemetry**: Extension never sends analytics
✅ **No network calls**: All data stays on student's machine
✅ **Local storage**: `.verified/` directory only
✅ **Student control**: Students commit and push data explicitly

### **Tamper Evidence**
✅ **Hash chaining**: Any modification breaks cryptographic chain
✅ **Checkpoint verification**: Files linked to event log via `log_head_hash`
✅ **Git immutability**: GitHub's commit history provides audit trail

### **Limitations (Acknowledged)**
⚠️ **Logs can be deleted**: Student has full control before pushing
⚠️ **No server verification**: Extension could theoretically be modified
⚠️ **Heuristic burst detection**: May have false positives/negatives
⚠️ **VS Code only**: Work outside VS Code isn't tracked

**Design Goal**: Deterrence through transparency, not unbreakable security.

---

## **9. File Structure**

### **Student Workspace** (`.verified/`)
```
.verified/
├── assignment.json          # Assignment config (instructor-provided)
├── log.jsonl                # Event log with hash chain
├── log.head                 # Cached last event hash
├── checkpoints/
│   ├── checkpoint-{uuid1}.json
│   ├── checkpoint-{uuid2}.json
│   └── ...                  # (keeps last 10)
├── report.json              # Machine-readable report
└── report.md                # Human-readable report
```

### **Extension Source** (`src/`)
```
src/
├── extension.ts             # Activation, commands, wiring
├── services/
│   ├── timeTracker.ts       # Time tracking service
│   ├── burstDetector.ts     # Burst detection service
│   ├── checkpointService.ts # Checkpoint creation/verification
│   ├── integrityService.ts  # Hash chain validation
│   └── reportGenerator.ts   # Report generation
├── storage/
│   ├── eventLog.ts          # Event log I/O + hashing
│   ├── checkpointStore.ts   # Checkpoint I/O
│   └── reportWriter.ts      # Report writing
├── types/
│   ├── events.ts            # Event envelope types
│   ├── checkpoints.ts       # Checkpoint manifest types
│   └── report.ts            # Report schema types
└── utils/
    ├── canonicalJson.ts     # Deterministic JSON stringify
    ├── hash.ts              # SHA-256 utilities
    ├── gitRoot.ts           # Git root detection
    ├── ignore.ts            # File ignore patterns
    └── assignmentLoader.ts  # Assignment metadata reader
```

### **GitHub Action** (`.github/actions/verified-coursework/`)
```
src/
├── index.ts                 # Main entry point
├── validator.ts             # Schema + hash validation
├── db.ts                    # Database abstraction
├── firebase.ts              # Firebase Firestore writer
├── schemas.ts               # JSON schemas
├── types.ts                 # TypeScript types
└── utils.ts                 # Shared utilities
```

---

## **10. Development Workflow**

### **Build & Test**
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Run tests
npm test

# Lint code
npm run lint

# Watch mode (auto-recompile)
npm run watch
```

### **Running Extension**
1. Press **F5** in VS Code
2. New Extension Host window opens
3. Extension auto-activates on workspace load
4. Check status bar: "Moji Proctor: Active"

### **Commands** (Ctrl+Shift+P)
- `Moji Proctor: Generate Report` - Create `report.json` and `report.md`
- `Moji Proctor: Show Summary` - Display time/burst stats
- `Moji Proctor: Show Status` - Check integrity status
- `Moji Proctor: End Session` - Manually end current session

### **Testing Strategy**
- **Unit tests**: Vitest for services and utilities
- **Mock VS Code API**: `src/__mocks__/vscode.ts` for extension testing
- **Contract tests**: Ensure canonical JSON matches GitHub Action
- **Integration tests**: GitHub Action scripts validate test fixtures

---

## **11. Key Contracts (Frozen)**

These cannot change without breaking validation:

1. **Event Envelope Structure**:
   - Fields: `event_id`, `ts`, `session_id`, `type`, `payload`, `prev_hash`, `hash`
   - Hash rule: `sha256(canonicalStringify({all fields except hash}))`

2. **Canonical JSON**:
   - Sorted object keys
   - No whitespace variations
   - Deterministic across platforms

3. **Report Schema Version**: `"0.1.0"` (bump requires coordination)

4. **File Paths**: Always relative to git root

5. **Hash Algorithm**: SHA-256, lowercase hex output

---

## **12. Use Cases & User Stories**

### **Student Perspective**
1. Clone assignment repository
2. Open in VS Code (extension auto-activates)
3. Code normally (tracking happens transparently)
4. Run "Generate Report" before submission
5. Review `report.md` for time spent and burst flags
6. Commit `.verified/` and push
7. Create PR → GitHub Action validates → Check appears

### **Instructor Perspective**
1. Create assignment repository with `.verified/assignment.json`
2. Students fork/clone and work
3. On PR submission:
   - GitHub Action validates automatically
   - Check run shows ✅ or ❌ with details
   - Database record created (optional)
4. Review time stats, burst flags, unverified changes
5. Use data as signals for academic integrity discussions

### **Signal Interpretation**
- ✅ **Clean submission**: Good time investment, no bursts, no unverified changes
- ⚠️ **High bursts**: Possible copy-paste or AI assistance (investigate)
- ⚠️ **Unverified changes**: Code modified outside VS Code (ask student)
- ⚠️ **Low active time**: Minimal engagement (possible plagiarism)
- ❌ **Broken hash chain**: Tampering detected (serious red flag)

---

## **13. Advanced Features**

### **Hidden Folder**
- `.verified/` can be hidden in Explorer/Finder (default: enabled)
- macOS: `chflags hidden` (already dot-folder)
- Windows: `attrib +h`
- Linux: Dot-folders auto-hidden
- **Git still tracks it**: Hiding is UI-only

### **Large File Handling**
- Files > 2MB skipped in checkpoints
- Recorded in `skipped_large_files` array
- Prevents performance issues with binaries

### **Burst Detection Customization**
```json
{
  "burst_thresholds": {
    "windowMs": 3000,
    "highEditThreshold": 15
  }
}
```

### **Idle Timeout Customization**
```json
{
  "idle_seconds": 180  // 3 minutes
}
```

---

## **14. Known Limitations & Future Work**

### **Current Limitations**
1. **VS Code only**: Work in other editors not tracked
2. **Local trust**: Student controls data before pushing
3. **Heuristic detection**: Bursts/idle detection can have edge cases
4. **No real-time monitoring**: Instructor sees data only on submission
5. **Git-only**: Requires git repository to function

### **Potential Enhancements**
- Support for other IDEs (IntelliJ, Visual Studio)
- Real-time dashboard for instructors
- Machine learning for anomaly detection
- Code similarity analysis integration
- Multi-language support (currently English)

---

## **15. Summary**

**Moji-Proctor** is a sophisticated academic integrity tool that balances:
- **Student privacy** (no telemetry, local-only)
- **Tamper evidence** (cryptographic hash chaining)
- **Instructor insights** (time tracking, burst detection, unverified changes)
- **Ease of use** (transparent tracking, automated validation)

It's designed as a **deterrent and pedagogical tool**, providing signals for academic integrity discussions rather than absolute proof of cheating. The combination of local extension monitoring and GitHub-based validation creates a transparent, auditable workflow that respects student agency while promoting honest work.

**Key Innovation**: Cryptographic hash chaining transforms local event logs into tamper-evident evidence that can be validated independently by instructors via GitHub Actions—all without compromising student privacy or requiring centralized servers.
