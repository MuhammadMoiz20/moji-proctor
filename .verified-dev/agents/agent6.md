# Agent 6: GitHub Action for Verified Coursework Validation

**Branch:** `agent/action/verified-coursework`
**Status:** Complete
**Agent:** Agent 6

## Scope Delivered

- GitHub Action to validate and publish Verified Coursework reports
- JSON schema validation using ajv for report.json, log.jsonl, and assignment.json
- Hash chain verification matching extension canonicalization
- GitHub Check Run creation with detailed validation summary
- Artifact upload for .verified/ directory
- Optional PR comment with report.md (updates existing comment)
- Reusable workflow template for easy integration

## File Tree Modified/Created

```
.github/
  actions/
    verified-coursework/
      action.yml           # Action metadata and inputs/outputs
      package.json         # Node.js dependencies
      tsconfig.json        # TypeScript configuration
      src/
        index.ts           # Main action entry point
        validator.ts       # Core validation logic
        types.ts           # TypeScript type definitions
        schemas.ts         # JSON schemas for validation
        utils.ts           # Utility functions (hash, canonical JSON)
  workflows/
    verified-coursework.yml # Workflow template
.verified-dev/
  agents/
    agent6.md             # This file
```

## Implementation Details

### Action Architecture

The action is a composite Node.js action that:

1. **Reads** `.verified/report.json` and `.verified/log.jsonl`
2. **Validates** schemas using ajv (JSON Schema validator)
3. **Verifies** hash chain integrity using the same canonicalization as the extension
4. **Posts** a Check Run summary to GitHub
5. **Uploads** `.verified/` directory as an artifact
6. **Optionally posts** a PR comment with the report

### Validation Logic

#### Schema Validation

Uses `ajv` to validate:
- **Event envelopes** - Each line in `log.jsonl` must match the event schema
- **Machine report** - `report.json` must match the report schema (v0.1.0)
- **Assignment metadata** - `assignment.json` must match assignment schema

#### Hash Chain Verification

The action verifies the hash chain using the **exact same algorithm** as the extension:

```typescript
// For each event in log.jsonl:
eventForHash = {
  event_id: event.event_id,
  ts: event.ts,
  session_id: event.session_id,
  type: event.type,
  payload: event.payload,
  prev_hash: event.prev_hash
}
computedHash = sha256(canonicalJson(eventForHash))

// Verify:
// 1. event.hash === computedHash
// 2. event.prev_hash === previousEvent.hash
```

This ensures that any tampering with the log is detected.

### Check Run Output

The action creates a GitHub Check Run with:

- **Status**: `completed`
- **Conclusion**: `success` or `failure`
- **Summary** including:
  - Overall integrity status
  - Hash chain verification details
  - Time statistics (focused/active time, session count)
  - Burst detection summary
  - Unverified changes
  - Integrity issues (if any)

### PR Comment Behavior

When enabled, the action:
1. **Looks for** an existing comment with the marker `<!-- verified-coursework-report -->`
2. **Updates** the existing comment if found
3. **Creates** a new comment if not found

This prevents spam when multiple pushes occur on the same PR.

## Setup Instructions

### 1. Add the Action to Your Repository

Copy the `.github/actions/verified-coursework/` directory to your repository.

### 2. Enable the Workflow

The workflow template at `.github/workflows/verified-coursework.yml` is ready to use.
It triggers on:
- Push to `main`/`master` branches
- Pull requests
- Manual workflow dispatch

### 3. Configure Permissions

Ensure your repository has these permissions enabled (the workflow sets them):

```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
  actions: read
```

### 4. Build the Action

From the action directory:

```bash
cd .github/actions/verified-coursework
npm install
npm run build
```

This compiles the TypeScript and bundles it with `@vercel/ncc`.

## Testing Instructions

### Local Testing with `act`

Install [act](https://github.com/nektos/act) to run GitHub Actions locally:

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run the workflow
cd /path/to/your/repo
act pull_request
```

### Manual Testing

1. **Create test data** in a test repository:
   ```bash
   mkdir -p .verified
   # Copy your report.json, log.jsonl, etc.
   ```

2. **Push to GitHub** and observe the workflow run

3. **Check the Actions tab** for the workflow results

4. **Verify the Check Run** appears with correct status

5. **If in a PR**, verify the comment is posted/updated

### Unit Testing

To add unit tests for the validator:

```bash
cd .github/actions/verified-coursework
npm install --save-dev jest @types/jest ts-jest
```

Create `src/validator.test.ts`:

```typescript
import { Validator } from './validator';

describe('Validator', () => {
  // TODO: Add tests for:
  // - Schema validation
  // - Hash chain verification
  // - Report consistency checks
});
```

## Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `verified-path` | No | `.verified` | Path to .verified directory |
| `fail-on-integrity-issues` | No | `true` | Whether to fail the workflow on integrity issues |
| `post-pr-comment` | No | `true` | Whether to post report as PR comment |
| `token` | Yes | `${{ github.token }}` | GitHub token for API calls |

## Action Outputs

| Output | Description |
|--------|-------------|
| `status` | Validation result (`passed` or `failed`) |
| `integrity_passed` | Whether integrity checks passed (`"true"` or `"false"`) |
| `report-url` | URL to the uploaded artifact |

## Contract Freeze

The following are FROZEN and require coordination to change:

1. **Event envelope structure** - defined in `.verified-dev/CONTRACTS.md`
2. **Hash algorithm** - SHA-256
3. **Canonical JSON rules** - keys sorted, no extra whitespace
4. **Hash rule** - `hash = sha256(canonicalJson({event_id, ts, session_id, type, payload, prev_hash}))`
5. **Report schema version** - `0.1.0`

## Known Limitations

1. **Node.js 20 required**: The action uses Node.js 20 runtime. Older runners may not be compatible.

2. **Large logs**: For very large log files (>10MB), memory usage may be high. Consider streaming processing for production at scale.

3. **No automatic repair**: The action detects issues but doesn't attempt to repair them. This is intentional - repair decisions should be made by instructors.

4. **Comment updates**: PR comments are only updated if the marker is found. If a previous comment was edited to remove the marker, a new comment will be created.

## Integration Notes for Instructors

### Adding to Class Repository Template

Add the workflow to your assignment template:

```bash
# Copy files
cp -r .github/actions/verified-coursework/ /path/to/template/.github/actions/
cp .github/workflows/verified-coursework.yml /path/to/template/.github/workflows/
```

### Customizing the Workflow

Edit `.github/workflows/verified-coursework.yml`:

```yaml
- name: Run Verified Coursework Validator
  uses: ./.github/actions/verified-coursework
  with:
    verified-path: '.verified'  # Change if using different path
    fail-on-integrity-issues: 'true'  # Set to 'false' for warnings only
    post-pr-comment: 'true'  # Set to 'false' to disable comments
```

### Viewing Results

1. **Check the Actions tab** in your repository
2. **Click on the workflow run** to see the full summary
3. **View the Check Run** on commits/PRs
4. **Download artifacts** for full .verified/ data

## PR Description Template

```markdown
## What Changed

- Created GitHub Action for Verified Coursework validation
- Implemented JSON schema validation using ajv
- Implemented hash chain verification matching extension canonicalization
- Added Check Run creation with detailed summary
- Added artifact upload for .verified/ directory
- Added optional PR comment with report.md (updates existing)
- Created reusable workflow template

## How to Test

1. Build the action:
   ```bash
   cd .github/actions/verified-coursework
   npm install
   npm run build
   ```

2. Test locally with act (if installed):
   ```bash
   act pull_request
   ```

3. Test in a real repository:
   - Push to a branch with .verified/ data
   - Open a PR
   - Verify the workflow runs and creates a Check Run
   - Verify the PR comment is posted/updated

## New Files

- `.github/actions/verified-coursework/action.yml`
- `.github/actions/verified-coursework/package.json`
- `.github/actions/verified-coursework/tsconfig.json`
- `.github/actions/verified-coursework/src/index.ts`
- `.github/actions/verified-coursework/src/validator.ts`
- `.github/actions/verified-coursework/src/types.ts`
- `.github/actions/verified-coursework/src/schemas.ts`
- `.github/actions/verified-coursework/src/utils.ts`
- `.github/workflows/verified-coursework.yml`
- `.verified-dev/agents/agent6.md`
```
