# Moji-Proctor — Architecture (MVP)

This document describes the high-level system design and module boundaries.
It exists to keep parallel agents aligned and prevent overlapping or conflicting implementations.

This is NOT an implementation guide. It is a contract.

---

## 1. System Overview

Verified Coursework consists of two cooperating parts:

1) A **VS Code extension (student-side)** that:
   - Observes editing behavior
   - Produces tamper-evident local artifacts under `.verified/`
   - Does NOT upload data or provide AI assistance

2) A **GitHub Action (instructor-side)** that:
   - Validates artifacts on PRs
   - Verifies integrity
   - Publishes a standardized summary for instructors

All trust originates from:
- append-only logs
- hash chaining
- GitHub’s immutable commit history

---

## 2. Data Flow (End-to-End)

1) Workspace opens in VS Code
2) Extension detects assignment repo
3) Session starts → SESSION_START event logged
4) During work:
   - Time tracking emits TIME_* events
   - Burst detector emits BURST_FLAG events
5) Session ends → checkpoint written
6) On next session:
   - Repo compared to last checkpoint
   - UNVERIFIED_CHANGES emitted if needed
7) Student runs “Generate Report”
   - Integrity verified
   - report.json + report.md generated
8) Student commits + opens PR
9) GitHub Action:
   - Validates schema
   - Verifies hash chain
   - Publishes Check Run summary

---

## 3. Repository Layout (Authoritative)

### Extension source

```
src/
  extension.ts # activation, wiring, commands
  services/
    timeTracker.ts # focused/active time + sessions
    burstDetector.ts # rapid edit detection
    checkpointService.ts # manifests + unverified changes
    reportGenerator.ts # report.json + report.md
    integrityService.ts # integrity checks
  storage/
    eventLog.ts # append-only JSONL log + hashing
    checkpointStore.ts # read/write checkpoint files
    reportWriter.ts # write report artifacts
  utils/
    canonicalJson.ts # stable stringify
    hash.ts # sha256 helpers
    ignore.ts # ignore pattern matching
    gitRoot.ts # detect git root
    gitDiff.ts # numstat fallback
  types/
    events.ts
    checkpoints.ts
    report.ts
```


### Student-visible artifacts

```
.verified/
  assignment.json
  log.jsonl
  checkpoints/
    checkpoint-<id>.json
  report.json
  report.md
```


### Dev-only docs

```
.verified-dev/
  AGENTS.md
  WORKFLOW.md
  CONTRACTS.md
  ARCHITECTURE.md
  TESTING.md
```


---

## 4. Core Design Principles

### 4.1 No Central Authority
- No servers
- No telemetry
- No uploads
- All verification happens via GitHub

### 4.2 Append-only, Tamper-evident
- Events are never edited or deleted
- Hash chaining links all events
- Checkpoints embed log head hash
- Integrity failure is a *first-class signal*

### 4.3 Best-effort, Non-blocking
- Extension must never block editing
- Failures result in flags, not crashes
- Reports must still generate even if integrity is compromised

---

## 5. Module Responsibilities (Hard Boundaries)

### extension.ts
**Owns**
- Activation / deactivation
- Status bar
- Command registration
- Wiring services together

**Does NOT**
- Implement logic
- Write files directly
- Perform hashing or analysis

---

### eventLog.ts
**Owns**
- appendEvent()
- hash chaining
- reading/verifying logs

**Single source of truth** for:
- prev_hash
- hash generation
- canonical JSON rules

No other module computes event hashes.

---

### timeTracker.ts
**Owns**
- Focused time
- Active time
- Idle detection
- Session lifecycle

**Emits**
- SESSION_START
- SESSION_END
- TIME_TICK (or aggregated)

---

### burstDetector.ts
**Owns**
- Rolling window logic
- Severity classification
- Burst event structure

**Consumes**
- TextDocument change events
- Idle state (direct or via signal)

**Emits**
- BURST_FLAG

---

### checkpointService.ts
**Owns**
- File manifests (path + sha256 + size)
- Writing checkpoints
- Detecting unverified changes

**Emits**
- CHECKPOINT_CREATED
- UNVERIFIED_CHANGES

---

### integrityService.ts
**Owns**
- Hash chain verification
- Missing log/checkpoint detection

**Emits**
- INTEGRITY_COMPROMISED

---

### reportGenerator.ts
**Owns**
- Aggregating data from:
  - logs
  - checkpoints
- Producing final report artifacts

**Consumes**
- eventLog
- checkpointStore
- integrityService

---

## 6. Trust & Threat Model (MVP)

### We detect:
- Large edits in short time
- Edits while telemetry inactive
- Missing or broken logs
- Checkpoint mismatches

### We do NOT claim to prevent:
- Manual log deletion
- Full repo recreation
- Sophisticated adversaries

The goal is **signal**, not perfect enforcement.

---

## 7. GitHub Action Alignment

The GitHub Action MUST:
- Use the same canonical JSON rules
- Use the same hash algorithm
- Treat integrity failures as visible signals

Any change here requires coordination.

---

## 8. What This File Is NOT

- Not a coding guide
- Not a spec for thresholds
- Not a user-facing doc
- Not allowed to drift casually

If this file changes, agents must be notified.

---
