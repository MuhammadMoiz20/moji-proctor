# Moji-Proctor Test Repository

This test repository is designed to test the Moji-Proctor VS Code extension with a realistic assignment scenario.

## What's Included

This repository contains:

- **Assignment Configuration**: Pre-configured `moji-proctor.config.json` and `.verified/assignment.json`
- **Sample Code**: Python and JavaScript files with basic programming tasks
- **Git Repository**: Initialized with proper structure for testing
- **Documentation**: Assignment instructions and README

## How to Use This Test Repository

### 1. Open in VS Code with Extension

```bash
cd test-repo
code .
```

Or open the `test-repo` folder in VS Code directly.

### 2. Run the Extension

The extension should automatically activate when you open the workspace. You should see it tracking your activity.

To verify it's running:
- Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- Type "Moji Proctor" to see available commands

### 3. Test Extension Features

**a) Test Activity Tracking:**
- Edit any of the source files in `src/`
- Create new files
- Delete files
- The extension will track all these activities

**b) Test Idle Detection:**
- Stop typing for 5+ minutes
- The extension should record an idle event

**c) Test Burst Detection:**
- Make rapid edits (paste large amounts of code)
- The extension should detect editing bursts

**d) Test Report Generation:**
- Press `Cmd+Shift+P` / `Ctrl+Shift+P`
- Run "Moji-Proctor: Generate Report"
- Check `.verified/report.json` for the generated report

### 4. Test Submission Workflow

Simulate a student submission:

```bash
# Make some code changes
# Generate the report (using VS Code command)
git add -A
git commit -m "Complete assignment with verification"
git push origin main
```

### 5. Test Online Signals Mode (Optional)

To test with the server running:

1. Make sure the server is running (see `../server/README.md`)
2. Edit `moji-proctor.config.json`:
   ```json
   "online_signals": {
     "enabled": true,
     "server_url": "http://localhost:3000"
   }
   ```
3. Run "Moji-Proctor: Sign In" command
4. Make edits - signals should be uploaded to the server

## Files Included

```
test-repo/
├── .verified/
│   └── assignment.json          # Assignment configuration
├── src/
│   ├── calculator.py            # Python calculator module
│   ├── string_utils.py          # Python string utilities
│   └── array_utils.js           # JavaScript array utilities
├── .gitignore                   # Git ignore rules
├── ASSIGNMENT.md                # Assignment instructions
├── README.md                    # Student submission README
├── TESTING_GUIDE.md            # This file
└── moji-proctor.config.json    # Extension configuration
```

## Expected Extension Behavior

When working in this repository, the extension should:

1. ✅ Detect the `.verified/assignment.json` file
2. ✅ Start tracking edits, file operations, and idle time
3. ✅ Generate event logs in `.verified/events.jsonl`
4. ✅ Create checkpoints in `.verified/checkpoints.jsonl`
5. ✅ Allow report generation via command palette
6. ✅ Track burst activity when you paste code
7. ✅ Record session start/end events

## Troubleshooting

### Extension Not Activating

- Check that you're in the workspace with `.verified/assignment.json`
- Try reloading VS Code: `Cmd+Shift+P` → "Developer: Reload Window"
- Check the extension host console for errors

### No Events Being Recorded

- Verify `.verified/events.jsonl` exists
- Check file permissions
- Make sure you're editing files within the workspace

### Report Generation Fails

- Ensure you have at least one event recorded
- Check `.verified/` directory has write permissions
- Look for error messages in the Output panel

## Testing Scenarios

### Scenario 1: Normal Assignment Workflow
1. Open workspace
2. Edit `calculator.py` to add a new function
3. Test the changes
4. Generate report
5. Commit and "submit"

### Scenario 2: Burst Detection
1. Copy a large block of code from elsewhere
2. Paste it into one of the files
3. Generate report
4. Verify burst flags in the report

### Scenario 3: Idle Time Tracking
1. Make some edits
2. Leave VS Code idle for 6 minutes
3. Make more edits
4. Generate report - should show idle event

### Scenario 4: File Operations
1. Create a new file in `src/`
2. Rename an existing file
3. Delete a file
4. Generate report - should track all operations

## Configuration Details

### Assignment Settings (`.verified/assignment.json`)
- **course_id**: CS101
- **assignment_id**: test-assignment-1
- **idle_seconds**: 300 (5 minutes)
- **submission_mode**: pr (pull request based)

### Extension Settings (`moji-proctor.config.json`)
- **Online signals**: Disabled by default
- **Burst thresholds**: Default values
- **Ignore patterns**: Excludes node_modules, .vscode, etc.

## Next Steps

After testing with this repository, you can:

1. Examine the generated reports in `.verified/`
2. Test the verification GitHub Action (if applicable)
3. Try enabling online signals mode with the server
4. Create additional test scenarios as needed

## Notes

- This is a test environment - feel free to experiment
- The `.verified/` directory will grow with usage
- You can delete `.verified/events.jsonl` and `.verified/checkpoints.jsonl` to reset tracking (keep `assignment.json`)
- Git is initialized but not connected to a remote - add one if needed for PR testing
