/**
 * JSON Schemas for validating Verified Coursework data
 *
 * Matches the type definitions in src/types/ of the extension
 */

/**
 * Event envelope schema for .verified/log.jsonl
 */
export const eventEnvelopeSchema = {
  type: 'object',
  required: ['event_id', 'ts', 'session_id', 'type', 'payload', 'prev_hash', 'hash'],
  properties: {
    event_id: { type: 'string', format: 'uuid' },
    ts: { type: 'string', format: 'date-time' },
    session_id: { type: 'string', format: 'uuid' },
    type: {
      type: 'string',
      enum: [
        'SESSION_START',
        'SESSION_END',
        'TIME_TICK',
        'BURST_FLAG',
        'CHECKPOINT_CREATED',
        'UNVERIFIED_CHANGES',
        'INTEGRITY_COMPROMISED'
      ]
    },
    payload: true, // Any object
    prev_hash: { oneOf: [{ type: 'string' }, { type: 'null' }] },
    hash: { type: 'string' }
  },
  additionalProperties: false
} as const;

/**
 * Machine report schema for .verified/report.json
 */
export const machineReportSchema = {
  type: 'object',
  required: [
    'schema_version',
    'generated_at',
    'assignment_id',
    'session_id',
    'integrity',
    'time',
    'bursts',
    'checkpoints',
    'unverified_changes'
  ],
  properties: {
    schema_version: { const: '0.1.0' },
    generated_at: { type: 'string', format: 'date-time' },
    assignment_id: { type: 'string' },
    session_id: { type: 'string' },
    integrity: {
      type: 'object',
      required: ['passed', 'issues'],
      properties: {
        passed: { type: 'boolean' },
        issues: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'description'],
            properties: {
              type: {
                type: 'string',
                enum: ['missing_log', 'broken_hash_chain', 'missing_checkpoint', 'missing_assignment']
              },
              description: { type: 'string' },
              event_id: { type: 'string' }
            }
          }
        }
      }
    },
    time: {
      type: 'object',
      required: ['total_focused_seconds', 'total_active_seconds', 'session_count'],
      properties: {
        total_focused_seconds: { type: 'number', minimum: 0 },
        total_active_seconds: { type: 'number', minimum: 0 },
        session_count: { type: 'number', minimum: 0 },
        first_session_start: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
        last_session_end: { oneOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
      }
    },
    bursts: {
      type: 'object',
      required: ['total_count', 'by_severity'],
      properties: {
        total_count: { type: 'number', minimum: 0 },
        by_severity: {
          type: 'object',
          required: ['low', 'medium', 'high'],
          properties: {
            low: { type: 'number', minimum: 0 },
            medium: { type: 'number', minimum: 0 },
            high: { type: 'number', minimum: 0 }
          }
        }
      }
    },
    checkpoints: {
      type: 'object',
      required: ['count'],
      properties: {
        count: { type: 'number', minimum: 0 },
        latest_checkpoint_id: { oneOf: [{ type: 'string' }, { type: 'null' }] }
      }
    },
    unverified_changes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['path', 'change_type', 'detected_after_checkpoint'],
        properties: {
          path: { type: 'string' },
          change_type: { type: 'string', enum: ['added', 'modified', 'deleted'] },
          detected_after_checkpoint: { type: 'string' }
        }
      }
    }
  },
  additionalProperties: false
} as const;

/**
 * Assignment metadata schema for .verified/assignment.json
 */
export const assignmentSchema = {
  type: 'object',
  required: ['assignment_id', 'assignment_name', 'created_at'],
  properties: {
    assignment_id: { type: 'string' },
    assignment_name: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    expected_files: {
      type: 'array',
      items: { type: 'string' }
    },
    hide_verified_folder: { type: 'boolean' }
  },
  additionalProperties: false
} as const;
