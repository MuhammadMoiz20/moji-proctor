# Contracts Freeze (Do Not Change Without Coordination)

## File locations (MVP)
- `.verified/assignment.json` — assignment metadata (committed)
- `.verified/log.jsonl` — append-only event log
- `.verified/checkpoints/*.json` — checkpoint manifests (keep last 10)
- `.verified/report.json` — machine report
- `.verified/report.md` — human report

## Event envelope (JSONL lines)
Every event line MUST include:
- event_id: string (uuid)
- ts: string (ISO)
- session_id: string (uuid)
- type: string
- payload: object
- prev_hash: string | null
- hash: string (sha256)

Hash rule:
hash = sha256( canonicalJson({event_id, ts, session_id, type, payload, prev_hash}) )

## Canonical JSON
- Stable stringify with sorted object keys.
- Arrays preserve order.
- No whitespace differences allowed.

## Report schema version
- schema_version: "0.1.0" (bump only with coordination)
