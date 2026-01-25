/**
 * JSON Schemas for validating Verified Coursework data
 *
 * Matches the type definitions in src/types/ of the extension
 */
/**
 * Event envelope schema for .verified/log.jsonl
 */
export declare const eventEnvelopeSchema: {
    readonly type: "object";
    readonly required: readonly ["event_id", "ts", "session_id", "type", "payload", "prev_hash", "hash"];
    readonly properties: {
        readonly event_id: {
            readonly type: "string";
            readonly format: "uuid";
        };
        readonly ts: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly session_id: {
            readonly type: "string";
            readonly format: "uuid";
        };
        readonly type: {
            readonly type: "string";
            readonly enum: readonly ["SESSION_START", "SESSION_END", "TIME_TICK", "BURST_FLAG", "CHECKPOINT_CREATED", "UNVERIFIED_CHANGES", "INTEGRITY_COMPROMISED"];
        };
        readonly payload: true;
        readonly prev_hash: {
            readonly oneOf: readonly [{
                readonly type: "string";
            }, {
                readonly type: "null";
            }];
        };
        readonly hash: {
            readonly type: "string";
        };
    };
    readonly additionalProperties: false;
};
/**
 * Machine report schema for .verified/report.json
 */
export declare const machineReportSchema: {
    readonly type: "object";
    readonly required: readonly ["schema_version", "generated_at", "assignment_id", "session_id", "integrity", "time", "bursts", "checkpoints", "unverified_changes"];
    readonly properties: {
        readonly schema_version: {
            readonly const: "0.1.0";
        };
        readonly generated_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly assignment_id: {
            readonly type: "string";
        };
        readonly session_id: {
            readonly type: "string";
        };
        readonly integrity: {
            readonly type: "object";
            readonly required: readonly ["passed", "issues"];
            readonly properties: {
                readonly passed: {
                    readonly type: "boolean";
                };
                readonly issues: {
                    readonly type: "array";
                    readonly items: {
                        readonly type: "object";
                        readonly required: readonly ["type", "description"];
                        readonly properties: {
                            readonly type: {
                                readonly type: "string";
                                readonly enum: readonly ["missing_log", "broken_hash_chain", "missing_checkpoint", "missing_assignment"];
                            };
                            readonly description: {
                                readonly type: "string";
                            };
                            readonly event_id: {
                                readonly type: "string";
                            };
                        };
                    };
                };
            };
        };
        readonly time: {
            readonly type: "object";
            readonly required: readonly ["total_focused_seconds", "total_active_seconds", "session_count"];
            readonly properties: {
                readonly total_focused_seconds: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
                readonly total_active_seconds: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
                readonly session_count: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
                readonly first_session_start: {
                    readonly oneOf: readonly [{
                        readonly type: "string";
                        readonly format: "date-time";
                    }, {
                        readonly type: "null";
                    }];
                };
                readonly last_session_end: {
                    readonly oneOf: readonly [{
                        readonly type: "string";
                        readonly format: "date-time";
                    }, {
                        readonly type: "null";
                    }];
                };
            };
        };
        readonly bursts: {
            readonly type: "object";
            readonly required: readonly ["total_count", "by_severity"];
            readonly properties: {
                readonly total_count: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
                readonly by_severity: {
                    readonly type: "object";
                    readonly required: readonly ["low", "medium", "high"];
                    readonly properties: {
                        readonly low: {
                            readonly type: "number";
                            readonly minimum: 0;
                        };
                        readonly medium: {
                            readonly type: "number";
                            readonly minimum: 0;
                        };
                        readonly high: {
                            readonly type: "number";
                            readonly minimum: 0;
                        };
                    };
                };
            };
        };
        readonly checkpoints: {
            readonly type: "object";
            readonly required: readonly ["count"];
            readonly properties: {
                readonly count: {
                    readonly type: "number";
                    readonly minimum: 0;
                };
                readonly latest_checkpoint_id: {
                    readonly oneOf: readonly [{
                        readonly type: "string";
                    }, {
                        readonly type: "null";
                    }];
                };
            };
        };
        readonly unverified_changes: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["path", "change_type", "detected_after_checkpoint"];
                readonly properties: {
                    readonly path: {
                        readonly type: "string";
                    };
                    readonly change_type: {
                        readonly type: "string";
                        readonly enum: readonly ["added", "modified", "deleted"];
                    };
                    readonly detected_after_checkpoint: {
                        readonly type: "string";
                    };
                };
            };
        };
    };
    readonly additionalProperties: false;
};
/**
 * Assignment metadata schema for .verified/assignment.json
 */
export declare const assignmentSchema: {
    readonly type: "object";
    readonly required: readonly ["assignment_id", "assignment_name", "created_at"];
    readonly properties: {
        readonly assignment_id: {
            readonly type: "string";
        };
        readonly assignment_name: {
            readonly type: "string";
        };
        readonly created_at: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly expected_files: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
        readonly hide_verified_folder: {
            readonly type: "boolean";
        };
    };
    readonly additionalProperties: false;
};
