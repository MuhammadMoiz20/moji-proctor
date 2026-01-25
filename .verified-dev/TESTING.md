# Testing

## Required per PR
- `npm run build` (must pass)
- Unit tests for your module if a test runner exists

## Manual test checklist (extension)
- Open repo WITH `.verified/assignment.json`
- Verify status bar shows Active
- Make edits, wait idle, confirm active time stops
- Trigger bursts by rapid large edits
- Close VS Code, change a file externally, reopen -> unverified changes flagged
- Run "Generate Report" -> verify report.json + report.md written
