# Moji-Proctor

A Verified Coursework extension for VS Code that tracks student coding activity and generates tamper-evident reports for academic integrity verification.

## Overview

Moji-Proctor is a VS Code extension that monitors coding activity during assignment work, creating a cryptographically linked chain of events (edits, file operations, idle periods) that can be verified by instructors. It includes a GitHub Action for automated report verification in PR-based submission workflows.

**Privacy First**: This extension has **no telemetry** and makes **no network calls**. All data is stored locally in the `.verified/` directory within your workspace.

## Quick Start

### Installing and Running the Extension

1. **Build the extension:**
   ```bash
   npm install
   npm run compile
   ```

2. **Run in VS Code Extension Host:**
   - Press `F5` in VS Code
   - This opens a new VS Code window with the extension loaded
   - The extension will start tracking activity automatically

### Setting Up Your Assignment

Create a `.verified/assignment.json` file at your workspace root (git root):

```json
{
  "course_id": "CS101",
  "assignment_id": "homework-1",
  "ignore": [
    "node_modules/**",
    ".vscode/**"
  ],
  "idle_seconds": 300,
  "submission_mode": "pr"
}
```

**Required fields:**
- `course_id`: Course identifier (string)
- `assignment_id`: Assignment identifier (string)

**Optional fields:**
- `ignore`: Array of glob patterns to exclude from tracking
- `idle_seconds`: Seconds of inactivity before idle event is recorded (default: 300)
- `submission_mode`: Submission mode, e.g., "pr" for pull-request based
- `burst_thresholds`: Custom thresholds for burst detection
- `hide_verified_folder`: Whether to hide the `.verified/` folder in Explorer/Finder (default: `true`)

### Generating a Report

Use the VS Code command palette to generate your report:

1. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
2. Run **"Moji-Proctor: Generate Report"**
3. The report will be created in `.verified/report.json`

The report contains:
- Session summary with total time, active time, edit counts
- Chronological event log (edits, file operations, idle periods)
- Cryptographic hash chain for tamper detection

### Submitting Your Work

1. **Stage and commit the `.verified/` directory:**
   ```bash
   git add .verified/
   git commit -m "Add coursework report"
   ```

2. **Push and create a PR:**
   ```bash
   git push origin your-branch
   ```
   Then create a pull request on GitHub.

3. **The GitHub Action will:**
   - Verify the hash chain integrity
   - Check that `assignment.json` is valid
   - Report results as a check on your PR

## GitHub Action Setup

The workflow template is at `.github/workflows/verify-coursework.yml`.

To enable verification for your repository:

1. Ensure the workflow file exists in your repository
2. Enable GitHub Actions in your repository settings
3. The action runs automatically on new pull requests

**What the check shows:**
- ✅ Hash chain is valid
- ✅ Assignment configuration is valid
- ❌ Or specific issues found (missing data, broken chain, etc.)

## DB Logging (Action-Only)

The GitHub Action can optionally write validated submission records to a remote database. This is **Action-only** — the extension never writes to any remote database, preserving the privacy-first design.

### Setup

**Important**: The extension does NOT write to the remote DB. Only the GitHub Action writes after validation succeeds.

#### Supabase (Recommended)

1. Create a Supabase project and table with this schema:

```sql
CREATE TABLE verified_reports (
  repo TEXT NOT NULL,
  pr_number INTEGER,
  commit_sha TEXT NOT NULL,
  course_id TEXT,
  assignment_id TEXT,
  generated_at TIMESTAMPTZ,
  focused_ms BIGINT,
  active_ms BIGINT,
  sessions_count INTEGER,
  bursts_low INTEGER,
  bursts_medium INTEGER,
  bursts_high INTEGER,
  bursts_total INTEGER,
  unverified BOOLEAN,
  unverified_count INTEGER,
  integrity_compromised BOOLEAN,
  hash_chain_ok BOOLEAN,
  continuity_ok BOOLEAN,
  last_log_hash TEXT,
  workflow_run_url TEXT,
  artifact_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (repo, pr_number, commit_sha)
);
```

2. Add these secrets to your GitHub repository:
   - `VERIFIED_DB_MODE=supabase`
   - `SUPABASE_URL=your-supabase-url`
   - `SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`
   - `SUPABASE_TABLE=verified_reports` (optional, defaults to `verified_reports`)

#### Webhook (Generic)

Add these secrets to your GitHub repository:
   - `VERIFIED_DB_MODE=webhook`
   - `VERIFIED_WEBHOOK_URL=your-webhook-endpoint`
   - `VERIFIED_WEBHOOK_BEARER=your-optional-bearer-token`

#### Optional: Strict Mode

Add `STRICT_DB_WRITE=true` to fail the entire check if DB write fails (default: best-effort warning).

## Hidden Folder Behavior

The `.verified/` folder may be hidden in Windows Explorer and macOS Finder for cleanliness. This is controlled by the `hide_verified_folder` option in `assignment.json` (default: `true`).

- **macOS**: The folder is already hidden by default (dot-folder). Additionally, `chflags hidden` is set for extra measure.
- **Windows**: The `attrib +h` attribute is set to hide the folder.
- **Linux**: Dot-folders are already hidden in file managers.

Hiding does **not** affect git — the folder remains tracked and commitable. If hiding fails (permissions, filesystem issues), the extension continues silently.

## Known Limitations

This tool provides **signals**, not **proofs**:

- **Logs can be deleted or modified**: A determined student could tamper with local logs before submission
- **No server-side verification**: Without a central server, students control their own data
- **Rate limiting is approximate**: Burst detection uses heuristics that may have edge cases
- **Only tracks VS Code activity**: Work done outside the tracked environment is not recorded

This tool is designed for **deterrence** and **pedagogical value**, not as an unbeatable anti-cheating system.

## Development

- **Install:** `npm install`
- **Compile:** `npm run compile`
- **Test:** `npm test`
- **Lint:** `npm run lint`
- **Build:** `vsce package` (requires vsce)

## License

See LICENSE file for details.
